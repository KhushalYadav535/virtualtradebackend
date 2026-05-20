require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { initDatabase } = require('./config/database');
const { initRedis } = require('./config/redis');
const { setupSocket } = require('./socket');
const { startMarketDataCron } = require('./services/marketData');
const { executePendingLimitOrders, executePendingStopOrders, executeAmoOrders } = require('./services/trading');
const { autoSquareOffAllUsers } = require('./services/intraday');
const { checkAllPriceAlerts } = require('./services/priceAlerts');
const { isMarketOpen } = require('./services/marketData');
const { getAllowedOrigins, corsOriginDelegate } = require('./config/cors');

const app = express();
const allowedOrigins = getAllowedOrigins();
const httpServer = createServer(app);

if (process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

app.use(helmet({
  contentSecurityPolicy: false
}));

const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: corsOriginDelegate,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 400 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 100,
  message: { error: 'Too many auth attempts, please try again later.' }
});

app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

app.use('/api', routes);

app.use(errorHandler);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: isDbReady,
    timestamp: new Date().toISOString()
  });
});

let isDbReady = false;
let isRedisReady = false;

async function startServer() {
  try {
    await initDatabase();
    console.log('✓ Database connected');
    isDbReady = true;
  } catch (err) {
    console.error('✗ Database connection failed:', err.message);
  }

  try {
    await initRedis();
    console.log('✓ Redis connected');
    isRedisReady = true;
  } catch (err) {
    console.error('✗ Redis connection failed:', err.message);
  }

  setupSocket(io);

  if (isRedisReady) {
    startMarketDataCron(io);
  }

  setInterval(() => {
    executePendingLimitOrders().catch(err => console.error('Limit order cron error:', err.message));
    executePendingStopOrders().catch(err => console.error('SL order cron error:', err.message));
    executeAmoOrders().catch(err => console.error('AMO cron error:', err.message));
    checkAllPriceAlerts().catch(err => console.error('Price alert cron error:', err.message));
  }, 30000);

  setInterval(() => {
    if (!isMarketOpen()) {
      autoSquareOffAllUsers().catch(err => console.error('MIS square-off error:', err.message));
    }
  }, 5 * 60 * 1000);

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

startServer();

module.exports = { io };