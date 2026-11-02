const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimit');
const { csrfGuard } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/error');
const routes = require('./routes');

const app = express();

if (env.isProd) app.set('trust proxy', 1); // Render terminates TLS in front of us; needed for real client IPs and Secure cookies
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins, // explicit allow-list, never "*", because credentials are allowed
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'Idempotency-Key'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', apiLimiter, csrfGuard, routes);
app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  connectDb()
    .then(() => app.listen(env.port, () => console.log(`API listening on :${env.port} (${env.nodeEnv})`)))
    .catch((err) => {
      console.error('Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = app;
