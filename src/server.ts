import { app } from './app.js';
import { env } from './env.js';

app.listen({
  host: '0.0.0.0',
  port: env.PORT,
}).then(() => {
  console.log(`🚀 HTTP Server Running on port ${env.PORT}`);
});
