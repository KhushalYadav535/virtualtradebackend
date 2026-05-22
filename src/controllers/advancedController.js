const { getMarketDepth } = require('../services/marketDepth');
const { getFuturesList, rolloverPosition } = require('../services/futuresHub');
const { runScreener, saveScan, listScans, getScan, deleteScan, getPresetScans } = require('../services/stockScreener');
const scanAlerts = require('../services/scanAlerts');
const { getOptionsStrategies } = require('../services/optionsStrategies');
const baskets = require('../services/baskets');

const getDepth = async (req, res, next) => {
  try {
    const depth = await getMarketDepth(req.params.symbol);
    res.json(depth);
  } catch (err) {
    next(err);
  }
};

const getFutures = async (req, res, next) => {
  try {
    const data = await getFuturesList(req.user?.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getScreener = async (req, res, next) => {
  try {
    const data = await runScreener(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getScreenerPresets = async (req, res, next) => {
  try {
    res.json(getPresetScans());
  } catch (err) {
    next(err);
  }
};

const getStrategies = async (req, res, next) => {
  try {
    const { symbol, expiry } = req.query;
    const data = await getOptionsStrategies(symbol || 'NIFTY', expiry || null);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const listBaskets = async (req, res, next) => {
  try {
    res.json(await baskets.listBaskets(req.user.id));
  } catch (err) {
    next(err);
  }
};

const getBasket = async (req, res, next) => {
  try {
    const b = await baskets.getBasket(req.user.id, req.params.id);
    if (!b) return res.status(404).json({ error: 'Basket not found' });
    res.json(b);
  } catch (err) {
    next(err);
  }
};

const createBasket = async (req, res, next) => {
  try {
    const b = await baskets.createBasket(req.user.id, req.body);
    res.status(201).json(b);
  } catch (err) {
    next(err);
  }
};

const updateBasket = async (req, res, next) => {
  try {
    const b = await baskets.updateBasket(req.user.id, req.params.id, req.body);
    if (!b) return res.status(404).json({ error: 'Basket not found' });
    res.json(b);
  } catch (err) {
    next(err);
  }
};

const deleteBasket = async (req, res, next) => {
  try {
    const ok = await baskets.deleteBasket(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Basket not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const executeBasket = async (req, res, next) => {
  try {
    const result = await baskets.executeBasket(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getSharedBasket = async (req, res, next) => {
  try {
    const b = await baskets.getBasketByShareToken(req.params.token);
    if (!b) return res.status(404).json({ error: 'Basket not found' });
    res.json(b);
  } catch (err) {
    next(err);
  }
};

const cloneSharedBasket = async (req, res, next) => {
  try {
    const b = await baskets.cloneBasketFromShare(req.user.id, req.params.token);
    res.status(201).json(b);
  } catch (err) {
    next(err);
  }
};

const getScreenerWithUser = async (req, res, next) => {
  try {
    const data = await runScreener(req.query, req.user?.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const saveScanHandler = async (req, res, next) => {
  try {
    const { name, filters } = req.body;
    if (!name || !filters) return res.status(400).json({ error: 'name and filters required' });
    const scan = await saveScan(req.user.id, name, filters);
    res.status(201).json(scan);
  } catch (err) {
    next(err);
  }
};

const listScansHandler = async (req, res, next) => {
  try {
    const scans = await listScans(req.user.id);
    res.json(scans);
  } catch (err) {
    next(err);
  }
};

const getScanHandler = async (req, res, next) => {
  try {
    const scan = await getScan(req.params.id, req.user.id);
    res.json(scan);
  } catch (err) {
    next(err);
  }
};

const deleteScanHandler = async (req, res, next) => {
  try {
    await deleteScan(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const subscribeScanAlert = async (req, res, next) => {
  try {
    const sub = await scanAlerts.subscribeScanAlert(req.user.id, req.body);
    res.status(201).json(sub);
  } catch (err) {
    next(err);
  }
};

const listScanAlerts = async (req, res, next) => {
  try {
    res.json(await scanAlerts.listScanAlerts(req.user.id));
  } catch (err) {
    next(err);
  }
};

const deleteScanAlert = async (req, res, next) => {
  try {
    await scanAlerts.deleteScanAlert(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const futuresRollover = async (req, res, next) => {
  try {
    const { symbol } = req.body;
    if (!symbol) throw { status: 400, message: 'Symbol required' };
    const result = await rolloverPosition(req.user.id, symbol.toUpperCase());
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDepth,
  getFutures,
  getScreener: getScreenerWithUser,
  getScreenerPresets,
  getStrategies,
  saveScan: saveScanHandler,
  listScans: listScansHandler,
  getScan: getScanHandler,
  deleteScan: deleteScanHandler,
  listBaskets,
  getBasket,
  createBasket,
  updateBasket,
  deleteBasket,
  executeBasket,
  getSharedBasket,
  cloneSharedBasket,
  futuresRollover,
  subscribeScanAlert,
  listScanAlerts,
  deleteScanAlert
};
