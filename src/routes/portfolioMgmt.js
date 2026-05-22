const express = require('express');
const router = express.Router();
const pmController = require('../controllers/portfolioMgmtController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', pmController.listPortfolios);
router.get('/compare/all', pmController.comparePortfolios);
router.post('/', pmController.createPortfolio);
router.get('/:id', pmController.getPortfolio);
router.put('/:id', pmController.updatePortfolio);
router.delete('/:id', pmController.deletePortfolio);
router.post('/:id/activate', pmController.setActivePortfolio);

module.exports = router;
