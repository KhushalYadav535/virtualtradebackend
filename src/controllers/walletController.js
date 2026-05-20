const walletService = require('../services/wallet');

const getWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.getWallet(req.user.id);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
};

const getWalletHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await walletService.getWalletHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
};

const adminResetWallet = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { amount } = req.body;
    const wallet = await walletService.resetWallet(userId, amount || 1000000);
    res.json({ message: 'Wallet reset successfully', wallet });
  } catch (err) {
    next(err);
  }
};

const getBatchWallets = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const wallets = await walletService.getBatchWallets(batchId);
    res.json(wallets);
  } catch (err) {
    next(err);
  }
};

module.exports = { getWallet, getWalletHistory, adminResetWallet, getBatchWallets };