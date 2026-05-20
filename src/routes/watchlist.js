const express = require('express');
const router = express.Router();
const watchlistController = require('../controllers/watchlistController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', watchlistController.getWatchlists);
router.post('/', watchlistController.createWatchlist);
router.delete('/:watchlistId', watchlistController.deleteWatchlist);
router.post('/:watchlistId/add', watchlistController.addToWatchlist);
router.delete('/:watchlistId/remove/:symbol', watchlistController.removeFromWatchlist);

module.exports = router;