const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

globalThis.__AURA_DB = globalThis.__AURA_DB || {
  users: [],
  portfolios: [],
  positions: [],
  transactions: []
};
const memoryDb = globalThis.__AURA_DB;

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
let pool = null;

if (dbUrl) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });
  } catch (e) {
    console.error('PostgreSQL init error:', e.message);
  }
}

async function initDb() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        cash_balance NUMERIC(15, 2) NOT NULL DEFAULT 1000000.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        shares NUMERIC(15, 4) NOT NULL,
        avg_price NUMERIC(15, 2) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(portfolio_id, symbol)
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        shares NUMERIC(15, 4) NOT NULL,
        price NUMERIC(15, 2) NOT NULL,
        total_value NUMERIC(15, 2) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('Schema init error:', err.message);
  }
}
initDb();

const quoteCache = {};

function fetchYahooQuote(symbol) {
  return new Promise((resolve) => {
    const cached = quoteCache[symbol];
    if (cached && Date.now() - cached.timestamp < 3000) {
      return resolve(cached.data);
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const meta = parsed.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number') {
            const currentPrice = meta.regularMarketPrice;
            const prevClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
            const change = currentPrice - prevClose;
            const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

            const isTrading = meta.currentTradingPeriod?.regular
              ? Date.now() / 1000 >= meta.currentTradingPeriod.regular.start &&
                Date.now() / 1000 <= meta.currentTradingPeriod.regular.end
              : false;

            const result = {
              symbol: symbol.toUpperCase(),
              name: meta.shortName || meta.symbol || symbol,
              price: currentPrice,
              change: parseFloat(change.toFixed(2)),
              changePercent: parseFloat(changePercent.toFixed(2)),
              high: meta.regularMarketDayHigh || currentPrice,
              low: meta.regularMarketDayLow || currentPrice,
              volume: meta.regularMarketVolume || 0,
              marketState: isTrading ? 'REGULAR' : 'CLOSED',
              isLive: isTrading,
              lastUpdated: new Date().toISOString()
            };
            quoteCache[symbol] = { timestamp: Date.now(), data: result };
            return resolve(result);
          }
        } catch {}
        resolve(getFallbackQuote(symbol));
      });
    });

    req.on('error', () => resolve(getFallbackQuote(symbol)));
    req.setTimeout(3500, () => {
      req.destroy();
      resolve(getFallbackQuote(symbol));
    });
  });
}

function getFallbackQuote(symbol) {
  const fallbacks = {
    'AAPL': { price: 232.40, name: 'Apple Inc.' },
    'NVDA': { price: 128.50, name: 'NVIDIA Corporation' },
    'MSFT': { price: 448.20, name: 'Microsoft Corporation' },
    'TSLA': { price: 248.80, name: 'Tesla, Inc.' },
    'SPY': { price: 562.10, name: 'SPDR S&P 500 ETF' },
    'QQQ': { price: 489.30, name: 'Invesco QQQ Trust' },
    'BTC-USD': { price: 61850.00, name: 'Bitcoin USD' },
    'ETH-USD': { price: 2420.00, name: 'Ethereum USD' }
  };
  const base = fallbacks[symbol.toUpperCase()] || { price: 100.00, name: symbol.toUpperCase() };
  return {
    symbol: symbol.toUpperCase(),
    name: base.name,
    price: base.price,
    change: 0.00,
    changePercent: 0.00,
    high: base.price * 1.01,
    low: base.price * 0.99,
    volume: 1500000,
    marketState: 'CLOSED',
    isLive: false,
    lastUpdated: new Date().toISOString()
  };
}

