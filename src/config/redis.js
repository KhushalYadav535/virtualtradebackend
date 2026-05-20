const { createClient } = require('redis');

let client = null;

const initRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.log('⚠ REDIS_URL not set, caching disabled');
    return null;
  }

  try {
    client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    return client;
  } catch (err) {
    console.log('⚠ Redis connection failed, caching disabled');
    return null;
  }
};

const getRedisClient = () => client;

const cachePrice = async (symbol, price) => {
  if (client?.isOpen) {
    await client.set(`price:${symbol}`, JSON.stringify(price), { EX: 60 });
  }
};

const getCachedPrice = async (symbol) => {
  if (client?.isOpen) {
    const data = await client.get(`price:${symbol}`);
    return data ? JSON.parse(data) : null;
  }
  return null;
};

const cacheStockList = async (stocks, ttlSeconds = 86400) => {
  if (client?.isOpen) {
    await client.set('stock:list:v2', JSON.stringify(stocks), { EX: ttlSeconds });
  }
};

const getCachedStockList = async () => {
  if (client?.isOpen) {
    const data = await client.get('stock:list:v2');
    return data ? JSON.parse(data) : null;
  }
  return null;
};

module.exports = { initRedis, getRedisClient, cachePrice, getCachedPrice, cacheStockList, getCachedStockList };