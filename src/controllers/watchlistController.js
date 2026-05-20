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

module.exports = { getWatchlists, createWatchlist, deleteWatchlist, addToWatchlist, removeFromWatchlist };