const adminService = require('../services/admin');

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

module.exports = {
  getAllStudents, getStudentDetails, createBatch, getBatches,
  updateBatch, assignStudentBatch, banStudent, activateStudent,
  getLeaderboard, exportTrades
};