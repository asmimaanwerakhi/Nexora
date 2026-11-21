const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const reportController = require('../controllers/reportController');
const { reportSchema, reportStatusSchema } = require('../validators/phase6Schemas');

const router = express.Router();
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.post('/', reportLimiter, validate(reportSchema), reportController.createReport);
router.get('/mine', reportController.getMine);
router.get('/admin', reportController.requireReportAdmin, reportController.listOpen);
router.patch(
  '/admin/:reportId',
  reportController.requireReportAdmin,
  validate(reportStatusSchema),
  reportController.updateStatus,
);

module.exports = router;
