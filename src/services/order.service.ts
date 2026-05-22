import { OrderStatus, Prisma, OrderItemStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  InvalidOrderTransitionError,
  MinimumOrderItemsError,
  OrderAccessDeniedError,
  OrderAlreadyAcceptedError,
  InvalidHandoffPinError,
  OrderListLockedError,
  OrderNotFoundError,
  OrderItemNotFoundError,
} from '../errors/domain-errors.js';
import crypto from 'crypto';

export const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['PAID_WAITING_PARTNER', 'CANCELLED'],
  PAID_WAITING_PARTNER: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PICKING', 'CANCELLED'],
  PICKING: ['WAITING_HANDOFF', 'CANCELLED'],
  WAITING_HANDOFF: ['HANDED_OVER', 'CANCELLED'],
  HANDED_OVER: ['IN_CHECKOUT', 'COMPLETED'],
  IN_CHECKOUT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

interface FeeCalculationResult {
  baseFee: Prisma.Decimal;
  servicesFee: Prisma.Decimal;
  totalFee: Prisma.Decimal;
}

export function calculateOrderFees(itemCount: number, options: { hasCheckoutAssistance: boolean; hasPackagingAssistance: boolean }): FeeCalculationResult {
  let baseFee: number;
  if (itemCount >= 10 && itemCount <= 25) {
    baseFee = 5;
  } else if (itemCount >= 26 && itemCount <= 40) {
    baseFee = 8;
  } else if (itemCount >= 41) {
    baseFee = 13;
  } else {
    // We should enforce MinimumOrderItemsError before calling this, but safe fallback
    baseFee = 0;
  }

  let servicesFee = 0;
  if (options.hasCheckoutAssistance) servicesFee += 5;
  if (options.hasPackagingAssistance) servicesFee += 2;

  const totalFee = baseFee + servicesFee;

  return {
    baseFee: new Prisma.Decimal(baseFee),
    servicesFee: new Prisma.Decimal(servicesFee),
    totalFee: new Prisma.Decimal(totalFee),
  };
}

function generatePincode() {
  return crypto.randomInt(1000, 9999).toString();
}

export class OrderService {
  async createOrder({
    clientId,
    supermarketId,
    items,
    hasCheckoutAssistance = false,
    hasPackagingAssistance = false,
  }: {
    clientId: string;
    supermarketId: string;
    items: { catalogProductId?: string; customName?: string; quantity: number }[];
    hasCheckoutAssistance?: boolean;
    hasPackagingAssistance?: boolean;
  }) {
    // Filter active items (assuming all provided here are active to start)
    const activeItemCount = items.length;
    if (activeItemCount < 10) {
      throw new MinimumOrderItemsError();
    }

    const fees = calculateOrderFees(activeItemCount, { hasCheckoutAssistance, hasPackagingAssistance });

    return prisma.order.create({
      data: {
        clientId,
        supermarketId,
        status: OrderStatus.CREATED,
        baseFee: fees.baseFee,
        servicesFee: fees.servicesFee,
        totalFee: fees.totalFee,
        hasCheckoutAssistance,
        hasPackagingAssistance,
        pincode: generatePincode(), // Initial PIN, we might regenerate it on FINISH_PICKING but requirements say to keep it compatible if it's there
        items: {
          create: items.map(item => ({
            catalogProductId: item.catalogProductId ?? null,
            customName: item.customName ?? null,
            quantity: item.quantity,
            barcodeMatched: false,
          }))
        }
      },
      include: {
        items: true,
      }
    });
  }

  async getMyOrders(userId: string, userType: 'CLIENT' | 'PARTNER') {
    if (userType === 'CLIENT') {
      return prisma.order.findMany({ where: { clientId: userId } });
    } else {
      return prisma.order.findMany({ where: { partnerId: userId, status: { in: ['ACCEPTED', 'PICKING', 'WAITING_HANDOFF', 'HANDED_OVER', 'IN_CHECKOUT', 'COMPLETED'] } } });
    }
  }

