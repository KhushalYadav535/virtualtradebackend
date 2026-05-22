const { getOptionChain } = require('./optionChain');

const STRATEGY_DEFS = [
  { id: 'long_call', name: 'Long Call', legs: 1, outlook: 'Bullish' },
  { id: 'long_put', name: 'Long Put', legs: 1, outlook: 'Bearish' },
  { id: 'covered_call', name: 'Covered Call', legs: 2, outlook: 'Neutral-Bullish' },
  { id: 'protective_put', name: 'Protective Put', legs: 2, outlook: 'Hedged long' },
  { id: 'straddle', name: 'Long Straddle', legs: 2, outlook: 'High volatility' },
  { id: 'strangle', name: 'Long Strangle', legs: 2, outlook: 'Volatility' },
  { id: 'bull_call_spread', name: 'Bull Call Spread', legs: 2, outlook: 'Moderately bullish' },
  { id: 'bear_put_spread', name: 'Bear Put Spread', legs: 2, outlook: 'Moderately bearish' }
];

const findAtmRow = (chain, spot) => {
  const rows = chain?.options || [];
  if (!rows.length) return null;
  let best = rows[0];
  let diff = Math.abs(best.strike - spot);
  for (const row of rows) {
    const d = Math.abs(row.strike - spot);
    if (d < diff) {
      diff = d;
      best = row;
    }
  }
  return best;
};

const legPremium = (type, row) => {
  const c = type === 'CE' ? row.call : row.put;
  return parseFloat(c?.ltp || 0) || 0;
};

