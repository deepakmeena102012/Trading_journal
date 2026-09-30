const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Strategy = require('../models/Strategy');
const Screenshot = require('../models/Screenshot');
const { registerSchema, loginSchema, passwordChangeSchema } = require('../validation/schemas');
const { requireAuth, signToken } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    const exists = await User.exists({ email });
    if (exists) throw new HttpError(409, 'An account with this email already exists', { email: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    res.status(201).json({ token: signToken(user._id), user: user.toSafeJSON() });
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) throw new HttpError(401, 'Invalid email or password');
    res.json({ token: signToken(user._id), user: user.toSafeJSON() });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

router.put(
  '/password',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);
    const user = await User.findById(req.userId).select('+passwordHash');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Current password is incorrect', { currentPassword: 'Incorrect password' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password updated' });
  })
);

/** Permanently deletes the account and every record that belongs to it. */
router.delete(
  '/account',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password || '');
    const user = await User.findById(req.userId).select('+passwordHash');
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(400, 'Password is incorrect', { password: 'Incorrect password' });
    }
    await Promise.all([
      Screenshot.deleteMany({ userId: req.userId }),
      Trade.deleteMany({ userId: req.userId }),
      Strategy.deleteMany({ userId: req.userId }),
    ]);
    await User.deleteOne({ _id: req.userId });
    res.json({ message: 'Account deleted' });
  })
);

module.exports = router;
