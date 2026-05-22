const { z } = require('zod');
const { pool } = require('../config/database');

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  startingCapital: z.number().positive().max(100000000).optional()
});

const listPortfolios = async (req, res, next) => {
  try {
    if (!pool) return res.json({ portfolios: [], hasDefault: false, activeId: null });
    const { rows } = await pool.query(
      `SELECT p.*,
        COALESCE((
          SELECT SUM(CASE WHEN th.trade_type = 'BUY' THEN -th.qty * th.trade_price ELSE th.qty * th.trade_price END)
          FROM trade_history th WHERE th.user_id = p.user_id AND th.portfolio_id = p.id
        ), 0) + p.starting_capital as estimated_value
       FROM portfolios p
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    const activeRow = rows.find((r) => r.active);
    const hasDefault = rows.length > 0;
    res.json({ portfolios: rows, hasDefault, activeId: activeRow?.id || null });
  } catch (err) {
    next(err);
  }
};

const createPortfolio = async (req, res, next) => {
  try {
    if (!pool) throw { status: 503, message: 'Database not available' };
    const { name, description, startingCapital } = createSchema.parse(req.body);
    const cap = startingCapital || 100000;

    const { rows: existing } = await pool.query(
      `SELECT COUNT(*) as cnt FROM portfolios WHERE user_id = $1`,
      [req.user.id]
    );
    const isFirst = parseInt(existing[0]?.cnt || '0', 10) === 0;

    const { rows } = await pool.query(
      `INSERT INTO portfolios (user_id, name, description, starting_capital, active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name, description || null, cap, isFirst]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const getPortfolio = async (req, res, next) => {
  try {
    if (!pool) throw { status: 503, message: 'Database not available' };
    const { rows } = await pool.query(
      `SELECT p.*,
        COALESCE((
          SELECT SUM(CASE WHEN th.trade_type = 'BUY' THEN -th.qty * th.trade_price ELSE th.qty * th.trade_price END)
          FROM trade_history th WHERE th.user_id = p.user_id AND th.portfolio_id = p.id
        ), 0) + p.starting_capital as estimated_value
       FROM portfolios p
       WHERE p.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) throw { status: 404, message: 'Portfolio not found' };
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const updatePortfolio = async (req, res, next) => {
  try {
    if (!pool) throw { status: 503, message: 'Database not available' };
    const { name, description } = req.body;
    const { rows } = await pool.query(
      `UPDATE portfolios SET name = COALESCE($1, name), description = COALESCE($2, description)
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [name || null, description ?? null, req.params.id, req.user.id]
    );
    if (!rows.length) throw { status: 404, message: 'Portfolio not found' };
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const deletePortfolio = async (req, res, next) => {
  try {
    if (!pool) throw { status: 503, message: 'Database not available' };
    const { rowCount } = await pool.query(
      `DELETE FROM portfolios WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) throw { status: 404, message: 'Portfolio not found' };
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

const setActivePortfolio = async (req, res, next) => {
  try {
    if (!pool) throw { status: 503, message: 'Database not available' };
    await pool.query(
      `UPDATE portfolios SET active = (id = $1 AND user_id = $2) WHERE user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ activePortfolioId: req.params.id });
  } catch (err) {
    next(err);
  }
};

const comparePortfolios = async (req, res, next) => {
  try {
    if (!pool) return res.json({ comparisons: [] });
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.starting_capital, p.active,
        COALESCE((
          SELECT SUM(CASE WHEN th.trade_type = 'BUY' THEN -th.qty * th.trade_price ELSE th.qty * th.trade_price END)
          FROM trade_history th WHERE th.user_id = p.user_id AND th.portfolio_id = p.id
        ), 0) + p.starting_capital AS estimated_value,
        (SELECT COUNT(*)::int FROM holdings h WHERE h.user_id = p.user_id AND h.portfolio_id = p.id) AS holdings_count,
        (SELECT COALESCE(SUM(th.pnl), 0)::numeric FROM trade_history th
         WHERE th.user_id = p.user_id AND th.portfolio_id = p.id AND th.trade_type = 'SELL') AS realized_pnl
       FROM portfolios p
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    const comparisons = rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      startingCapital: parseFloat(r.starting_capital),
      estimatedValue: parseFloat(r.estimated_value),
      returnPct: r.starting_capital > 0
        ? parseFloat((((r.estimated_value - r.starting_capital) / r.starting_capital) * 100).toFixed(2))
        : 0,
      holdingsCount: r.holdings_count,
      realizedPnl: parseFloat(r.realized_pnl || 0)
    }));
    res.json({ comparisons });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listPortfolios,
  createPortfolio,
  getPortfolio,
  updatePortfolio,
  deletePortfolio,
  setActivePortfolio,
  comparePortfolios
};
