const reportService = require('../services/reportService');
const AppError = require('../utils/AppError');

const createReport = async (req, res) => {
  const report = await reportService.createReport(req.user._id, req.validatedBody);
  res.status(201).json({
    data: {
      report: {
        id: report._id.toString(),
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt,
      },
    },
  });
};

const getMine = async (req, res) => {
  const reports = await reportService.getMyReports(req.user._id);
  res.status(200).json({ data: { reports } });
};

const requireReportAdmin = (req, _res, next) => {
  const administratorIds = (process.env.REPORT_ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!administratorIds.length) {
    next(
      new AppError(
        503,
        'REPORT_REVIEW_NOT_CONFIGURED',
        'Set REPORT_ADMIN_USER_IDS to enable report review',
      ),
    );
    return;
  }
  if (!administratorIds.includes(req.user._id.toString())) {
    next(
      new AppError(
        403,
        'REPORT_ADMIN_REQUIRED',
        'Only configured administrators can review reports',
      ),
    );
    return;
  }
  next();
};

const listOpen = async (_req, res) => {
  const reports = await reportService.listOpenReports();
  res.status(200).json({ data: { reports } });
};

const updateStatus = async (req, res) => {
  const report = await reportService.updateReportStatus(
    req.params.reportId,
    req.validatedBody.status,
  );
  res.status(200).json({ data: { report } });
};

module.exports = { createReport, getMine, listOpen, requireReportAdmin, updateStatus };