  async getOrderById(orderId: string, userId: string, userType: 'CLIENT' | 'PARTNER' | 'ADMIN') {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        supermarket: true,
      }
    });

    if (!order) {
      throw new OrderNotFoundError();
    }

    if (userType === 'CLIENT' && order.clientId !== userId) {
      throw new OrderAccessDeniedError();
    }

    if (userType === 'PARTNER') {
      // Partners can see if it's available or if they accepted it
      if (order.status !== 'PAID_WAITING_PARTNER' && order.partnerId !== userId) {
         throw new OrderAccessDeniedError();
      }
    }

    return order;
  }

  async getAvailableOrders() {
    return prisma.order.findMany({
      where: {
        status: 'PAID_WAITING_PARTNER',
        partnerId: null,
      },
      include: {
        supermarket: true,
        _count: {
          select: { items: true }
        }
      }
    });
  }

  private validateTransition(currentStatus: OrderStatus, newStatus: OrderStatus) {
    if (!allowedTransitions[currentStatus].includes(newStatus)) {
      throw new InvalidOrderTransitionError(`Cannot transition from ${currentStatus} to ${newStatus}`);
    }
  }

  async markPaid(orderId: string) {
    // Simulates payment confirmed webhook
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();

    this.validateTransition(order.status, 'PAID_WAITING_PARTNER');

    return prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID_WAITING_PARTNER' }
    });
  }

  async acceptOrder(orderId: string, partnerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();

    if (order.status !== 'PAID_WAITING_PARTNER') {
      throw new OrderAlreadyAcceptedError();
    }

    this.validateTransition(order.status, 'ACCEPTED');

    // Concurrency Lock with Prisma $transaction and updateMany
    // We try to update exactly 1 row that matches our conditions
    const updateResult = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: 'PAID_WAITING_PARTNER',
        partnerId: null,
      },
      data: {
        status: 'ACCEPTED',
        partnerId,
      }
    });

    if (updateResult.count === 0) {
      throw new OrderAlreadyAcceptedError();
    }

    return prisma.order.findUnique({ where: { id: orderId } });
  }

  async startPicking(orderId: string, partnerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.partnerId !== partnerId) throw new OrderAccessDeniedError();

    this.validateTransition(order.status, 'PICKING');

    return prisma.order.update({
      where: { id: orderId },
      data: { status: 'PICKING' }
    });
  }

  async finishPicking(orderId: string, partnerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.partnerId !== partnerId) throw new OrderAccessDeniedError();

    this.validateTransition(order.status, 'WAITING_HANDOFF');

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'WAITING_HANDOFF',
        // Pincode is already generated on creation, but we could regenerate it here if needed.
        // Keeping the existing one for MVP compatibility.
      }
    });
  }

  async handoff(orderId: string, partnerId: string, pincode: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.partnerId !== partnerId) throw new OrderAccessDeniedError();

    this.validateTransition(order.status, 'HANDED_OVER');

    if (order.pincode !== pincode) {
      throw new InvalidHandoffPinError();
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'HANDED_OVER',
        handoffAt: new Date(),
      }
    });
  }

  async goToCheckout(orderId: string, partnerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.partnerId !== partnerId) throw new OrderAccessDeniedError();
    if (!order.hasCheckoutAssistance) {
      throw new InvalidOrderTransitionError('Checkout assistance not hired.');
    }

    this.validateTransition(order.status, 'IN_CHECKOUT');

    return prisma.order.update({
      where: { id: orderId },
      data: { status: 'IN_CHECKOUT' }
    });
  }

  async completeOrder(orderId: string, partnerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.partnerId !== partnerId) throw new OrderAccessDeniedError();

    if (order.status === 'HANDED_OVER' && order.hasCheckoutAssistance) {
      throw new InvalidOrderTransitionError('Order with checkout assistance must go to IN_CHECKOUT before COMPLETED.');
    }

    this.validateTransition(order.status, 'COMPLETED');

    return prisma.order.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' }
    });
  }

  async cancelOrder(orderId: string, userId: string, userType: 'CLIENT' | 'PARTNER') {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();

    if (userType === 'CLIENT' && order.clientId !== userId) throw new OrderAccessDeniedError();
    if (userType === 'PARTNER' && order.partnerId !== userId) throw new OrderAccessDeniedError();

    this.validateTransition(order.status, 'CANCELLED');

    // TODO: implement actual refund rules logic
    return prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' }
    });
  }

  // --- Order Items ---

  private async isListLocked(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    return order.status !== 'CREATED' && order.status !== 'PAID_WAITING_PARTNER';
  }

  private async recalculateOrderFees(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    if (!order) return;

    const activeItemCount = order.items.filter(i => i.status !== 'REMOVED').length;
    if (activeItemCount < 10) {
      throw new MinimumOrderItemsError();
    }

    const fees = calculateOrderFees(activeItemCount, {
      hasCheckoutAssistance: order.hasCheckoutAssistance,
      hasPackagingAssistance: order.hasPackagingAssistance
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        baseFee: fees.baseFee,
        servicesFee: fees.servicesFee,
        totalFee: fees.totalFee,
      }
    });
  }

  async addOrderItem(orderId: string, clientId: string, data: { catalogProductId?: string; customName?: string; quantity: number; notes?: string }) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.clientId !== clientId) throw new OrderAccessDeniedError();

    if (await this.isListLocked(orderId)) {
      throw new OrderListLockedError();
    }

    const item = await prisma.orderItem.create({
      data: {
        orderId,
        catalogProductId: data.catalogProductId ?? null,
        customName: data.customName ?? null,
        quantity: data.quantity,
        notes: data.notes ?? null,
        barcodeMatched: false,
      }
    });

    await this.recalculateOrderFees(orderId);
    return item;
  }

  async updateOrderItem(orderId: string, itemId: string, clientId: string, data: { quantity?: number; notes?: string; customName?: string; catalogProductId?: string }) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.clientId !== clientId) throw new OrderAccessDeniedError();

    if (await this.isListLocked(orderId)) {
      throw new OrderListLockedError();
    }

    const updateData: Prisma.OrderItemUpdateInput = {};
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.customName !== undefined) updateData.customName = data.customName ?? null;
    if (data.catalogProductId !== undefined) {
      updateData.catalogProduct = data.catalogProductId ? { connect: { id: data.catalogProductId } } : { disconnect: true };
    }

    const itemToUpdate = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!itemToUpdate || itemToUpdate.orderId !== orderId) {
      throw new OrderItemNotFoundError();
    }

    const item = await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });

    await this.recalculateOrderFees(orderId);
    return item;
  }

  async removeOrderItem(orderId: string, itemId: string, clientId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    if (!order) throw new OrderNotFoundError();
    if (order.clientId !== clientId) throw new OrderAccessDeniedError();

    if (await this.isListLocked(orderId)) {
      throw new OrderListLockedError();
    }

    const activeItemCount = order.items.filter(i => i.status !== 'REMOVED' && i.id !== itemId).length;
    if (activeItemCount < 10) {
      throw new MinimumOrderItemsError();
    }

    const itemToDelete = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!itemToDelete || itemToDelete.orderId !== orderId) {
      throw new OrderItemNotFoundError();
    }

    await prisma.orderItem.delete({
      where: { id: itemId }
    });

    await this.recalculateOrderFees(orderId);
  }

  async updateOrderItemStatus(
    orderId: string,
    itemId: string,
    partnerId: string,
    data: { status: OrderItemStatus; unitPrice?: number; barcodeMatched?: boolean; photoUrl?: string; notes?: string }
  ) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    if (order.partnerId !== partnerId) throw new OrderAccessDeniedError();

    if (order.status !== 'PICKING') {
       throw new InvalidOrderTransitionError('Items can only be updated during PICKING status.');
    }

    const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item || item.orderId !== orderId) throw new OrderItemNotFoundError();

    const updateData: Prisma.OrderItemUpdateInput = {
      status: data.status,
    };
    if (data.unitPrice !== undefined) updateData.unitPrice = data.unitPrice;
    if (data.barcodeMatched !== undefined) updateData.barcodeMatched = data.barcodeMatched;
    if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;

    return prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });
  }
}
