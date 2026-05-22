import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { OrderService } from '../../services/order.service.js';
import {
  InvalidOrderTransitionError,
  MinimumOrderItemsError,
  OrderAccessDeniedError,
  OrderAlreadyAcceptedError,
  OrderNotFoundError,
  InvalidHandoffPinError
} from '../../errors/domain-errors.js';

const orderService = new OrderService();

export async function createOrder(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.userType !== 'CLIENT') {
    return reply.status(403).send({ message: 'Only clients can create orders.' });
  }

  const createOrderSchema = z.object({
    supermarketId: z.string().uuid(),
    hasCheckoutAssistance: z.boolean().optional(),
    hasPackagingAssistance: z.boolean().optional(),
    items: z.array(z.object({
      catalogProductId: z.string().uuid().optional(),
      customName: z.string().min(2).optional(),
      quantity: z.number().int().positive(),
    }).refine(data => data.catalogProductId || data.customName, {
      message: 'Each item must have a catalogProductId or a customName',
    })).min(10, 'Minimum 10 items required.'),
  });

  const data = createOrderSchema.parse(request.body);

  try {
    const order = await orderService.createOrder({
      clientId: request.user.sub,
      ...data,
    });
    return reply.status(201).send({ order });
  } catch (err) {
    if (err instanceof MinimumOrderItemsError) {
      return reply.status(400).send({ message: err.message });
    }
    throw err;
  }
}

export async function getMyOrders(request: FastifyRequest, reply: FastifyReply) {
  const orders = await orderService.getMyOrders(request.user.sub, request.user.userType as 'CLIENT' | 'PARTNER');
  return reply.status(200).send({ orders });
}

export async function getOrderById(request: FastifyRequest, reply: FastifyReply) {
  const getOrderParams = z.object({ id: z.string().uuid() });
  const { id } = getOrderParams.parse(request.params);

  try {
    const order = await orderService.getOrderById(id, request.user.sub, request.user.userType as 'CLIENT' | 'PARTNER' | 'ADMIN');
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    throw err;
  }
}

export async function getAvailableOrders(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.userType !== 'PARTNER') {
    return reply.status(403).send({ message: 'Only partners can list available orders.' });
  }
  const orders = await orderService.getAvailableOrders();
  return reply.status(200).send({ orders });
}

export async function acceptOrder(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.userType !== 'PARTNER') {
    return reply.status(403).send({ message: 'Only partners can accept orders.' });
  }
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.acceptOrder(id, request.user.sub);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    if (err instanceof OrderAlreadyAcceptedError) return reply.status(409).send({ message: err.message });
    throw err;
  }
}

export async function markPaid(request: FastifyRequest, reply: FastifyReply) {
  if (env.NODE_ENV === 'production') {
    return reply.status(403).send({ message: 'Not allowed in production environment.' });
  }

  // DEV/TEST ONLY
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.markPaid(id);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function startPicking(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.userType !== 'PARTNER') {
    return reply.status(403).send({ message: 'Only partners can start picking.' });
  }

  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.startPicking(id, request.user.sub);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function finishPicking(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.finishPicking(id, request.user.sub);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function handoff(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  const bodySchema = z.object({ pincode: z.string().length(4) });
  const { pincode } = bodySchema.parse(request.body);

  try {
    const order = await orderService.handoff(id, request.user.sub, pincode);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    if (err instanceof InvalidHandoffPinError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function goToCheckout(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.goToCheckout(id, request.user.sub);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function completeOrder(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.completeOrder(id, request.user.sub);
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function cancelOrder(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  try {
    const order = await orderService.cancelOrder(id, request.user.sub, request.user.userType as 'CLIENT' | 'PARTNER');
    return reply.status(200).send({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}