const buildStrategy = (def, chain, spot, lotSize) => {
  const atm = findAtmRow(chain, spot);
  if (!atm) return null;

  const rows = chain.options || [];
  const step =
    rows.length > 1 ? Math.abs(rows[1].strike - rows[0].strike) : chain.symbol === 'BANKNIFTY' ? 100 : 50;
  const otmCall = rows.find((r) => r.strike === atm.strike + step) || atm;
  const otmPut = rows.find((r) => r.strike === atm.strike - step) || atm;

  const legs = [];
  let netPremium = 0;
  let maxProfit = null;
  let maxLoss = null;
  const breakevens = [];

  switch (def.id) {
    case 'long_call':
      legs.push({ action: 'BUY', type: 'CE', strike: atm.strike, premium: legPremium('CE', atm), qtyLots: 1 });
      netPremium = legs[0].premium;
      maxLoss = netPremium * lotSize;
      maxProfit = null;
      breakevens.push(atm.strike + netPremium);
      break;
    case 'long_put':
      legs.push({ action: 'BUY', type: 'PE', strike: atm.strike, premium: legPremium('PE', atm), qtyLots: 1 });
      netPremium = legs[0].premium;
      maxLoss = netPremium * lotSize;
      maxProfit = atm.strike * lotSize;
      breakevens.push(atm.strike - netPremium);
      break;
    case 'covered_call':
      legs.push(
        { action: 'HOLD', type: 'STOCK', strike: spot, premium: spot, qtyLots: 1, note: 'Long underlying (simulated)' },
        { action: 'SELL', type: 'CE', strike: otmCall.strike, premium: legPremium('CE', otmCall), qtyLots: 1 }
      );
      netPremium = legs[1].premium - spot;
      maxProfit = (otmCall.strike - spot + legs[1].premium) * lotSize;
      maxLoss = (spot - legs[1].premium) * lotSize;
      breakevens.push(spot - legs[1].premium);
      break;
    case 'protective_put':
      legs.push(
        { action: 'HOLD', type: 'STOCK', strike: spot, premium: spot, qtyLots: 1 },
        { action: 'BUY', type: 'PE', strike: atm.strike, premium: legPremium('PE', atm), qtyLots: 1 }
      );
      netPremium = legs[1].premium;
      maxLoss = (spot - atm.strike + netPremium) * lotSize;
      maxProfit = null;
      breakevens.push(spot + netPremium);
      break;
    case 'straddle':
      legs.push(
        { action: 'BUY', type: 'CE', strike: atm.strike, premium: legPremium('CE', atm), qtyLots: 1 },
        { action: 'BUY', type: 'PE', strike: atm.strike, premium: legPremium('PE', atm), qtyLots: 1 }
      );
      netPremium = legs[0].premium + legs[1].premium;
      maxLoss = netPremium * lotSize;
      breakevens.push(atm.strike - netPremium, atm.strike + netPremium);
      break;
    case 'strangle':
      legs.push(
        { action: 'BUY', type: 'CE', strike: otmCall.strike, premium: legPremium('CE', otmCall), qtyLots: 1 },
        { action: 'BUY', type: 'PE', strike: otmPut.strike, premium: legPremium('PE', otmPut), qtyLots: 1 }
      );
      netPremium = legs[0].premium + legs[1].premium;
      maxLoss = netPremium * lotSize;
      breakevens.push(otmPut.strike - netPremium, otmCall.strike + netPremium);
      break;
    case 'bull_call_spread':
      legs.push(
        { action: 'BUY', type: 'CE', strike: atm.strike, premium: legPremium('CE', atm), qtyLots: 1 },
        { action: 'SELL', type: 'CE', strike: otmCall.strike, premium: legPremium('CE', otmCall), qtyLots: 1 }
      );
      netPremium = legs[0].premium - legs[1].premium;
      maxLoss = netPremium * lotSize;
      maxProfit = (otmCall.strike - atm.strike - netPremium) * lotSize;
      breakevens.push(atm.strike + netPremium);
      break;
    case 'bear_put_spread':
      legs.push(
        { action: 'BUY', type: 'PE', strike: atm.strike, premium: legPremium('PE', atm), qtyLots: 1 },
        { action: 'SELL', type: 'PE', strike: otmPut.strike, premium: legPremium('PE', otmPut), qtyLots: 1 }
      );
      netPremium = legs[0].premium - legs[1].premium;
      maxLoss = netPremium * lotSize;
      maxProfit = (atm.strike - otmPut.strike - netPremium) * lotSize;
      breakevens.push(atm.strike - netPremium);
      break;
    default:
      return null;
  }

  return {
    id: def.id,
    name: def.name,
    outlook: def.outlook,
    underlying: chain.symbol,
    spot,
    lotSize,
    expiry: chain.expiry,
    legs,
    netPremiumPerShare: parseFloat(netPremium.toFixed(2)),
    netDebit: parseFloat((netPremium * lotSize).toFixed(2)),
    maxProfit: maxProfit != null ? parseFloat(maxProfit.toFixed(2)) : 'Unlimited',
    maxLoss: maxLoss != null ? parseFloat(maxLoss.toFixed(2)) : parseFloat((netPremium * lotSize).toFixed(2)),
    breakevens: breakevens.map((b) => parseFloat(b.toFixed(2))),
    marginEstimate: parseFloat((netPremium * lotSize * 1.15).toFixed(2)),
    note: 'Educational P&L estimate from chain premiums. Execute legs individually from the option chain.'
  };
};

const getOptionsStrategies = async (symbol = 'NIFTY', expiry = null) => {
  const sym = String(symbol || 'NIFTY').toUpperCase();
  const chain = await getOptionChain(sym, expiry);
  const spot = parseFloat(chain.underlyingValue || chain.spot || 0);
  const lotSize = chain.options?.[0]?.call?.lotSize || chain.options?.[0]?.put?.lotSize || 50;

  const strategies = STRATEGY_DEFS.map((def) => buildStrategy(def, chain, spot, lotSize)).filter(Boolean);

  return {
    symbol: sym,
    spot,
    lotSize,
    expiry: chain.expiry,
    source: chain.source,
    strategies,
    catalog: STRATEGY_DEFS
  };
};

module.exports = { getOptionsStrategies, STRATEGY_DEFS };
