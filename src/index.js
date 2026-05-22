require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { initDatabase } = require('./config/database');
const { initRedis } = require('./config/redis');
const { setupSocket } = require('./socket');
const { startMarketDataCron } = require('./services/marketData');
const {
  executePendingLimitOrders,
  executePendingStopOrders,
  executeAmoOrders,
  expireDayPendingAtClose
} = require('./services/trading');
const { runScheduledAutoSquareOff } = require('./services/intraday');
const { checkAllPriceAlerts } = require('./services/priceAlerts');
const { getAllowedOrigins, corsOriginDelegate } = require('./config/cors');

const app = express();
app.set('trust proxy', 1);
app.use(compression());
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
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
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

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 120 : 500,
  message: { error: 'Admin API rate limit exceeded' }
});

app.use('/api/auth', authLimiter);
app.use('/api/admin', adminLimiter);
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
    const { ensureAchievementRows } = require('./services/gamification');
    await ensureAchievementRows().catch((e) => console.warn('Achievement seed:', e.message));
    const { ensureSecurityTables } = require('./services/securityService');
    const { ensureScanAlertTables } = require('./services/scanAlerts');
    const { ensureAdminExtendedTables } = require('./services/adminExtended');
    await ensureSecurityTables().catch((e) => console.warn('Security tables:', e.message));
    await ensureScanAlertTables().catch((e) => console.warn('Scan alert tables:', e.message));
    await ensureAdminExtendedTables().catch((e) => console.warn('Admin extended tables:', e.message));
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
  app.set('io', io);

  if (isRedisReady) {
    startMarketDataCron(io);
  }

  const runCron = (label, fn) =>
    fn().catch((err) => console.error(`${label} cron error:`, err.message));

  const {
    runScheduledNotificationChecks,
    runDailyNotificationChecks
  } = require('./services/scheduledNotifications');

  setInterval(async () => {
    await runCron('Limit order', executePendingLimitOrders);
    await runCron('SL order', executePendingStopOrders);
    await runCron('AMO', executeAmoOrders);
    await runCron('DAY expiry', expireDayPendingAtClose);
    await runCron('Price alert', checkAllPriceAlerts);
    await runCron('Alerts schedule', runScheduledNotificationChecks);
  }, 30000);

  setInterval(() => {
    runCron('Daily alerts', runDailyNotificationChecks);
  }, 60 * 60 * 1000);

  setInterval(() => {
    runScheduledAutoSquareOff().catch((err) => console.error('MIS auto square-off:', err.message));
  }, 60 * 1000);

  setInterval(async () => {
    try {
      const { syncLotSizes } = require('./services/admin');
      if (typeof syncLotSizes === 'function') await syncLotSizes();
    } catch (e) {
      console.error('Lot sync cron error:', e.message);
    }
  }, 6 * 60 * 60 * 1000);

  setInterval(() => {
    const { runScanAlertCron } = require('./services/scanAlerts');
    runCron('Scan alerts', runScanAlertCron);
  }, 30 * 60 * 1000);

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

startServer();

module.exports = { io };