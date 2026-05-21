import type { FastifyInstance } from 'fastify';
import { authenticate, register } from '../controllers/auth.controller.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', register);
  app.post('/login', authenticate);
}
