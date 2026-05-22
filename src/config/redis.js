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

const memoryCache = new Map();

const cachePrice = async (symbol, price) => {
  if (client?.isOpen) {
    await client.set(`price:${symbol}`, JSON.stringify(price), { EX: 60 });
  } else {
    memoryCache.set(`price:${symbol}`, { data: price, exp: Date.now() + 60000 });
  }
};

const getCachedPrice = async (symbol) => {
  if (client?.isOpen) {
    const data = await client.get(`price:${symbol}`);
    return data ? JSON.parse(data) : null;
  } else {
    const item = memoryCache.get(`price:${symbol}`);
    if (item && item.exp > Date.now()) return item.data;
    if (item) memoryCache.delete(`price:${symbol}`);
    return null;
  }
};

const cacheStockList = async (stocks, ttlSeconds = 86400) => {
  if (client?.isOpen) {
    await client.set('stock:list:v2', JSON.stringify(stocks), { EX: ttlSeconds });
  } else {
    memoryCache.set('stock:list:v2', { data: stocks, exp: Date.now() + ttlSeconds * 1000 });
  }
};

const getCachedStockList = async () => {
  if (client?.isOpen) {
    const data = await client.get('stock:list:v2');
    return data ? JSON.parse(data) : null;
  } else {
    const item = memoryCache.get('stock:list:v2');
    if (item && item.exp > Date.now()) return item.data;
    if (item) memoryCache.delete('stock:list:v2');
    return null;
  }
};

module.exports = { initRedis, getRedisClient, cachePrice, getCachedPrice, cacheStockList, getCachedStockList };