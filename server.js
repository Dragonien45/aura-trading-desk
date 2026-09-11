const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Persistent In-Memory Store
globalThis.__AURA_DB = globalThis.__AURA_DB || {
  users: [],
  portfolios: [],
  positions: [],
  transactions: []
};
const memoryDb = globalThis.__AURA_DB;

// PostgreSQL Connection Pool
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
    console.error('Database schema error:', err.message);
  }
}
initDb();

// ==========================================
// YAHOO FINANCE COOKIE & CRUMB ENGINE
// ==========================================

let sessionCache = {
  cookie: null,
  crumb: null,
  timestamp: 0
};

function fetchCookie() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'fc.yahoo.com',
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };

    const req = https.request(options, (res) => {
      const rawCookies = res.headers['set-cookie'] || [];
      const cookie = rawCookies.map(c => c.split(';')[0]).join('; ');
      resolve(cookie || null);
    });

    req.on('error', () => resolve(null));
    req.setTimeout(4500, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function fetchCrumb(cookie) {
  return new Promise((resolve) => {
    if (!cookie) return resolve(null);
    const options = {
      hostname: 'query2.finance.yahoo.com',
      path: '/v1/test/getcrumb',
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': cookie,
        'Accept': '*/*'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 && data && !data.includes('<html')) {
          resolve(data.trim());
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(4500, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function getYahooSession(forceRefresh = false) {
  const isExpired = Date.now() - sessionCache.timestamp > 1000 * 60 * 60 * 6; // 6 hours
  if (!forceRefresh && !isExpired && sessionCache.cookie && sessionCache.crumb) {
    return sessionCache;
  }

  const cookie = await fetchCookie();
  const crumb = await fetchCrumb(cookie);

  if (crumb && cookie) {
    sessionCache = { cookie, crumb, timestamp: Date.now() };
  } else if (cookie) {
    sessionCache = { cookie, crumb: null, timestamp: Date.now() };
  }
  return sessionCache;
}

// ==========================================
// MARKET SEARCH & QUOTES
// ==========================================

const quoteCache = {};

function searchYahoo(query) {
  return new Promise(async (resolve) => {
    if (!query || !query.trim()) return resolve([]);
    const session = await getYahooSession();
    const cleanQuery = encodeURIComponent(query.trim());
    
    let path = `/v1/finance/search?q=${cleanQuery}&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    if (session.crumb) path += `&crumb=${encodeURIComponent(session.crumb)}`;

    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    };
    if (session.cookie) headers['Cookie'] = session.cookie;

    const options = {
      hostname: 'query2.finance.yahoo.com',
      path,
      method: 'GET',
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const quotes = parsed.quotes || [];
          const results = quotes
            .filter(q => q.symbol && ['EQUITY', 'ETF', 'CRYPTOCURRENCY', 'CURRENCY', 'INDEX'].includes(q.quoteType))
            .map(q => ({
              symbol: q.symbol.toUpperCase(),
              name: q.shortname || q.longname || q.symbol,
              exchange: q.exchange || q.exchDisp || 'Global',
              type: q.quoteType || q.typeDisp || 'Asset'
            }));
          resolve(results);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(4500, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function fetchYahooQuote(symbol) {
  return new Promise(async (resolve) => {
    const clean = symbol.trim().toUpperCase();
    const cached = quoteCache[clean];
    if (cached && Date.now() - cached.timestamp < 3000) {
      return resolve(cached.data);
    }

    const session = await getYahooSession();
    const encoded = encodeURIComponent(clean);
    let path = `/v8/finance/chart/${encoded}?interval=15m&range=1d`;
    if (session.crumb) path += `&crumb=${encodeURIComponent(session.crumb)}`;

    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    };
    if (session.cookie) headers['Cookie'] = session.cookie;

    const options = {
      hostname: 'query2.finance.yahoo.com',
      path,
      method: 'GET',
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const meta = parsed.chart?.result?.[0]?.meta;
          if (meta) {
            const currentPrice = typeof meta.regularMarketPrice === 'number'
              ? meta.regularMarketPrice
              : (meta.chartPreviousClose || meta.previousClose || 0);

            if (currentPrice > 0) {
              const prevClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
              const change = currentPrice - prevClose;
              const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

              const isTrading = meta.currentTradingPeriod?.regular
                ? Date.now() / 1000 >= meta.currentTradingPeriod.regular.start &&
                  Date.now() / 1000 <= meta.currentTradingPeriod.regular.end
                : false;

              const result = {
                symbol: clean,
                name: meta.shortName || meta.longName || meta.symbol || clean,
                currency: meta.currency || (clean.endsWith('.CO') ? 'DKK' : 'USD'),
                exchangeName: meta.exchangeName || meta.fullExchangeName || '',
                price: parseFloat(currentPrice.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(changePercent.toFixed(2)),
                high: meta.regularMarketDayHigh || currentPrice,
                low: meta.regularMarketDayLow || currentPrice,
                volume: meta.regularMarketVolume || 0,
                marketState: isTrading ? 'REGULAR' : 'CLOSED',
                isLive: isTrading,
                lastUpdated: new Date().toISOString()
              };
              quoteCache[clean] = { timestamp: Date.now(), data: result };
              return resolve(result);
            }
          }
        } catch {}
        resolve(getFallbackQuote(clean));
      });
    });

    req.on('error', () => resolve(getFallbackQuote(clean)));
    req.setTimeout(4500, () => { req.destroy(); resolve(getFallbackQuote(clean)); });
    req.end();
  });
}

function getFallbackQuote(symbol) {
  const clean = symbol.toUpperCase();
  const fallbacks = {
    'AAPL': { price: 232.40, name: 'Apple Inc.', currency: 'USD' },
    'NVDA': { price: 128.50, name: 'NVIDIA Corporation', currency: 'USD' },
    'MSFT': { price: 448.20, name: 'Microsoft Corporation', currency: 'USD' },
    'TSLA': { price: 248.80, name: 'Tesla, Inc.', currency: 'USD' },
    'SPY': { price: 562.10, name: 'SPDR S&P 500 ETF', currency: 'USD' },
    'QQQ': { price: 489.30, name: 'Invesco QQQ Trust', currency: 'USD' },
    'BTC-USD': { price: 61850.00, name: 'Bitcoin USD', currency: 'USD' },
    'ETH-USD': { price: 2420.00, name: 'Ethereum USD', currency: 'USD' },
    'XPEV': { price: 19.40, name: 'XPeng Inc.', currency: 'USD' },
    'VWS.CO': { price: 165.50, name: 'Vestas Wind Systems A/S', currency: 'DKK' }
  };
  const base = fallbacks[clean] || { price: 100.00, name: clean, currency: clean.endsWith('.CO') ? 'DKK' : 'USD' };
  return {
    symbol: clean,
    name: base.name,
    currency: base.currency,
    price: base.price,
    change: 0.00,
    changePercent: 0.00,
    high: base.price * 1.01,
    low: base.price * 0.99,
    volume: 500000,
    marketState: 'CLOSED',
    isLive: false,
    lastUpdated: new Date().toISOString()
  };
}

function executeChartQuery(symbol, interval, range, session) {
  return new Promise((resolve) => {
    let path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    if (session.crumb) path += `&crumb=${encodeURIComponent(session.crumb)}`;

    const headers = { 'User-Agent': USER_AGENT };
    if (session.cookie) headers['Cookie'] = session.cookie;

    const options = {
      hostname: 'query2.finance.yahoo.com',
      path,
      method: 'GET',
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
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
                time: range === '1d'
                  ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                price: parseFloat(quotes[i].toFixed(2))
              });
            }
          }
          resolve(history);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(4500, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

async function fetchYahooChart(symbol, range = '1M') {
  const session = await getYahooSession();
  let interval = '1d';
  let yRange = '1mo';
  if (range === '1D') { interval = '5m'; yRange = '1d'; }
  else if (range === '1W') { interval = '15m'; yRange = '5d'; }
  else if (range === '1Y') { interval = '1wk'; yRange = '1y'; }

  let history = await executeChartQuery(symbol, interval, yRange, session);
  if (history.length === 0 && range === '1D') {
    history = await executeChartQuery(symbol, '15m', '5d', session);
  }
  return history;
}

// ==========================================
// ROUTER & APPLICATION ENDPOINTS
// ==========================================

const router = express.Router();

router.get('/health', async (req, res) => {
  const session = await getYahooSession();
  res.json({
    status: 'ok',
    database: pool ? 'postgresql' : 'in-memory-safe',
    yahooSession: {
      hasCookie: !!session.cookie,
      hasCrumb: !!session.crumb,
      crumbPreview: session.crumb ? `${session.crumb.slice(0, 4)}...` : null
    },
    timestamp: new Date().toISOString()
  });
});

router.get('/markets/search', async (req, res) => {
  const query = req.query.q || '';
  const results = await searchYahoo(query);
  res.json(results);
});

router.get('/markets/quote/:symbol', async (req, res) => {
  const quote = await fetchYahooQuote(req.params.symbol);
  res.json(quote);
});

router.get('/markets/quotes', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) return res.json({});
  const quotes = {};
  await Promise.all(
    symbols.map(async (sym) => {
      quotes[sym] = await fetchYahooQuote(sym);
    })
  );
  res.json(quotes);
});

router.get('/markets/chart/:symbol', async (req, res) => {
  const chart = await fetchYahooChart(req.params.symbol, req.query.range || '1M');
  res.json(chart);
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
