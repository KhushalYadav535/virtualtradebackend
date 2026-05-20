/**
 * Education-app approximate Indian equity charges (not for live trading).
 */
const calculateOrderCharges = ({
  orderType = 'BUY',
  productType = 'CNC',
  notional = 0
}) => {
  const n = Math.max(0, parseFloat(notional) || 0);
  const isDeliverySell = orderType === 'SELL' && (productType === 'CNC' || productType === 'NRML');

  const brokerage = Math.min(20, n * 0.0003);
  const stt = isDeliverySell ? n * 0.001 : n * 0.000625;
  const exchangeCharges = n * 0.0000345;
  const sebi = n * 0.0000001;
  const stampDuty = orderType === 'BUY' ? n * 0.00015 : 0;
  const gst = (brokerage + exchangeCharges) * 0.18;
  const total = brokerage + stt + exchangeCharges + sebi + stampDuty + gst;

  const round = (v) => parseFloat(v.toFixed(2));

  return {
    brokerage: round(brokerage),
    stt: round(stt),
    exchangeCharges: round(exchangeCharges),
    sebi: round(sebi),
    stampDuty: round(stampDuty),
    gst: round(gst),
    total: round(total)
  };
};

module.exports = { calculateOrderCharges };
