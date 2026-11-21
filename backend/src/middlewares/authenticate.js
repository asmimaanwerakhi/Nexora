const AppError = require('../utils/AppError');
const { authenticateAccessToken } = require('../services/tokenService');

const authenticate = async (req, _res, next) => {
  const authorization = req.get('authorization') || '';
  const [scheme, token, extra] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token || extra) {
    next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
    return;
  }

  try {
    const authenticated = await authenticateAccessToken(token);
    req.user = authenticated.user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authenticate;
