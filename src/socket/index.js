const jwt = require('jsonwebtoken');
const { getStockList, getIndices, getStockQuote } = require('../services/marketData');

const setupSocket = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
    } catch (err) {
      console.log('Socket auth error:', err.message);
    }
    next();
  });

  io.on('connection', async (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.emit('connectionStatus', {
      status: 'connected',
      serverTime: new Date().toISOString(),
      priceBroadcastSec: 5
    });

    // Send lightweight init data instead of full stock list
    const indices = await getIndices().catch(() => []);
    socket.emit('init', {
      stocks: [],
      indices
    });

    socket.on('subscribe', async (symbol) => {
      socket.join(`stock:${symbol}`);
      const quote = await getStockQuote(symbol);
      if (quote) {
        socket.emit('stockData', quote);
      }
    });

    socket.on('unsubscribe', (symbol) => {
      socket.leave(`stock:${symbol}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

module.exports = { setupSocket };