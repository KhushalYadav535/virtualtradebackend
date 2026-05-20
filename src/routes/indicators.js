const express = require('express');
const router = express.Router();
const indicatorsController = require('../controllers/indicatorsController');

router.get('/calculate', indicatorsController.getIndicators);

module.exports = router;