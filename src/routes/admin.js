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

module.exports = router;