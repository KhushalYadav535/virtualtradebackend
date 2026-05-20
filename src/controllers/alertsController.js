const { z } = require('zod');
const priceAlertsService = require('../services/priceAlerts');

const normalizeSymbol = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  const token = raw.split(/[\s,]+/)[0].replace(/[^A-Z0-9.-]/g, '');
  return token.slice(0, 20);
};

const createSchema = z.object({
  symbol: z.preprocess(
    normalizeSymbol,
    z.string().min(1, 'Symbol is required').max(20, 'Use trading symbol only (max 20 characters)')
  ),
  exchange: z.string().max(10).optional(),
  conditionType: z.enum(['above', 'below', 'pct_up', 'pct_down', 'volume_above', 'lot_value_above']),
  targetPrice: z.number().positive().optional(),
  targetPct: z.number().positive().max(100).optional(),
  minVolume: z.number().int().positive().optional(),
  alertKind: z.enum(['price', 'volume', 'lot_value']).optional()
});

const updateSchema = z.object({
  targetPrice: z.number().positive().optional(),
  targetPct: z.number().positive().max(100).optional()
});

const getAlerts = async (req, res, next) => {
  try {
    const alerts = await priceAlertsService.listActiveAlerts(req.user.id);
    res.json(alerts);
  } catch (err) {
    next(err);
  }
};

const getAlertHistory = async (req, res, next) => {
  try {
    const history = await priceAlertsService.listAlertHistory(req.user.id);
    res.json(history);
  } catch (err) {
    next(err);
  }
};

const createAlert = async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const alert = await priceAlertsService.createAlert(req.user.id, data);
    res.status(201).json(alert);
  } catch (err) {
    next(err);
  }
};

const updateAlert = async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const alert = await priceAlertsService.updateAlert(req.user.id, req.params.id, data);
    res.json(alert);
  } catch (err) {
    next(err);
  }
};

const deleteAlert = async (req, res, next) => {
  try {
    const result = await priceAlertsService.deleteAlert(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAlerts,
  getAlertHistory,
  createAlert,
  updateAlert,
  deleteAlert
};
