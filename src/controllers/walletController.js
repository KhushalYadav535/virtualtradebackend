const walletService = require('../services/wallet');
const { z } = require('zod');

const amountSchema = z.object({
  amount: z.coerce.number().positive()
});

const getWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.getFundsDetail(req.user.id);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
};

const getFundsDetail = getWallet;

const getWalletHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await walletService.getWalletHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
};

const addFunds = async (req, res, next) => {
  try {
    const { amount } = amountSchema.parse(req.body);
    const result = await walletService.addFunds(req.user.id, amount);
    const funds = await walletService.getFundsDetail(req.user.id);
    res.json({
      message: `₹${amount.toLocaleString('en-IN')} added to virtual wallet`,
      ...result,
      funds
    });
  } catch (err) {
    next(err);
  }
};

const selfResetWallet = async (req, res, next) => {
  try {
    const amount = req.body?.amount ? z.coerce.number().positive().parse(req.body.amount) : undefined;
    const wallet = await walletService.selfResetWallet(req.user.id, amount);
    const funds = await walletService.getFundsDetail(req.user.id);
    res.json({
      message: 'Account reset — holdings, positions and history cleared',
      wallet,
      funds
    });
  } catch (err) {
    next(err);
  }
};

const getMaxLots = async (req, res, next) => {
  try {
    const symbol = req.query.symbol;
    const productType = req.query.productType || 'MIS';
    const data = await walletService.getMaxLotsAffordable(req.user.id, symbol, productType);
    res.json(data);
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

module.exports = {
  getWallet,
  getFundsDetail,
  getWalletHistory,
  addFunds,
  selfResetWallet,
  getMaxLots,
  adminResetWallet,
  getBatchWallets
};