const { pool } = require('../config/database');

const checkAndAwardAchievements = async (userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Fetch all achievements
    const allAcvRes = await client.query('SELECT * FROM achievements');
    const achievements = allAcvRes.rows;
    
    // Fetch user unlocked achievements
    const userAcvRes = await client.query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId]);
    const unlockedIds = new Set(userAcvRes.rows.map(row => row.achievement_id));
    
    // Fetch user stats
    const tradesRes = await client.query('SELECT count(*) as count, SUM(qty) as total_shares FROM trade_history WHERE user_id = $1', [userId]);
    const tradeCount = parseInt(tradesRes.rows[0].count) || 0;
    // Note: total_shares is shares, lots depends on stock. For simplicity we check trade count.
    
    const profitRes = await client.query('SELECT count(*) as count FROM trade_history WHERE user_id = $1 AND pnl > 0', [userId]);
    const profitCount = parseInt(profitRes.rows[0].count) || 0;
    
    const holdingsRes = await client.query('SELECT count(*) as count FROM holdings WHERE user_id = $1', [userId]);
    const uniqueHoldings = parseInt(holdingsRes.rows[0].count) || 0;
    
    const newUnlocks = [];
    
    if (tradeCount >= 1 && !unlockedIds.has('first_trade')) {
      newUnlocks.push('first_trade');
    }
    if (profitCount >= 1 && !unlockedIds.has('first_profit')) {
      newUnlocks.push('first_profit');
    }
    if (tradeCount >= 10 && !unlockedIds.has('lot_master')) { // Simplify lot master to 10 trades for MVP
      newUnlocks.push('lot_master');
    }
    if (uniqueHoldings >= 5 && !unlockedIds.has('diversity')) {
      newUnlocks.push('diversity');
    }
    
    if (newUnlocks.length > 0) {
      for (const acvId of newUnlocks) {
        await client.query(
          'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, acvId]
        );
      }
    }

    await client.query('COMMIT');

    if (newUnlocks.length > 0) {
      const acvById = Object.fromEntries(achievements.map((a) => [a.id, a]));
      const { createNotification } = require('./notifications');
      for (const acvId of newUnlocks) {
        const acv = acvById[acvId];
        if (acv) {
          createNotification(userId, {
            type: 'achievement',
            title: `Achievement unlocked: ${acv.title}`,
            body: acv.description,
            metadata: { achievementId: acvId, points: acv.points }
          }).catch(() => {});
        }
      }
    }

    return newUnlocks;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error checking achievements:', err);
    return [];
  } finally {
    client.release();
  }
};

const getUserAchievements = async (userId) => {
  const result = await pool.query(`
    SELECT a.*, 
           CASE WHEN ua.id IS NOT NULL THEN true ELSE false END as is_unlocked,
           ua.unlocked_at
    FROM achievements a
    LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
    ORDER BY a.points ASC
  `, [userId]);
  
  const totalPoints = result.rows.reduce((sum, row) => sum + (row.is_unlocked ? row.points : 0), 0);
  
  // Calculate level based on points (e.g. 100 points = level 2)
  const level = Math.floor(totalPoints / 100) + 1;
  const nextLevelPoints = level * 100;
  const progressToNextLevel = (totalPoints % 100);
  
  return {
    achievements: result.rows,
    stats: {
      totalPoints,
      level,
      nextLevelPoints,
      progressToNextLevel
    }
  };
};

module.exports = {
  checkAndAwardAchievements,
  getUserAchievements
};
