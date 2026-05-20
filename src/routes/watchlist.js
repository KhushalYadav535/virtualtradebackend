const express = require('express');
const router = express.Router();
const watchlistController = require('../controllers/watchlistController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/templates', watchlistController.getTemplates);
router.get('/shared/:token', watchlistController.getSharedWatchlist);
router.post('/shared/:token/clone', watchlistController.cloneSharedWatchlist);

router.get('/', watchlistController.getWatchlists);
router.post('/', watchlistController.createWatchlist);
router.put('/:watchlistId', watchlistController.renameWatchlist);
router.delete('/:watchlistId', watchlistController.deleteWatchlist);
router.post('/:watchlistId/add', watchlistController.addToWatchlist);
router.delete('/:watchlistId/remove/:symbol', watchlistController.removeFromWatchlist);
router.put('/:watchlistId/reorder', watchlistController.reorderWatchlist);
router.post('/:watchlistId/import', watchlistController.importTemplate);
router.post('/:watchlistId/share', watchlistController.shareWatchlist);
module.exports = router;