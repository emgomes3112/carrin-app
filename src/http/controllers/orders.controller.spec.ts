import { app } from '../../app.js';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { OrderStatus } from '@prisma/client';

describe('Orders and Order Items Flow', () => {
  let clientToken: string;
  let partnerToken1: string;
  let partnerToken2: string;

  let clientId: string;
  let partnerId1: string;
  let partnerId2: string;

  let supermarketId: string;
  let catalogProductId: string;

  beforeAll(async () => {
    await app.ready();

    // Reset DB for tests
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.supermarket.deleteMany();
    await prisma.catalogProduct.deleteMany();
    await prisma.partnerProfile.deleteMany();
    await prisma.user.deleteMany();

    // Create client
    const clientRes = await request(app.server).post('/auth/register').send({
      name: 'Client Tester',
      email: 'client@test.com',
      password: 'password123',
      phone: '11999999999',
      documentCpf: '12345678901',
      userType: 'CLIENT'
    });
    const loginClient = await request(app.server).post('/auth/login').send({ email: 'client@test.com', password: 'password123' });
    clientToken = loginClient.body.token;
    clientId = loginClient.body.user.id;

    // Create Partner 1
    const partner1Res = await request(app.server).post('/auth/register').send({
      name: 'Partner Tester 1',
      email: 'partner1@test.com',
      password: 'password123',
      phone: '11999999998',
      documentCpf: '12345678902',
      userType: 'PARTNER',
      bankAgency: '0001',
      bankAccount: '12345-6',
      pixKey: '123'
    });
    const loginPartner1 = await request(app.server).post('/auth/login').send({ email: 'partner1@test.com', password: 'password123' });
    partnerToken1 = loginPartner1.body.token;
    partnerId1 = loginPartner1.body.user.id;

    // Create Partner 2
    const partner2Res = await request(app.server).post('/auth/register').send({
      name: 'Partner Tester 2',
      email: 'partner2@test.com',
      password: 'password123',
      phone: '11999999997',
      documentCpf: '12345678903',
      userType: 'PARTNER',
      bankAgency: '0001',
      bankAccount: '12345-7',
      pixKey: '124'
    });
    const loginPartner2 = await request(app.server).post('/auth/login').send({ email: 'partner2@test.com', password: 'password123' });
    partnerToken2 = loginPartner2.body.token;
    partnerId2 = loginPartner2.body.user.id;

    const supermarket = await prisma.supermarket.create({
      data: {
        name: 'Super Market Test',
        address: 'Test Street 1',
        latitude: 0,
        longitude: 0,
      }
    });
    supermarketId = supermarket.id;

    const product = await prisma.catalogProduct.create({
      data: {
        name: 'Banana',
        category: 'Fruits',
      }
    });
    catalogProductId = product.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should not allow creating an order with less than 10 items', async () => {
    const res = await request(app.server)
      .post('/orders')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        supermarketId,
        items: [{ customName: 'Test Item', quantity: 1 }],
      });
    expect(res.status).toBe(400); // Zod min(10) handles it
  });

  let createdOrderId: string;

  it('should create an order correctly and calculate fees', async () => {
    const items = Array(12).fill(null).map((_, i) => ({ customName: `Item ${i}`, quantity: 1 }));

    const res = await request(app.server)
      .post('/orders')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        supermarketId,
        hasCheckoutAssistance: true,
        items,
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe(OrderStatus.CREATED);

    // 10-25 items = R$ 5 base fee. + Checkout = R$ 5 -> total 10
    expect(res.body.order.baseFee).toBe('5');
    expect(res.body.order.servicesFee).toBe('5');
    expect(res.body.order.totalFee).toBe('10');

    createdOrderId = res.body.order.id;
  });

  let createdOrderItemId: string;

  it('client should be able to add an item before accept', async () => {
    const res = await request(app.server)
      .post(`/orders/${createdOrderId}/items`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        customName: 'Added Later',
        quantity: 2
      });

    expect(res.status).toBe(201);
    createdOrderItemId = res.body.item.id;
  });

  it('client should be able to edit an item before accept', async () => {
    const res = await request(app.server)
      .patch(`/orders/${createdOrderId}/items/${createdOrderItemId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.item.quantity).toBe(5);
  });

  it('should list available orders for partners only in PAID_WAITING_PARTNER', async () => {
    const resEmpty = await request(app.server)
      .get('/orders/available')
      .set('Authorization', `Bearer ${partnerToken1}`);
    expect(resEmpty.status).toBe(200);
    expect(resEmpty.body.orders.length).toBe(0); // Status is CREATED

    // Admin/Sys sets status to PAID_WAITING_PARTNER (mocking)
    await request(app.server)
      .post(`/orders/${createdOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${clientToken}`); // in dev anyone can call this if they have the ID

    const resAvailable = await request(app.server)
      .get('/orders/available')
      .set('Authorization', `Bearer ${partnerToken1}`);
    expect(resAvailable.body.orders.length).toBe(1);
    expect(resAvailable.body.orders[0].id).toBe(createdOrderId);
  });

  it('should accept the order and block concurrent acceptance', async () => {
    // Partner 1 tries to accept
    const accept1 = await request(app.server)
      .post(`/orders/${createdOrderId}/accept`)
      .set('Authorization', `Bearer ${partnerToken1}`);

    expect(accept1.status).toBe(200);
    expect(accept1.body.order.status).toBe(OrderStatus.ACCEPTED);
    expect(accept1.body.order.partnerId).toBe(partnerId1);

    // Partner 2 tries to accept the same order
    const accept2 = await request(app.server)
      .post(`/orders/${createdOrderId}/accept`)
      .set('Authorization', `Bearer ${partnerToken2}`);

    expect(accept2.status).toBe(400); // Invalid transition now, or 409 if we hit the concurrency lock in the same millisecond
  });

  it('should block client from adding item after accept', async () => {
    const res = await request(app.server)
      .post(`/orders/${createdOrderId}/items`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ customName: 'Blocked', quantity: 1 });

    expect(res.status).toBe(409); // OrderListLockedError
  });

  it('should follow state machine up to completion', async () => {
    // ACCEPTED -> PICKING
    const picking = await request(app.server)
      .post(`/orders/${createdOrderId}/start-picking`)
      .set('Authorization', `Bearer ${partnerToken1}`);
    expect(picking.status).toBe(200);

    // Update item status in PICKING
    const updateItem = await request(app.server)
      .patch(`/orders/${createdOrderId}/items/${createdOrderItemId}/status`)
      .set('Authorization', `Bearer ${partnerToken1}`)
      .send({ status: 'FOUND', unitPrice: 2.50 });
    expect(updateItem.status).toBe(200);

    // PICKING -> WAITING_HANDOFF
    const finishPicking = await request(app.server)
      .post(`/orders/${createdOrderId}/finish-picking`)
      .set('Authorization', `Bearer ${partnerToken1}`);
    expect(finishPicking.status).toBe(200);

    // Need Pincode for handoff
    const orderInDb = await prisma.order.findUnique({ where: { id: createdOrderId } });
    const pincode = orderInDb?.pincode;

    // WAITING_HANDOFF -> HANDED_OVER
    const handoff = await request(app.server)
      .post(`/orders/${createdOrderId}/handoff`)
      .set('Authorization', `Bearer ${partnerToken1}`)
      .send({ pincode });
    expect(handoff.status).toBe(200);

    // HANDED_OVER -> IN_CHECKOUT (Because hasCheckoutAssistance is true)
    const checkout = await request(app.server)
      .post(`/orders/${createdOrderId}/go-to-checkout`)
      .set('Authorization', `Bearer ${partnerToken1}`);
    expect(checkout.status).toBe(200);

    // IN_CHECKOUT -> COMPLETED
    const complete = await request(app.server)
      .post(`/orders/${createdOrderId}/complete`)
      .set('Authorization', `Bearer ${partnerToken1}`);
    expect(complete.status).toBe(200);
  });
});
