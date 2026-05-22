const { getStockQuote } = require('./marketData');

const tickSize = (ltp) => {
  const p = parseFloat(ltp) || 100;
  if (p < 50) return 0.05;
  if (p < 500) return 0.1;
  return 0.25;
};

const synthQty = (base, level) => Math.max(1, Math.floor(base / level) + (level % 3) * 50);

const getMarketDepth = async (symbol) => {
  const quote = await getStockQuote(symbol);
  if (!quote?.ltp) {
    throw { status: 404, message: 'Quote not available for depth' };
  }

  const ltp = parseFloat(quote.ltp);
  const tick = tickSize(ltp);
  const baseQty = quote.volume ? Math.min(5000, Math.max(500, Math.floor(quote.volume / 100))) : 1200;

  const bids = [];
  const asks = [];
  for (let i = 1; i <= 5; i++) {
    bids.push({
      level: i,
      price: parseFloat((ltp - tick * i).toFixed(2)),
      qty: synthQty(baseQty, i),
      orders: Math.max(1, 6 - i)
    });
    asks.push({
      level: i,
      price: parseFloat((ltp + tick * i).toFixed(2)),
      qty: synthQty(baseQty, i + 1),
      orders: Math.max(1, 5 - i + 1)
    });
  }

  const totalBidQty = bids.reduce((s, r) => s + r.qty, 0);
  const totalAskQty = asks.reduce((s, r) => s + r.qty, 0);
  const bestBid = bids[0]?.price ?? ltp;
  const bestAsk = asks[0]?.price ?? ltp;

  return {
    symbol: quote.symbol || symbol,
    exchange: quote.exchange || 'NSE',
    ltp,
    tickSize: tick,
    source: 'simulated',
    note: 'Level 1/2 depth simulated from last traded price for paper trading.',
    bids,
    asks,
    totalBidQty,
    totalAskQty,
    spread: parseFloat((bestAsk - bestBid).toFixed(2)),
    spreadPct: parseFloat((((bestAsk - bestBid) / ltp) * 100).toFixed(3)),
    imbalancePct: parseFloat((((totalBidQty - totalAskQty) / (totalBidQty + totalAskQty || 1)) * 100).toFixed(2))
  };
};

module.exports = { getMarketDepth };
