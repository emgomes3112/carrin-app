import type { FastifyInstance } from 'fastify';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  getAvailableOrders,
  acceptOrder,
  markPaid,
  startPicking,
  finishPicking,
  handoff,
  goToCheckout,
  completeOrder,
  cancelOrder
} from '../controllers/orders.controller.js';
import {
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  updateOrderItemStatus
} from '../controllers/order-items.controller.js';
import { verifyJwt } from '../middlewares/verify-jwt.js';

export async function ordersRoutes(app: FastifyInstance) {
  app.addHook('onRequest', verifyJwt);

  // Orders
  app.post('/', createOrder);
  app.get('/me', getMyOrders);
  app.get('/available', getAvailableOrders);
  app.get('/:id', getOrderById);

  app.post('/:id/accept', acceptOrder);
  app.post('/:id/mark-paid', markPaid);

  app.post('/:id/start-picking', startPicking);
  app.post('/:id/finish-picking', finishPicking);
  app.post('/:id/handoff', handoff);
  app.post('/:id/go-to-checkout', goToCheckout);
  app.post('/:id/complete', completeOrder);
  app.post('/:id/cancel', cancelOrder);

  // Order Items
  app.post('/:id/items', addOrderItem);
  app.patch('/:id/items/:itemId', updateOrderItem);
  app.delete('/:id/items/:itemId', removeOrderItem);

  app.patch('/:id/items/:itemId/status', updateOrderItemStatus);
}
