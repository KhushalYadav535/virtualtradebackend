const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', walletController.getWallet);
router.get('/history', walletController.getWalletHistory);

router.put('/reset/:userId', authorize('admin', 'trainer'), walletController.adminResetWallet);
router.get('/batch/:batchId', authorize('admin', 'trainer'), walletController.getBatchWallets);

module.exports = router;