function fetchYahooChart(symbol, range = '1M') {
  return new Promise((resolve) => {
    let interval = '1d';
    let yRange = '1mo';
    if (range === '1D') { interval = '5m'; yRange = '1d'; }
    else if (range === '1W') { interval = '15m'; yRange = '5d'; }
    else if (range === '1Y') { interval = '1wk'; yRange = '1y'; }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${yRange}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const timestamps = parsed.chart?.result?.[0]?.timestamp || [];
          const quotes = parsed.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
          const history = [];

          for (let i = 0; i < timestamps.length; i++) {
            if (quotes[i] !== null && quotes[i] !== undefined) {
              const d = new Date(timestamps[i] * 1000);
              history.push({
                time: range === '1D'
                  ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                price: parseFloat(quotes[i].toFixed(2))
              });
            }
          }
          if (history.length > 0) return resolve(history);
        } catch {}
        resolve([]);
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(4000, () => { req.destroy(); resolve([]); });
  });
}

const router = express.Router();

router.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    database: pool ? 'postgresql' : 'in-memory-safe',
    timestamp: new Date().toISOString()
  });
});

router.post('/auth/register', async (req, res) => {
  try {
    const { username, accessCode } = req.body;
    if (!username || !accessCode) {
      return res.status(400).json({ error: 'Username and access code required' });
    }
    const cleanUser = username.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(accessCode).digest('hex');
    const userId = 'usr_' + crypto.randomUUID().slice(0, 8);

    if (pool) {
      const exists = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUser]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Username already registered' });

      await pool.query('INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)', [userId, cleanUser, hash]);

      const defaults = ['Core Equity', 'Growth & Momentum', 'Macro & Crypto'];
      for (const name of defaults) {
        const pId = 'port_' + crypto.randomUUID().slice(0, 8);
        await pool.query('INSERT INTO portfolios (id, user_id, name, cash_balance) VALUES ($1, $2, $3, $4)', [pId, userId, name, 1000000.00]);
      }
    } else {
      if (memoryDb.users.some(u => u.username.toLowerCase() === cleanUser)) {
        return res.status(409).json({ error: 'Username already registered' });
      }
      memoryDb.users.push({ id: userId, username: cleanUser, password_hash: hash });
      const defaults = ['Core Equity', 'Growth & Momentum', 'Macro & Crypto'];
      for (const name of defaults) {
        memoryDb.portfolios.push({
          id: 'port_' + crypto.randomUUID().slice(0, 8),
          user_id: userId,
          name,
          cash_balance: 1000000.00
        });
      }
    }

    // Return both flat and nested keys to support all client formats
    res.status(201).json({
      id: userId,
      username: cleanUser,
      user: { id: userId, username: cleanUser }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, accessCode } = req.body;
    const cleanUser = username?.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(accessCode).digest('hex');

    let user = null;
    if (pool) {
      const result = await pool.query('SELECT id, username, password_hash FROM users WHERE LOWER(username) = $1', [cleanUser]);
      user = result.rows[0];
    } else {
      user = memoryDb.users.find(u => u.username.toLowerCase() === cleanUser);
    }

    if (!user || user.password_hash !== hash) {
      return res.status(401).json({ error: 'Invalid username or access code' });
    }

    res.json({
      id: user.id,
      username: user.username,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/portfolios/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let ports = [];
    let positions = [];
    let txs = [];

    if (pool) {
      const pRes = await pool.query('SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
      ports = pRes.rows;
      const portIds = ports.map(p => p.id);

      if (portIds.length > 0) {
        const posRes = await pool.query('SELECT * FROM positions WHERE portfolio_id = ANY($1)', [portIds]);
        positions = posRes.rows;
        const txRes = await pool.query('SELECT * FROM transactions WHERE portfolio_id = ANY($1) ORDER BY executed_at DESC LIMIT 50', [portIds]);
        txs = txRes.rows;
      }
    } else {
      ports = memoryDb.portfolios.filter(p => p.user_id === userId);
      const portIds = ports.map(p => p.id);
      positions = memoryDb.positions.filter(pos => portIds.includes(pos.portfolio_id));
      txs = memoryDb.transactions
        .filter(t => portIds.includes(t.portfolio_id))
        .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at))
        .slice(0, 50);
    }

    const payload = ports.map(p => ({
      id: p.id,
      name: p.name,
      cashBalance: parseFloat(p.cash_balance),
      positions: positions
        .filter(pos => pos.portfolio_id === p.id)
        .map(pos => ({
          id: pos.id,
          symbol: pos.symbol,
          shares: parseFloat(pos.shares),
          avgPrice: parseFloat(pos.avg_price)
        })),
      transactions: txs
        .filter(t => t.portfolio_id === p.id)
        .map(t => ({
          id: t.id,
          symbol: t.symbol,
          type: t.type,
          shares: parseFloat(t.shares),
          price: parseFloat(t.price),
          totalValue: parseFloat(t.total_value),
          timestamp: t.executed_at
        }))
    }));

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/portfolios/trade', async (req, res) => {
  try {
    const { portfolioId, symbol, type, shares, price } = req.body;
    const qty = parseFloat(shares);
    const execPrice = parseFloat(price);
    const totalCost = qty * execPrice;
    const upperSym = symbol.toUpperCase();

    if (pool) {
      const pRes = await pool.query('SELECT * FROM portfolios WHERE id = $1', [portfolioId]);
      const portfolio = pRes.rows[0];
      if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

      let cash = parseFloat(portfolio.cash_balance);
      const posRes = await pool.query('SELECT * FROM positions WHERE portfolio_id = $1 AND symbol = $2', [portfolioId, upperSym]);
      const pos = posRes.rows[0];

      if (type === 'BUY') {
        if (cash < totalCost) return res.status(400).json({ error: 'Insufficient cash reserves' });
        cash -= totalCost;
        if (pos) {
          const oldShares = parseFloat(pos.shares);
          const oldAvg = parseFloat(pos.avg_price);
          const newShares = oldShares + qty;
          const newAvg = (oldShares * oldAvg + totalCost) / newShares;
          await pool.query('UPDATE positions SET shares = $1, avg_price = $2, updated_at = NOW() WHERE id = $3', [newShares, newAvg, pos.id]);
        } else {
          await pool.query('INSERT INTO positions (id, portfolio_id, symbol, shares, avg_price) VALUES ($1, $2, $3, $4, $5)', [
            'pos_' + crypto.randomUUID().slice(0, 8),
            portfolioId,
            upperSym,
            qty,
            execPrice
          ]);
        }
      } else if (type === 'SELL') {
        if (!pos || parseFloat(pos.shares) < qty) return res.status(400).json({ error: 'Insufficient shares held' });
        cash += totalCost;
        const remaining = parseFloat(pos.shares) - qty;
        if (remaining <= 0.00001) {
          await pool.query('DELETE FROM positions WHERE id = $1', [pos.id]);
        } else {
          await pool.query('UPDATE positions SET shares = $1, updated_at = NOW() WHERE id = $2', [remaining, pos.id]);
        }
      }

      await pool.query('UPDATE portfolios SET cash_balance = $1 WHERE id = $2', [cash, portfolioId]);
      await pool.query('INSERT INTO transactions (id, portfolio_id, symbol, type, shares, price, total_value) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        'tx_' + crypto.randomUUID().slice(0, 8),
        portfolioId,
        upperSym,
        type,
        qty,
        execPrice,
        totalCost
      ]);
    } else {
      const port = memoryDb.portfolios.find(p => p.id === portfolioId);
      if (!port) return res.status(404).json({ error: 'Portfolio not found' });

      let pos = memoryDb.positions.find(p => p.portfolio_id === portfolioId && p.symbol === upperSym);

      if (type === 'BUY') {
        if (port.cash_balance < totalCost) return res.status(400).json({ error: 'Insufficient cash reserves' });
        port.cash_balance -= totalCost;
        if (pos) {
          const newQty = pos.shares + qty;
          pos.avg_price = (pos.shares * pos.avg_price + totalCost) / newQty;
          pos.shares = newQty;
        } else {
          memoryDb.positions.push({
            id: 'pos_' + crypto.randomUUID().slice(0, 8),
            portfolio_id: portfolioId,
            symbol: upperSym,
            shares: qty,
            avg_price: execPrice
          });
        }
      } else if (type === 'SELL') {
        if (!pos || pos.shares < qty) return res.status(400).json({ error: 'Insufficient shares held' });
        port.cash_balance += totalCost;
        pos.shares -= qty;
        if (pos.shares <= 0.00001) {
          memoryDb.positions = memoryDb.positions.filter(p => p.id !== pos.id);
        }
      }

      memoryDb.transactions.unshift({
        id: 'tx_' + crypto.randomUUID().slice(0, 8),
        portfolio_id: portfolioId,
        symbol: upperSym,
        type,
        shares: qty,
        price: execPrice,
        total_value: totalCost,
        executed_at: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/portfolios/reset', async (req, res) => {
  try {
    const { portfolioId } = req.body;
    if (pool) {
      await pool.query('DELETE FROM positions WHERE portfolio_id = $1', [portfolioId]);
      await pool.query('DELETE FROM transactions WHERE portfolio_id = $1', [portfolioId]);
      await pool.query('UPDATE portfolios SET cash_balance = 1000000.00 WHERE id = $1', [portfolioId]);
    } else {
      const p = memoryDb.portfolios.find(item => item.id === portfolioId);
      if (p) p.cash_balance = 1000000.00;
      memoryDb.positions = memoryDb.positions.filter(pos => pos.portfolio_id !== portfolioId);
      memoryDb.transactions = memoryDb.transactions.filter(t => t.portfolio_id !== portfolioId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/portfolios/rename', async (req, res) => {
  try {
    const { portfolioId, name } = req.body;
    if (pool) {
      await pool.query('UPDATE portfolios SET name = $1 WHERE id = $2', [name, portfolioId]);
    } else {
      const p = memoryDb.portfolios.find(item => item.id === portfolioId);
      if (p) p.name = name;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/markets/quote/:symbol', async (req, res) => {
  const quote = await fetchYahooQuote(req.params.symbol);
  res.json(quote);
});

router.get('/markets/chart/:symbol', async (req, res) => {
  const chart = await fetchYahooChart(req.params.symbol, req.query.range || '1M');
  res.json(chart);
});

router.get('/leaderboard', async (req, res) => {
  try {
    let users = [];
    let portfolios = [];
    let positions = [];

    if (pool) {
      users = (await pool.query('SELECT id, username FROM users')).rows;
      portfolios = (await pool.query('SELECT * FROM portfolios')).rows;
      positions = (await pool.query('SELECT * FROM positions')).rows;
    } else {
      users = memoryDb.users;
      portfolios = memoryDb.portfolios;
      positions = memoryDb.positions;
    }

    const leaderboard = portfolios.map(p => {
      const user = users.find(u => u.id === p.user_id) || { username: 'Institutional Trader' };
      const portPositions = positions.filter(pos => pos.portfolio_id === p.id);
      
      let holdingsValue = 0;
      portPositions.forEach(pos => {
        const q = quoteCache[pos.symbol]?.data?.price || parseFloat(pos.avg_price);
        holdingsValue += parseFloat(pos.shares) * q;
      });

      const totalEquity = parseFloat(p.cash_balance) + holdingsValue;
      const roi = ((totalEquity - 1000000) / 1000000) * 100;

      return {
        id: p.id,
        username: user.username,
        portfolioName: p.name,
        totalEquity: parseFloat(totalEquity.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        assetsCount: portPositions.length,
        lastActive: 'Just now'
      };
    });

    leaderboard.sort((a, b) => b.totalEquity - a.totalEquity);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', router);
app.use('/', router);

module.exports = app;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Institutional Desk backend active on port ${PORT}`);
  });
}
