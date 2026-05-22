import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { OrderService } from '../../services/order.service.js';
import {
  OrderNotFoundError,
  OrderAccessDeniedError,
  OrderListLockedError,
  MinimumOrderItemsError,
  InvalidOrderTransitionError,
  OrderItemNotFoundError
} from '../../errors/domain-errors.js';
import { OrderItemStatus } from '@prisma/client';

const orderService = new OrderService();

export async function addOrderItem(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const { id } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    catalogProductId: z.string().uuid().optional(),
    customName: z.string().min(2).optional(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
  }).refine(data => data.catalogProductId || data.customName, {
    message: 'Each item must have a catalogProductId or a customName',
  });

  const data = bodySchema.parse(request.body);

  try {
    const item = await orderService.addOrderItem(id, request.user.sub, data);
    return reply.status(201).send({ item });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof OrderListLockedError) return reply.status(409).send({ message: err.message });
    throw err;
  }
}

export async function updateOrderItem(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
  });
  const { id, itemId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    catalogProductId: z.string().uuid().optional(),
    customName: z.string().min(2).optional(),
    quantity: z.number().int().positive().optional(),
    notes: z.string().optional(),
  });

  const data = bodySchema.parse(request.body);

  try {
    const item = await orderService.updateOrderItem(id, itemId, request.user.sub, data);
    return reply.status(200).send({ item });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof OrderListLockedError) return reply.status(409).send({ message: err.message });
    throw err;
  }
}

export async function removeOrderItem(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
  });
  const { id, itemId } = paramsSchema.parse(request.params);

  try {
    await orderService.removeOrderItem(id, itemId, request.user.sub);
    return reply.status(204).send();
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof OrderListLockedError) return reply.status(409).send({ message: err.message });
    if (err instanceof MinimumOrderItemsError) return reply.status(400).send({ message: err.message });
    throw err;
  }
}

export async function updateOrderItemStatus(request: FastifyRequest, reply: FastifyReply) {
  const paramsSchema = z.object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
  });
  const { id, itemId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    status: z.nativeEnum(OrderItemStatus),
    unitPrice: z.number().positive().optional(),
    barcodeMatched: z.boolean().optional(),
    photoUrl: z.string().url().optional(),
    notes: z.string().optional(),
  }).refine(data => {
    if (data.status === 'FOUND' && data.unitPrice === undefined) {
      return false; // MVP simplified check: requiring price when found.
    }
    return true;
  }, {
    message: 'unitPrice is required when status is FOUND',
    path: ['unitPrice']
  }).refine(data => {
    if (data.status === 'FOUND' && !data.barcodeMatched && !data.photoUrl) {
      return false;
    }
    return true;
  }, {
    message: 'photoUrl is required when item is found but barcode does not match',
    path: ['photoUrl']
  });

  const data = bodySchema.parse(request.body);

  try {
    const item = await orderService.updateOrderItemStatus(id, itemId, request.user.sub, data);
    return reply.status(200).send({ item });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderItemNotFoundError) return reply.status(404).send({ message: err.message });
    if (err instanceof OrderAccessDeniedError) return reply.status(403).send({ message: err.message });
    if (err instanceof InvalidOrderTransitionError) return reply.status(409).send({ message: err.message }); // 409 because state doesn't allow it
    throw err;
  }
}
