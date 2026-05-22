const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildTradeBookTaxHtml = ({ summary, trades, userName, periodLabel }, { autoPrint = false } = {}) => {
  const sellTrades = trades.filter((t) => t.tradeType === 'SELL');
  const rows = sellTrades
    .map(
      (t) => `<tr>
        <td>${escapeHtml(new Date(t.timestamp).toLocaleString('en-IN'))}</td>
        <td><strong>${escapeHtml(t.symbol)}</strong></td>
        <td>${t.lots}</td>
        <td>₹${t.price}</td>
        <td>₹${t.totalValue}</td>
        <td class="${t.pnl >= 0 ? 'up' : 'down'}">${t.pnl >= 0 ? '+' : ''}₹${t.pnl}</td>
        <td>₹${t.charges?.total ?? 0}</td>
      </tr>`
    )
    .join('');

  const printScript = autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)});</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Tax P&amp;L — VirtualTrade</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:900px;margin:0 auto}
  h1{font-size:1.35rem;margin:0 0 4px}
  .muted{color:#666;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
  th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
  th{background:#f9fafb}
  .up{color:#059669}.down{color:#dc2626}
  .box{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}
  .stat{background:#f3f4f6;padding:12px 16px;border-radius:8px;min-width:140px}
  .stat label{font-size:11px;color:#666;text-transform:uppercase}
  .stat strong{display:block;font-size:18px;margin-top:4px}
  .note{margin-top:20px;font-size:12px;color:#666;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
  <h1>Tax P&amp;L Statement (Educational)</h1>
  <p class="muted">${escapeHtml(userName || 'Trader')} · ${escapeHtml(periodLabel)} · Generated ${new Date().toLocaleString('en-IN')}</p>
  <p class="muted">Paper trading only — not for official tax filing. Consult a tax professional for real returns.</p>
  <div class="box">
    <div class="stat"><label>Realized P&amp;L</label><strong class="${summary.realizedPnl >= 0 ? 'up' : 'down'}">₹${summary.realizedPnl}</strong></div>
    <div class="stat"><label>Sell trades</label><strong>${sellTrades.length}</strong></div>
    <div class="stat"><label>Total charges</label><strong>₹${summary.totalCharges}</strong></div>
    <div class="stat"><label>Turnover</label><strong>₹${summary.turnover}</strong></div>
  </div>
  <h2 style="font-size:1rem;margin-top:24px">Realized trades (SELL)</h2>
  <table><thead><tr><th>Time</th><th>Symbol</th><th>Lots</th><th>Price</th><th>Value</th><th>P&amp;L</th><th>Charges</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="7">No sell trades in period</td></tr>'}</tbody></table>
  <p class="note">VirtualTrade simulates STT, brokerage, GST, and stamp duty for learning purposes.</p>
  ${printScript}
</body></html>`;
};

module.exports = { buildTradeBookTaxHtml };
