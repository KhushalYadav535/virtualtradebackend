const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', walletController.getWallet);
router.get('/funds', walletController.getFundsDetail);
router.get('/history', walletController.getWalletHistory);
router.get('/max-lots', walletController.getMaxLots);
router.post('/add-funds', walletController.addFunds);
router.post('/reset', walletController.selfResetWallet);

router.put('/reset/:userId', authorize('admin', 'trainer'), walletController.adminResetWallet);
router.get('/batch/:batchId', authorize('admin', 'trainer'), walletController.getBatchWallets);

module.exports = router;