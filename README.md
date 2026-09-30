# TradeJournal

A personal trading journal and performance-analysis app. You record your trades, check them against your own strategy checklist, and look at the calculated statistics.

It does not predict prices, recommend trades or connect to a broker, and it uses no AI or paid APIs. All numbers come from your own recorded trades.

| Layer    | Stack                                                       | Deploy target |
| -------- | ----------------------------------------------------------- | ------------- |
| Frontend | React, Vite, Tailwind CSS, React Router, Axios, Recharts, Lucide | Vercel        |
| Backend  | Node.js, Express, Mongoose, JWT, Zod                        | Render        |
| Database | MongoDB                                                     | MongoDB Atlas |

```
trading_journal/
├── client/              React app (Vite)
│   └── src/
│       ├── pages/       Dashboard, Trades, TradeForm, TradeDetail, Analytics, Strategies, StrategyForm, Settings
│       ├── components/  UI kit, charts, calendar, checklist, screenshots
│       └── lib/         api client, formatting, dates, live calculation preview
├── server/              Express API
│   ├── src/
│   │   ├── models/      User, Strategy, Trade, Screenshot
│   │   ├── routes/      auth, settings, trades, strategies, analytics, screenshots, data
│   │   ├── utils/       tradeCalc.js (per-trade math), analytics.js (statistics), money.js (rounding)
│   │   └── services/    trade validation + checklist snapshot
│   └── test/            unit tests for every calculation
└── render.yaml          optional Render blueprint
```

## Running locally

Prerequisites: Node.js 18.18 or newer, and a MongoDB connection string (a local `mongod` or a free Atlas cluster).

```bash
# 1. API
cd server
cp .env.example .env        # then edit MONGODB_URI and JWT_SECRET
npm install
npm run dev                 # http://localhost:5000/api/health

# 2. Frontend (in a second terminal)
cd client
cp .env.example .env        # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev                 # http://localhost:5173
```

Register an account and set your starting balance and currency in **Settings**. Then create a strategy and add trades.

Run the calculation tests with `cd server && npm test`.

## Environment variables

**server/.env**

| Variable         | Example                          | Notes                                              |
| ---------------- | -------------------------------- | -------------------------------------------------- |
| `PORT`           | `5000`                           | Render sets this automatically                     |
| `MONGODB_URI`    | `mongodb+srv://…/tradejournal`   | Required                                           |
| `JWT_SECRET`     | long random string               | Required; at least 32 characters in production     |
| `JWT_EXPIRES_IN` | `7d`                             | Optional                                           |
| `CLIENT_URL`     | `https://your-app.vercel.app`    | Allowed CORS origin(s), comma-separated, no trailing slash |
| `NODE_ENV`       | `production`                     |                                                    |

**client/.env**

| Variable       | Example                                    |
| -------------- | ------------------------------------------ |
| `VITE_API_URL` | `https://your-backend.onrender.com/api`    |

The frontend only reads `VITE_API_URL`. No secrets are ever sent to the browser.

## Deployment

### 1. MongoDB Atlas
1. Create a free cluster and a database user.
2. Under **Network Access**, allow `0.0.0.0/0`. Render's free tier has no fixed outbound IP.
3. Copy the connection string and add a database name, e.g. `…mongodb.net/tradejournal?retryWrites=true&w=majority`.

### 2. Backend → Render
Create a **Web Service** from the repository. You can also use `render.yaml` as a Blueprint.

| Setting        | Value                  |
| -------------- | ---------------------- |
| Root Directory | `server`               |
| Runtime        | Node                   |
| Build Command  | `npm ci --omit=dev`    |
| Start Command  | `npm start`            |
| Health Check   | `/api/health`          |

Environment variables to set: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_URL`. Set `CLIENT_URL` to your Vercel URL once you have it.

### 3. Frontend → Vercel
Import the repository with these settings:

| Setting          | Value            |
| ---------------- | ---------------- |
| Root Directory   | `client`         |
| Framework Preset | Vite             |
| Build Command    | `npm run build`  |
| Output Directory | `dist`           |

Set the environment variable `VITE_API_URL=https://<your-render-service>.onrender.com/api`, then redeploy. The `client/vercel.json` rewrite lets React Router handle deep links such as `/trades/123`.

