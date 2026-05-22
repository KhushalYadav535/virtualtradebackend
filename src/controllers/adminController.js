const adminService = require('../services/admin');
const adminExtended = require('../services/adminExtended');

const getAllStudents = async (req, res, next) => {
  try {
    const students = await adminService.getAllStudents(req.user.id, req.user.role);
    res.json(students);
  } catch (err) {
    next(err);
  }
};

const getStudentDetails = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const details = await adminService.getStudentDetails(studentId);
    res.json(details);
  } catch (err) {
    next(err);
  }
};

const createBatch = async (req, res, next) => {
  try {
    const { name, startBalance } = req.body;
    const batch = await adminService.createBatch(req.user.id, name, startBalance || 1000000);
    res.status(201).json(batch);
  } catch (err) {
    next(err);
  }
};

const getBatches = async (req, res, next) => {
  try {
    const batches = await adminService.getBatches(req.user.id, req.user.role);
    res.json(batches);
  } catch (err) {
    next(err);
  }
};

const updateBatch = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { startBalance } = req.body;
    const batch = await adminService.updateBatchStartBalance(batchId, startBalance);
    res.json(batch);
  } catch (err) {
    next(err);
  }
};

const assignStudentBatch = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { batchId } = req.body;
    await adminService.assignBatch(studentId, batchId);
    res.json({ message: 'Batch assigned successfully' });
  } catch (err) {
    next(err);
  }
};

const banStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    await adminService.banUser(studentId);
    res.json({ message: 'User banned' });
  } catch (err) {
    next(err);
  }
};

const activateStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    await adminService.activateUser(studentId);
    res.json({ message: 'User activated' });
  } catch (err) {
    next(err);
  }
};

const getLeaderboard = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { batchId, period } = req.query;
    const leaderboard = await adminService.getLeaderboard(limit, batchId || null, period || null);
    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
};

const exportTrades = async (req, res, next) => {
  try {
    const { userId, batchId } = req.query;
    const csvString = await adminService.exportTradesCSV(userId || null, batchId || null);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=trades_export.csv');
    res.send(csvString);
  } catch (err) {
    next(err);
  }
};

const getAnalytics = async (req, res, next) => {
  try {
    const data = await adminService.getAnalytics(req.user.id, req.user.role);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getRecentOrders = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 80;
    const orders = await adminService.getRecentOrders(req.user.id, req.user.role, limit);
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

const getLotLogs = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 80;
    const logs = await adminService.getLotValidationLogs(req.user.id, req.user.role, limit);
    res.json(logs);
  } catch (err) {
    next(err);
  }
};

const getFeatureFlags = async (req, res, next) => {
  try {
    res.json(await adminService.getFeatureFlags());
  } catch (err) {
    next(err);
  }
};

const updateFeatureFlags = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change feature flags' });
    }
    const flags = await adminService.updateFeatureFlags(req.body);
    res.json(flags);
  } catch (err) {
    next(err);
  }
};

const getLotSizes = async (req, res, next) => {
  try {
    res.json(await adminService.getLotSizeMaster());
  } catch (err) {
    next(err);
  }
};

const updateLotSize = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can edit lot sizes' });
    }
    const { symbol, lotSize } = req.body;
    const row = await adminService.upsertLotSize(symbol, lotSize);
    res.json(row);
  } catch (err) {
    next(err);
  }
};

const syncLotSizes = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can sync lot sizes' });
    }
    const result = await adminService.syncLotSizes();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getRevenue = async (req, res, next) => {
  try {
    const data = await adminExtended.getRevenueSummary();
    res.json(data);
  } catch (err) { next(err); }
};

const getTickets = async (req, res, next) => {
  try {
    const tickets = await adminExtended.listAllTickets(req.query.status);
    res.json(tickets);
  } catch (err) { next(err); }
};

const replyTicket = async (req, res, next) => {
  try {
    const ticket = await adminExtended.replyTicket(req.params.ticketId, req.body.reply, req.body.status);
    res.json(ticket);
  } catch (err) { next(err); }
};

const getSegmentation = async (req, res, next) => {
  try {
    res.json(await adminExtended.getSegmentationStats());
  } catch (err) { next(err); }
};

const setSegment = async (req, res, next) => {
  try {
    await adminExtended.setUserSegment(req.params.userId, req.body.segment);
    res.json({ success: true });
  } catch (err) { next(err); }
};

const getAbTests = async (req, res, next) => {
  try {
    res.json(await adminExtended.getAbTestStats());
  } catch (err) { next(err); }
};

const updateAbTests = async (req, res, next) => {
  try {
    await adminExtended.updateAbTests(req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
};

const getCustomMarketData = async (req, res, next) => {
  try {
    res.json(await adminService.getCustomMarketData());
  } catch (err) { next(err); }
};

const updateCustomMarketData = async (req, res, next) => {
  try {
    res.json(await adminService.updateCustomMarketData(req.body));
  } catch (err) { next(err); }
};

const createStudent = async (req, res, next) => {
  try {
    const { name, email, password, batchId } = req.body;
    const student = await adminService.createStudent(name, email, password, batchId);
    res.status(201).json(student);
  } catch (err) { next(err); }
};

const addFunds = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const wallet = await adminService.addFunds(req.params.studentId, amount);
    res.json(wallet);
  } catch (err) { next(err); }
};

module.exports = {
  getAllStudents, getStudentDetails, createBatch, getBatches,
  updateBatch, assignStudentBatch, banStudent, activateStudent,
  getLeaderboard, exportTrades,
  getAnalytics, getRecentOrders, getLotLogs,
  getFeatureFlags, updateFeatureFlags, getLotSizes, updateLotSize,
  syncLotSizes,
  getRevenue, getTickets, replyTicket, getSegmentation, setSegment, getAbTests, updateAbTests,
  getCustomMarketData, updateCustomMarketData, createStudent, addFunds
};