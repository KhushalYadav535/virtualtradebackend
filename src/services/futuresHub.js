const { getMultipleQuotes } = require('./marketData');
const { FUTURES_UNIVERSE, nextMonthlyExpiry } = require('../data/futuresUniverse');
const { buildLotPreview } = require('../utils/lotUtils');

const getFuturesList = async (userId = null) => {
  const expiry = nextMonthlyExpiry();
  const symbols = FUTURES_UNIVERSE.map((f) => f.symbol);
  const quotes = await getMultipleQuotes(symbols);
  const quoteMap = Object.fromEntries((quotes || []).map((q) => [q.symbol, q]));

  let balance = 1000000;
  let holdings = [];
  if (userId) {
    const { pool } = require('../config/database');
    const w = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    balance = parseFloat(w.rows[0]?.balance || balance);
    const h = await pool.query(
      'SELECT symbol, qty, avg_buy_price FROM holdings WHERE user_id = $1',
      [userId]
    );
    holdings = h.rows;
  }

  const holdingMap = Object.fromEntries(holdings.map((h) => [h.symbol, h]));
  const isNearExpiry = () => {
    const ex = new Date(expiry);
    const now = new Date();
    const diff = ex.getTime() - now.getTime();
    return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  };

  const contracts = FUTURES_UNIVERSE.map((f) => {
    const q = quoteMap[f.symbol] || {};
    const ltp = parseFloat(q.ltp) || 0;
    const lotSize = q.lotSize || f.lotSize;
    const preview = buildLotPreview(
      { ...q, lotSize, lotSizeMis: lotSize, lotSizeNrml: lotSize },
      'NRML',
      lotSize,
      'BUY',
      ltp,
      balance
    );
    const held = holdingMap[f.symbol];
    return {
      ...f,
      contractSymbol: `${f.symbol}${expiry.replace(/-/g, '')}FUT`,
      expiry,
      ltp,
      change: q.change ?? 0,
      changePercent: q.changePercent ?? 0,
      lotSize,
      lotValue: preview.lotValue,
      contractValue: preview.orderValue,
      marginPerLot: preview.marginPerLot,
      maxLots: preview.maxLots,
      segment: f.segment,
      heldQty: held ? parseInt(held.qty, 10) : 0,
      heldAvg: held ? parseFloat(held.avg_buy_price) : 0,
      nearExpiry: isNearExpiry()
    };
  });

  return {
    expiry,
    contracts,
    disclaimer: 'Simulated futures for education. Orders route as NRML equity-style lots.'
  };
};

const rolloverPosition = async (userId, symbol) => {
  const { pool } = require('../config/database');
  const trading = require('./trading');

  const { rows } = await pool.query(
    'SELECT qty, avg_buy_price FROM holdings WHERE user_id = $1 AND symbol = $2',
    [userId, symbol]
  );
  if (!rows.length) throw { status: 400, message: `No position in ${symbol}` };

  const held = rows[0];
  const qty = parseInt(held.qty, 10);
  const price = parseFloat(held.avg_buy_price);
  if (qty <= 0) throw { status: 400, message: 'No position to roll over' };

  const { getStockQuote } = require('./marketData');
  const quote = await getStockQuote(symbol);
  const ltp = parseFloat(quote?.ltp) || price;

  const sellOrder = await trading.placeOrder({
    userId,
    symbol,
    qty,
    orderType: 'SELL',
    orderMode: 'market',
    productType: 'NRML',
    exchange: quote?.exchange || 'NSE'
  });

  const buyOrder = await trading.placeOrder({
    userId,
    symbol,
    qty,
    orderType: 'BUY',
    orderMode: 'market',
    productType: 'NRML',
    exchange: quote?.exchange || 'NSE'
  });

  const { pool: db } = require('../config/database');
  await db.query(
    `INSERT INTO app_settings (key, value)
     VALUES ('rollover_log', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = app_settings.value || $1::jsonb`,
    [JSON.stringify({
      [new Date().toISOString()]: {
        userId,
        symbol,
        qty,
        soldAt: ltp,
        boughtAt: ltp,
        pnl: (ltp - price) * qty,
        sellOrderId: sellOrder.id,
        buyOrderId: buyOrder.id
      }
    })]
  );

  return {
    symbol,
    qty,
    soldAt: ltp,
    boughtAt: ltp,
    pnl: parseFloat(((ltp - price) * qty).toFixed(2)),
    sellOrderId: sellOrder.id,
    buyOrderId: buyOrder.id,
    message: `Rolled over ${qty} ${symbol} from current to next month`
  };
};

module.exports = { getFuturesList, rolloverPosition };
