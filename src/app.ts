import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from './env.js';

export const app = fastify();

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});

import { authRoutes } from './http/routes/auth.routes.js';

app.register(authRoutes, { prefix: '/auth' });

app.setErrorHandler((error, _, reply) => {
  if (error instanceof Error && error.name === 'ZodError') {
    return reply.status(400).send({ message: 'Validation error.', issues: JSON.parse(error.message) });
  }

  if (env.NODE_ENV !== 'production') {
    console.error(error);
  } else {
    // Here we should log to an external tool like DataDog/NewRelic/Sentry
  }

  return reply.status(500).send({ message: 'Internal server error.' });
});
