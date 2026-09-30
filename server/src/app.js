const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { clientUrls, isProd } = require('./config/env');
const { requireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

app.set('trust proxy', 1); // Render sits behind a proxy (needed for rate limiting by IP)
app.set('query parser', 'simple'); // no nested objects in query strings
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (no Origin header) and the configured frontend origins.
      if (!origin || clientUrls.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use((req, res, next) => (req.path === '/api/data/restore' ? next() : express.json({ limit: '1mb' })(req, res, next)));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', requireAuth, require('./routes/settings'));
app.use('/api/trades', requireAuth, require('./routes/trades'));
app.use('/api/strategies', requireAuth, require('./routes/strategies'));
app.use('/api/analytics', requireAuth, require('./routes/analytics'));
app.use('/api/screenshots', requireAuth, require('./routes/screenshots'));
app.use('/api/data', requireAuth, require('./routes/data'));

app.use(notFound);
app.use(errorHandler);

if (!isProd) console.log(`CORS allowed origins: ${clientUrls.join(', ')}`);

module.exports = app;