Finally, put the Vercel URL into Render's `CLIENT_URL` (for example `https://tradejournal.vercel.app`) so CORS allows it. To allow preview deployments as well, list several origins separated by commas.

> Render's free instances sleep when idle, so the first request after a pause can take up to about 30 seconds.

## How the calculations work

Trade values are calculated and validated **on the server** in `server/src/utils/tradeCalc.js`. The form's live preview uses the same rules, but the server recalculates everything on save.

| Value | Formula |
| --- | --- |
| Gross P&L | `(exit − entry) × direction × positionSize × multiplier` (direction = +1 long, −1 short) |
| Net P&L | `gross − fees − swap − slippage` (swap is signed: paid = positive) |
| Risk (1R) | entered risk amount → otherwise `|entry − SL| × size × multiplier` → otherwise `balance × risk%` |
| Risk % | `risk / account balance × 100` |
| Potential reward | `|TP − entry| × size × multiplier` |
| Planned R:R | `|TP − entry| / |entry − SL|` |
| R multiple | `net P&L / risk` (empty when no risk is defined, never NaN) |
| Result | Net > 0 → Win, < 0 → Loss, = 0 → Break-even (can be overridden manually) |

`multiplier` is the value of a 1.0 price move per unit: 1 for stocks and crypto, 100000 for a standard FX lot, 100 for a gold lot. Long trades must have SL < entry < TP, and short trades must have TP < entry < SL.

Statistics are computed in `server/src/utils/analytics.js` from **closed** trades only:

- **Win rate** = wins / closed trades × 100. Break-even trades count in the denominator.
- **Profit factor** = gross profit / |gross loss|. It shows "∞" or "—" when there are no losses.
- **Average win / loss** = total P&L of winning (losing) trades / count.
- **Expectancy** = (win rate × average win) − (loss rate × |average loss|).
- **Average R** = mean R multiple of trades that have a defined risk.
- **Drawdown** comes from the equity curve (starting balance + cumulative net P&L), measured against the running peak.
- **Streaks**: a break-even trade ends a streak.
- **Checklist analysis** groups trades by *conditions satisfied* (Yes) out of *applicable* conditions (N/A excluded), and compares Yes / No / N/A for each condition.

Money is rounded to 2 decimals. Prices keep their full precision.

## API

All routes except register, login and health require `Authorization: Bearer <token>`. Every query is filtered by the authenticated user.

```
POST   /api/auth/register            POST /api/auth/login        GET /api/auth/me
PUT    /api/auth/password            DELETE /api/auth/account
GET|PUT /api/settings

GET    /api/trades?from&to&asset&market&strategyId&setup&direction&result&timeframe&session&q&sort&page&limit
GET    /api/trades/meta              POST /api/trades
GET    /api/trades/:id               PUT  /api/trades/:id        DELETE /api/trades/:id
POST   /api/trades/:id/screenshots   (multipart: kind=before|entry|exit, image)
DELETE /api/trades/:id/screenshots/:kind
GET    /api/screenshots/:id

GET    /api/strategies               POST /api/strategies
GET    /api/strategies/:id           PUT  /api/strategies/:id    DELETE /api/strategies/:id[?force=true]
PATCH  /api/strategies/:id/active    POST /api/strategies/:id/duplicate

GET    /api/analytics/overview | equity | assets | strategies | monthly | checklist?strategyId | calendar?month | breakdown?by

GET    /api/data/export/csv          POST /api/data/import/csv   GET /api/data/backup
POST   /api/data/restore             DELETE /api/data/trades
```

## Notes

- **Screenshots** are stored in MongoDB rather than on disk, because Render's disk is wiped on each deploy. They can only be fetched by their owner through an authenticated request. The server checks the file's actual contents and accepts only PNG, JPEG, WEBP or GIF, up to 4 MB each. Each screenshot counts toward your Atlas storage; the free tier has 512 MB.
- **Dates** are stored as the calendar date and time you enter (`YYYY-MM-DD`, `HH:MM`), so they never shift between timezones.
- **Deleting a strategy** that has trades keeps those trades' strategy name and checklist history. Deactivating the strategy is usually the better option.
- **Backups** (JSON) contain settings, strategies and trades but not screenshots. Restoring checks the whole file first, then replaces your current data.
