const {
  getLegalPage,
  getAllLegalPages,
  getLegalHub,
  APP_INFO
} = require('../data/legalContent');

const getHub = async (req, res, next) => {
  try {
    res.json(getLegalHub());
  } catch (err) {
    next(err);
  }
};

const listPages = async (req, res, next) => {
  try {
    res.json({ pages: getAllLegalPages(), appInfo: APP_INFO });
  } catch (err) {
    next(err);
  }
};

const getPage = async (req, res, next) => {
  try {
    const page = getLegalPage(req.params.slug);
    if (!page) return res.status(404).json({ error: 'Legal page not found' });
    res.json({ page, appInfo: APP_INFO });
  } catch (err) {
    next(err);
  }
};

const getAppInfo = async (req, res, next) => {
  try {
    res.json(APP_INFO);
  } catch (err) {
    next(err);
  }
};

module.exports = { getHub, listPages, getPage, getAppInfo };
