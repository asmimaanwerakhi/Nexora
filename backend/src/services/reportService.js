const mongoose = require('mongoose');
const Message = require('../models/message');
const Report = require('../models/report');
const User = require('../models/user');
const AppError = require('../utils/AppError');
const chatService = require('./chatService');

const createReport = async (reporter, values) => {
  if (reporter.toString() === values.reportedUserId) {
    throw new AppError(400, 'INVALID_REPORT_TARGET', 'You cannot report yourself');
  }
  if (!(await User.exists({ _id: values.reportedUserId }))) {
    throw new AppError(404, 'USER_NOT_FOUND', 'The reported user was not found');
  }
  if (values.messageId) {
    const message = await Message.findById(values.messageId);
    if (!message || message.deletedForAll || message.sender?.toString() !== values.reportedUserId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'The report message was not found');
    }
    await chatService.getConversationForUser(message.conversationId, reporter);
    if (message.deletedFor.some((id) => id.toString() === reporter.toString())) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'The report message was not found');
    }
  }
  return Report.create({
    reporter,
    reportedUser: values.reportedUserId,
    messageId: values.messageId || null,
    reason: values.reason,
    details: values.details || '',
  });
};

const getMyReports = async (reporter) =>
  Report.find({ reporter })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('reportedUser', 'name username avatar')
    .populate('messageId', 'text type createdAt');

const listOpenReports = async () =>
  Report.find({ status: { $in: ['open', 'reviewing'] } })
    .sort({ createdAt: 1 })
    .limit(100)
    .populate('reporter reportedUser', 'name username avatar')
    .populate('messageId', 'text type createdAt');

const updateReportStatus = async (reportId, status) => {
  if (!mongoose.isValidObjectId(reportId)) {
    throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
  }
  const report = await Report.findByIdAndUpdate(
    reportId,
    {
      $set: {
        status,
        reviewedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  );
  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
  return report;
};

module.exports = { createReport, getMyReports, listOpenReports, updateReportStatus };
