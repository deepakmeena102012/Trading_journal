const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const User = require('../models/User');
const { HttpError } = require('./errors');

/** Verifies the Bearer token and attaches the authenticated user as req.user / req.userId. */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      throw new HttpError(401, 'Session expired or invalid. Please log in again.');
    }
    if (!payload.sub || !mongoose.isValidObjectId(payload.sub)) throw new HttpError(401, 'Invalid token');

    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, 'Account not found');

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    next(err);
  }
}

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, jwtSecret, { expiresIn: jwtExpiresIn });
}

module.exports = { requireAuth, signToken };
