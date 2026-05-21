/**
 * Simulated market calendars for education (not live NSE/BSE feeds).
 */

const NSE_HOLIDAYS_2026 = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-10', name: 'Holi' },
  { date: '2026-03-30', name: 'Id-Ul-Fitr' },
  { date: '2026-04-02', name: 'Ram Navami' },
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti' },
  { date: '2026-04-21', name: 'Mahavir Jayanti' },
  { date: '2026-05-01', name: 'Maharashtra Day' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-09', name: 'Diwali (Laxmi Pujan)' },
  { date: '2026-11-10', name: 'Diwali (Balipratipada)' },
  { date: '2026-11-24', name: 'Gurunanak Jayanti' },
  { date: '2026-12-25', name: 'Christmas' }
];

const IPO_CALENDAR = [
  { company: 'Nova Retail Tech', symbol: 'NOVA', openDate: '2026-05-28', closeDate: '2026-05-30', priceBand: '₹420–₹445', lotSize: 33, issueSize: '₹2,400 cr' },
  { company: 'GreenGrid Power', symbol: 'GREENGRID', openDate: '2026-06-05', closeDate: '2026-06-07', priceBand: '₹310–₹325', lotSize: 46, issueSize: '₹4,100 cr' },
  { company: 'FinServe Digital', symbol: 'FINSERVE', openDate: '2026-06-12', closeDate: '2026-06-14', priceBand: '₹580–₹610', lotSize: 24, issueSize: '₹1,850 cr' }
];

const RESULTS_CALENDAR = [
  { symbol: 'RELIANCE', company: 'Reliance Industries', date: '2026-05-22', type: 'Q4 FY26' },
  { symbol: 'TCS', company: 'Tata Consultancy Services', date: '2026-05-24', type: 'Q4 FY26' },
  { symbol: 'HDFCBANK', company: 'HDFC Bank', date: '2026-05-26', type: 'Q4 FY26' },
  { symbol: 'INFY', company: 'Infosys', date: '2026-05-27', type: 'Q4 FY26' },
  { symbol: 'ICICIBANK', company: 'ICICI Bank', date: '2026-05-29', type: 'Q4 FY26' },
  { symbol: 'SBIN', company: 'State Bank of India', date: '2026-06-02', type: 'Q4 FY26' }
];

const LOT_SIZE_CHANGES = [
  { symbol: 'RELIANCE', effectiveDate: '2026-06-27', oldLot: 250, newLot: 500, segment: 'F&O' },
  { symbol: 'TCS', effectiveDate: '2026-06-27', oldLot: 175, newLot: 150, segment: 'F&O' },
  { symbol: 'NIFTY', effectiveDate: '2026-06-27', oldLot: 50, newLot: 75, segment: 'Index F&O' },
  { symbol: 'BANKNIFTY', effectiveDate: '2026-06-27', oldLot: 15, newLot: 30, segment: 'Index F&O' }
];

const BULK_DEALS = [
  { date: '2026-05-20', symbol: 'RELIANCE', buyer: 'Institution A', seller: 'Promoter trust', qty: 500000, price: 2810, lots: 2000, valueCr: 140.5 },
  { date: '2026-05-19', symbol: 'TCS', buyer: 'FII block', seller: 'Mutual fund', qty: 120000, price: 3820, lots: 686, valueCr: 45.8 },
  { date: '2026-05-18', symbol: 'HDFCBANK', buyer: 'Insurance co.', seller: 'FII', qty: 800000, price: 1685, lots: 2000, valueCr: 134.8 }
];

const getAllCalendars = () => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    holidays: NSE_HOLIDAYS_2026.filter((h) => h.date >= today).slice(0, 8),
    holidaysAll: NSE_HOLIDAYS_2026,
    ipo: IPO_CALENDAR.filter((i) => i.closeDate >= today),
    results: RESULTS_CALENDAR.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    lotSizeChanges: LOT_SIZE_CHANGES.filter((l) => l.effectiveDate >= today),
    bulkDeals: BULK_DEALS,
    disclaimer: 'Calendars are simulated for paper trading education.'
  };
};

module.exports = {
  NSE_HOLIDAYS_2026,
  IPO_CALENDAR,
  RESULTS_CALENDAR,
  LOT_SIZE_CHANGES,
  BULK_DEALS,
  getAllCalendars
};
