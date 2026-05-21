const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildHoldingsReportHtml = ({ holdings, totals, analytics, corporateActionsUpcoming = [] }, { autoPrint = false } = {}) => {
  const rows = holdings
    .map(
      (h) => `<tr>
        <td><strong>${escapeHtml(h.symbol)}</strong><br/><span class="muted">${escapeHtml(h.name)}</span></td>
        <td>${h.qty}</td>
        <td>${escapeHtml(h.completeLotsLabel)}</td>
        <td>₹${h.avgBuyPrice}</td>
        <td>₹${h.currentPrice}</td>
        <td>₹${h.currentValue}</td>
        <td class="${h.pnl >= 0 ? 'up' : 'down'}">${h.pnl >= 0 ? '+' : ''}₹${h.pnl} (${h.pnlPercent}%)</td>
        <td class="${h.dayChange >= 0 ? 'up' : 'down'}">${h.dayChange >= 0 ? '+' : ''}₹${h.dayChange}</td>
      </tr>`
    )
    .join('');

  const corpRows = (corporateActionsUpcoming || [])
    .map(
      (a) => `<tr>
        <td>${escapeHtml(a.symbol)}</td>
        <td>${escapeHtml(a.type)}</td>
        <td>${escapeHtml(a.title)}</td>
        <td>${escapeHtml(a.exDate)}</td>
        <td class="muted">${escapeHtml(a.impact)}</td>
      </tr>`
    )
    .join('');

  const printScript = autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)});</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>VirtualTrade Holdings Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111; margin: 0; padding: 32px; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
    .card label { font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.04em; }
    .card value { display: block; font-size: 18px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    .muted { color: #6b7280; font-size: 11px; }
    .up { color: #059669; font-weight: 600; }
    .down { color: #dc2626; font-weight: 600; }
    h2 { font-size: 16px; margin: 24px 0 12px; }
    .footer { margin-top: 32px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .no-print { margin-bottom: 16px; }
    @media print {
      body { padding: 16px; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 20px;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">
      Save as PDF (Print)
    </button>
    <p class="muted" style="margin-top:8px">Use <strong>Ctrl+P</strong> (Windows) or <strong>⌘+P</strong> (Mac) → Save as PDF</p>
  </div>
  <h1>Holdings Report</h1>
  <p class="sub">Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · VirtualTrade (paper trading)</p>
  <div class="summary">
    <div class="card"><label>Holdings value</label><span class="card value">₹${totals.holdingsValue}</span></div>
    <div class="card"><label>Invested</label><span class="card value">₹${totals.investedValue}</span></div>
    <div class="card"><label>Total P&L</label><span class="card value ${totals.totalPnL >= 0 ? 'up' : 'down'}">${totals.totalPnL >= 0 ? '+' : ''}₹${totals.totalPnL} (${totals.totalPnLPercent}%)</span></div>
    <div class="card"><label>Total lots</label><span class="card value">${totals.totalLotsHeld}</span></div>
  </div>
  <h2>Holdings</h2>
  <table>
    <thead><tr><th>Stock</th><th>Qty</th><th>Lots</th><th>Avg</th><th>LTP</th><th>Value</th><th>P&L</th><th>Day</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8">No holdings</td></tr>'}</tbody>
  </table>
  ${corpRows ? `<h2>Upcoming corporate actions (your holdings)</h2>
  <table><thead><tr><th>Symbol</th><th>Type</th><th>Event</th><th>Ex-date</th><th>Impact</th></tr></thead><tbody>${corpRows}</tbody></table>` : ''}
  <h2>Analytics</h2>
  <p class="muted">Top gainers: ${(analytics.topGainers || []).map((g) => `${g.symbol} (+${g.pnlPercent}%)`).join(', ') || '—'}</p>
  <p class="muted">Sectors: ${(analytics.sectorBreakdown || []).map((s) => `${s.sector} ${s.weightPercent}%`).join(' · ') || '—'}</p>
  <div class="footer">Educational paper-trading platform. Not investment advice. Corporate actions are simulated for learning.</div>
  ${printScript}
</body>
</html>`;
};

module.exports = { buildHoldingsReportHtml };
