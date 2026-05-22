/** Achievement catalog — synced to DB on startup */
const ACHIEVEMENT_DEFINITIONS = [
  { id: 'first_trade', title: 'First Trade', description: 'Place your very first executed trade', icon: 'rocket', points: 50, category: 'milestone' },
  { id: 'first_lot_trade', title: 'Lot Trader', description: 'Execute a trade of at least 1 full lot (F&O style)', icon: 'layers', points: 75, category: 'lots' },
  { id: 'trades_10', title: 'Active Trader', description: 'Complete 10 executed trades', icon: 'pulse', points: 80, category: 'milestone' },
  { id: 'trades_100', title: 'Century Club', description: 'Complete 100 executed trades', icon: 'ribbon', points: 200, category: 'milestone' },
  { id: 'lots_100', title: '100 Lots', description: 'Trade a cumulative 100 lots (lot-equivalent)', icon: 'cube', points: 150, category: 'lots' },
  { id: 'first_profit', title: 'First Profit', description: 'Close a trade with positive realized P&L', icon: 'trending-up', points: 100, category: 'pnl' },
  { id: 'return_1pct', title: '1% Return', description: 'Reach 1% total portfolio return', icon: 'stats-chart', points: 120, category: 'pnl' },
  { id: 'return_10pct', title: '10% Return', description: 'Reach 10% total portfolio return', icon: 'trophy', points: 300, category: 'pnl' },
  { id: 'all_order_types', title: 'Order Explorer', description: 'Use Market, Limit, and Stop order modes', icon: 'options', points: 100, category: 'orders' },
  { id: 'lot_master', title: 'Lot Master', description: 'Place 25+ trades using lot-sized quantities', icon: 'grid', points: 150, category: 'lots' },
  { id: 'diversity', title: 'Diverse Portfolio', description: 'Hold 5 different stocks at once', icon: 'pie-chart', points: 75, category: 'portfolio' },
  { id: 'streak_week', title: 'Week Streak', description: 'Trade on 5 different days in a week', icon: 'flame', points: 200, category: 'streak' },
  { id: 'streak_month', title: 'Month Streak', description: 'Trade on 15 different days in 30 days', icon: 'calendar', points: 400, category: 'streak' },
  { id: 'diamond_hands', title: 'Diamond Hands', description: 'Hold a delivery position 7+ days', icon: 'diamond', points: 200, category: 'portfolio' },
  { id: 'referral_hero', title: 'Referral Hero', description: 'Successfully refer a friend to VirtualTrade', icon: 'people', points: 500, category: 'social' }
];

module.exports = { ACHIEVEMENT_DEFINITIONS };
