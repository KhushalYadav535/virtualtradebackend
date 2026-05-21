/**
 * Placement rules for DAY / IOC / GTT and AMO when market is closed.
 */

const PENDING_MODES = new Set(['limit', 'sl', 'sl-m']);

const resolvePlacement = ({
  validity = 'DAY',
  orderMode = 'market',
  isAmo = false,
  isMarketOpen = true
}) => {
  const v = String(validity || 'DAY').toUpperCase();
  const mode = String(orderMode || 'market').toLowerCase();
  const marketClosed = !isMarketOpen;

  if (v === 'GTT' && mode !== 'limit') {
    return { ok: false, status: 400, message: 'GTT orders must use limit order mode' };
  }
  if (v === 'IOC' && mode === 'sl') {
    return { ok: false, status: 400, message: 'IOC is not supported for stop-loss limit; use SL-M or limit' };
  }

  let isAmoOrder = false;
  if (marketClosed) {
    if (mode === 'market' || ['bo', 'co'].includes(mode)) {
      if (!isAmo) {
        return {
          ok: false,
          status: 400,
          message: 'Market is closed. Check AMO to place after-market orders.'
        };
      }
      isAmoOrder = true;
    } else if (PENDING_MODES.has(mode) || isAmo) {
      isAmoOrder = true;
    }
  }

  const isBracketOrCover = ['bo', 'co'].includes(mode);
  const executeNow =
    !isAmoOrder && (mode === 'market' || isBracketOrCover) && v !== 'GTT';

  return {
    ok: true,
    validity: v,
    isAmoOrder,
    executeNow,
    marketClosed,
    scheduleNote: isAmoOrder
      ? 'Queued as AMO — executes when market opens'
      : v === 'GTT'
        ? 'GTT limit — active until triggered or cancelled'
        : v === 'IOC'
          ? 'IOC — unfilled remainder cancelled automatically'
          : null
  };
};

module.exports = { resolvePlacement, PENDING_MODES };
