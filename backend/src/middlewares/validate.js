const AppError = require('../utils/AppError');

const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    next(new AppError(400, 'VALIDATION_ERROR', message));
    return;
  }

  req.validatedBody = result.data;
  next();
};

module.exports = validate;
