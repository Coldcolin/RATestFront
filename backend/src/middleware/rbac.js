const { AppError } = require('../utils/errors');

/** Must run after requireAuth. Role comes from the database, never from the client. */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
  next();
};

module.exports = { requireRole };
