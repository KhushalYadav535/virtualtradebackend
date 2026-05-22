/** Paper-trading futures universe (index + liquid stock futures) */
const FUTURES_UNIVERSE = [
  { symbol: 'NIFTY', label: 'Nifty 50', segment: 'INDEX', lotSize: 50 },
  { symbol: 'BANKNIFTY', label: 'Bank Nifty', segment: 'INDEX', lotSize: 15 },
  { symbol: 'FINNIFTY', label: 'Fin Nifty', segment: 'INDEX', lotSize: 40 },
  { symbol: 'RELIANCE', label: 'Reliance', segment: 'STOCK', lotSize: 250 },
  { symbol: 'TCS', label: 'TCS', segment: 'STOCK', lotSize: 175 },
  { symbol: 'HDFCBANK', label: 'HDFC Bank', segment: 'STOCK', lotSize: 400 },
  { symbol: 'INFY', label: 'Infosys', segment: 'STOCK', lotSize: 400 },
  { symbol: 'ICICIBANK', label: 'ICICI Bank', segment: 'STOCK', lotSize: 700 },
  { symbol: 'SBIN', label: 'SBI', segment: 'STOCK', lotSize: 1500 },
  { symbol: 'TATAMOTORS', label: 'Tata Motors', segment: 'STOCK', lotSize: 550 }
];

const nextMonthlyExpiry = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  let d = lastDay;
  while (d > 0) {
    const dt = new Date(y, m, d);
    if (dt.getDay() === 4) {
      if (dt >= now) return dt.toISOString().slice(0, 10);
      break;
    }
    d -= 1;
  }
  const nm = m + 1;
  const ny = nm > 11 ? y + 1 : y;
  const nm2 = nm % 12;
  const ld2 = new Date(ny, nm2 + 1, 0).getDate();
  for (let dd = ld2; dd > 0; dd--) {
    const dt = new Date(ny, nm2, dd);
    if (dt.getDay() === 4) return dt.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
};

module.exports = { FUTURES_UNIVERSE, nextMonthlyExpiry };
