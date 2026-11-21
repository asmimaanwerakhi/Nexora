const callService = require('../services/callService');

const getCallHistory = async (req, res) => {
  const result = await callService.listCallHistory(req.user._id, req.query.cursor);
  res.status(200).json({ data: result });
};

module.exports = { getCallHistory };
