const watchlistService = require('../services/watchlist');

const getWatchlists = async (req, res, next) => {
  try {
    const watchlists = await watchlistService.getWatchlists(req.user.id);
    res.json(watchlists);
  } catch (err) {
    next(err);
  }
};

const createWatchlist = async (req, res, next) => {
  try {
    const { name } = req.body;
    const watchlist = await watchlistService.createWatchlist(req.user.id, name);
    res.status(201).json(watchlist);
  } catch (err) {
    next(err);
  }
};

const renameWatchlist = async (req, res, next) => {
  try {
    const { watchlistId } = req.params;
    const { name } = req.body;
    const watchlist = await watchlistService.renameWatchlist(req.user.id, watchlistId, name);
    res.json(watchlist);
  } catch (err) {
    next(err);
  }
};

const deleteWatchlist = async (req, res, next) => {
  try {
    const { watchlistId } = req.params;
    await watchlistService.deleteWatchlist(req.user.id, watchlistId);
    res.json({ message: 'Watchlist deleted' });
  } catch (err) {
    next(err);
  }
};

const addToWatchlist = async (req, res, next) => {
  try {
    const { watchlistId } = req.params;
    const { symbol } = req.body;
    await watchlistService.addToWatchlist(req.user.id, watchlistId, symbol.toUpperCase());
    res.json({ message: 'Added to watchlist' });
  } catch (err) {
    next(err);
  }
};

const removeFromWatchlist = async (req, res, next) => {
  try {
    const { watchlistId, symbol } = req.params;
    await watchlistService.removeFromWatchlist(req.user.id, watchlistId, symbol.toUpperCase());
    res.json({ message: 'Removed from watchlist' });
  } catch (err) {
    next(err);
  }
};

const reorderWatchlist = async (req, res, next) => {
  try {
    const { watchlistId } = req.params;
    const { symbols } = req.body;
    const result = await watchlistService.reorderWatchlist(req.user.id, watchlistId, symbols);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const importTemplate = async (req, res, next) => {
  try {
    const { watchlistId } = req.params;
    const { templateKey } = req.body;
    const result = await watchlistService.importTemplate(req.user.id, watchlistId, templateKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const shareWatchlist = async (req, res, next) => {
  try {
    const { watchlistId } = req.params;
    const result = await watchlistService.shareWatchlist(req.user.id, watchlistId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getSharedWatchlist = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await watchlistService.getSharedWatchlist(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const cloneSharedWatchlist = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { name } = req.body;
    const wl = await watchlistService.cloneSharedWatchlist(req.user.id, token, name);
    res.status(201).json(wl);
  } catch (err) {
    next(err);
  }
};

const getTemplates = async (req, res, next) => {
  try {
    const { getWatchlistTemplates } = require('../services/marketData');
    res.json(getWatchlistTemplates());
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getWatchlists,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  importTemplate,
  shareWatchlist,
  getSharedWatchlist,
  cloneSharedWatchlist,
  getTemplates
};