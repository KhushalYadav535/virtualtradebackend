const express = require('express');
const router = express.Router();
const achievementsController = require('../controllers/achievementsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', achievementsController.getAchievements);

module.exports = router;
