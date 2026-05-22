const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('admin', 'trainer'));

router.get('/students', adminController.getAllStudents);
router.get('/students/:studentId', adminController.getStudentDetails);
router.post('/batch', adminController.createBatch);
router.get('/batch', adminController.getBatches);
router.put('/batch/:batchId', adminController.updateBatch);
router.post('/assign-batch/:studentId', adminController.assignStudentBatch);
router.post('/ban/:studentId', adminController.banStudent);
router.post('/activate/:studentId', adminController.activateStudent);
router.get('/leaderboard', adminController.getLeaderboard);
router.get('/trades/export', adminController.exportTrades);
router.get('/analytics', adminController.getAnalytics);
router.get('/orders', adminController.getRecentOrders);
router.get('/lot-logs', adminController.getLotLogs);
router.get('/feature-flags', adminController.getFeatureFlags);
router.get('/lot-sizes', adminController.getLotSizes);
router.patch('/feature-flags', authorize('admin'), adminController.updateFeatureFlags);
router.put('/lot-sizes', authorize('admin'), adminController.updateLotSize);
router.post('/lot-sizes/sync-bulk', authorize('admin'), adminController.syncLotSizes);
router.get('/revenue', authorize('admin'), adminController.getRevenue);
router.get('/tickets', authorize('admin'), adminController.getTickets);
router.post('/tickets/:ticketId/reply', authorize('admin'), adminController.replyTicket);
router.get('/segmentation', authorize('admin'), adminController.getSegmentation);
router.put('/students/:userId/segment', authorize('admin'), adminController.setSegment);
router.get('/ab-tests', authorize('admin'), adminController.getAbTests);
router.patch('/ab-tests', authorize('admin'), adminController.updateAbTests);

module.exports = router;