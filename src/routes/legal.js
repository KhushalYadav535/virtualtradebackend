const express = require('express');
const router = express.Router();
const legalController = require('../controllers/legalController');

router.get('/', legalController.getHub);
router.get('/pages', legalController.listPages);
router.get('/app-info', legalController.getAppInfo);
router.get('/:slug', legalController.getPage);

module.exports = router;
