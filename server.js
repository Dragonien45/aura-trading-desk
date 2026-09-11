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
        currency TEXT DEFAULT 'USD',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(portfolio_id, symbol)
      );
      ALTER TABLE positions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        shares NUMERIC(15, 4) NOT NULL,
        price NUMERIC(15, 2) NOT NULL,
        total_value NUMERIC(15, 2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
    `);
  } catch (err) {
    console.error('Database schema error:', err.message);
  }
}
initDb();

let sessionCache = { cookie: null, crumb: null, timestamp: 0 };

function fetchCookie() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'fc.yahoo.com',
      path: '/',
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' }
    };
    const req = https.request(options, (res) => {
      const rawCookies = res.headers['set-cookie'] || [];
      resolve(rawCookies.map(c => c.split(';')[0]).join('; ') || null);
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
      headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(res.statusCode === 200 && data && !data.includes('<html') ? data.trim() : null));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(4500, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function getYahooSession() {
  if (Date.now() - sessionCache.timestamp < 1000 * 60 * 60 * 6 && sessionCache.cookie) return sessionCache;
  const cookie = await fetchCookie();
  const crumb = await fetchCrumb(cookie);
  if (cookie) sessionCache = { cookie, crumb, timestamp: Date.now() };
  return sessionCache;
}

const quoteCache = {};

function fetchYahooQuote(symbol) {
  return new Promise(async (resolve) => {
    const clean = symbol.trim().toUpperCase();
    const cached = quoteCache[clean];
    if (cached && Date.now() - cached.timestamp < 3000) return resolve(cached.data);

    const session = await getYahooSession();
    let path = `/v8/finance/chart/${encodeURIComponent(clean)}?interval=15m&range=1d`;
    if (session.crumb) path += `&crumb=${encodeURIComponent(session.crumb)}`;

    const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
    if (session.cookie) headers['Cookie'] = session.cookie;

    const req = https.request({ hostname: 'query2.finance.yahoo.com', path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const meta = parsed.chart?.result?.[0]?.meta;
          if (meta) {
            const price = meta.regularMarketPrice || meta.chartPreviousClose || 0;
            if (price > 0) {
              const prev = meta.chartPreviousClose || price;
              const change = price - prev;
              const result = {
                symbol: clean,
                name: meta.shortName || meta.longName || clean,
                currency: meta.currency || (clean.endsWith('.CO') ? 'DKK' : 'USD'),
                exchangeName: meta.exchangeName || '',
                price: parseFloat(price.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(((change / prev) * 100).toFixed(2)),
                marketState: 'REGULAR',
                isLive: true
              };
              quoteCache[clean] = { timestamp: Date.now(), data: result };
              return resolve(result);
            }
          }
        } catch {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(4500, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Fetch real-time FX conversion rate to DKK from Yahoo Finance (e.g. USDDKK=X)
async function getLiveFxRateToDKK(currency) {
  const cleanCurr = (currency || 'USD').trim().toUpperCase();
  if (cleanCurr === 'DKK') return 1.0;

  const fxSymbol = `${cleanCurr}DKK=X`;
  const quote = await fetchYahooQuote(fxSymbol);
  if (quote && quote.price > 0) {
    return quote.price;
  }

  // Fallbacks if FX market quote is temporarily unreachable
  const defaults = { 'USD': 6.85, 'EUR': 7.46, 'GBP': 8.85, 'SEK': 0.65, 'NOK': 0.64 };
  return defaults[cleanCurr] || 6.85;
}

function searchYahoo(query) {
  return new Promise(async (resolve) => {
    if (!query || !query.trim()) return resolve([]);
    const session = await getYahooSession();
    const cleanQuery = encodeURIComponent(query.trim());
    let path = `/v1/finance/search?q=${cleanQuery}&quotesCount=12&newsCount=0`;
    if (session.crumb) path += `&crumb=${encodeURIComponent(session.crumb)}`;

    const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
    if (session.cookie) headers['Cookie'] = session.cookie;

    const req = https.request({ hostname: 'query2.finance.yahoo.com', path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = (parsed.quotes || [])
            .filter(q => q.symbol && ['EQUITY', 'ETF', 'CRYPTOCURRENCY', 'CURRENCY', 'INDEX'].includes(q.quoteType))
            .map(q => ({
              symbol: q.symbol.toUpperCase(),
              name: q.shortname || q.longname || q.symbol,
              exchange: q.exchange || 'Global',
              type: q.quoteType || 'Asset'
            }));
          resolve(results);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(4500, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function fetchYahooChart(symbol, range = '1M') {
  return new Promise(async (resolve) => {
    const clean = symbol.trim().toUpperCase();
    const session = await getYahooSession();
    let interval = '1d';
    let yRange = '1mo';
    if (range === '1D') { interval = '5m'; yRange = '1d'; }
    else if (range === '1W') { interval = '15m'; yRange = '5d'; }
    else if (range === '1Y') { interval = '1wk'; yRange = '1y'; }

    let path = `/v8/finance/chart/${encodeURIComponent(clean)}?interval=${interval}&range=${yRange}`;
    if (session.crumb) path += `&crumb=${encodeURIComponent(session.crumb)}`;

    const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
    if (session.cookie) headers['Cookie'] = session.cookie;

    const req = https.request({ hostname: 'query2.finance.yahoo.com', path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const result = parsed.chart?.result?.[0];
          const timestamps = result?.timestamp || [];
          const quotes = result?.indicators?.quote?.[0]?.close || [];
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
    req.setTimeout(4500, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

const router = express.Router();

router.get('/health', async (req, res) => {
  res.json({ status: 'ok', database: pool ? 'postgresql' : 'in-memory' });
});

router.get('/markets/search', async (req, res) => {
  res.json(await searchYahoo(req.query.q || ''));
});

router.get('/markets/quote/:symbol', async (req, res) => {
  res.json(await fetchYahooQuote(req.params.symbol));
});

router.get('/markets/quotes', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const quotes = {};
  await Promise.all(symbols.map(async s => { quotes[s] = await fetchYahooQuote(s); }));
  res.json(quotes);
});

router.get('/markets/chart/:symbol', async (req, res) => {
  const data = await fetchYahooChart(req.params.symbol, req.query.range || '1M');
  res.json(data);
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, accessCode } = req.body;
    const clean = username.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(accessCode).digest('hex');

    let user = null;
    if (pool) {
      const r = await pool.query('SELECT id, username FROM users WHERE LOWER(username) = $1 AND password_hash = $2', [clean, hash]);
      user = r.rows[0];
    } else {
      user = memoryDb.users.find(u => u.username.toLowerCase() === clean && u.password_hash === hash);
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/register', async (req, res) => {
  try {
    const { username, accessCode } = req.body;
    const clean = username.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(accessCode).digest('hex');
    const userId = 'usr_' + crypto.randomUUID().slice(0, 8);

    if (pool) {
      await pool.query('INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)', [userId, clean, hash]);
      await pool.query('INSERT INTO portfolios (id, user_id, name, cash_balance) VALUES ($1, $2, $3, $4)', ['port_' + crypto.randomUUID().slice(0, 8), userId, 'Global Alpha Desk', 1000000.00]);
    } else {
      memoryDb.users.push({ id: userId, username: clean, password_hash: hash });
      memoryDb.portfolios.push({ id: 'port_' + crypto.randomUUID().slice(0, 8), user_id: userId, name: 'Global Alpha Desk', cash_balance: 1000000.00 });
    }
    res.status(201).json({ id: userId, username: clean });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/portfolios/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let ports = [], positions = [], txs = [];

    if (pool) {
      ports = (await pool.query('SELECT * FROM portfolios WHERE user_id = $1', [userId])).rows;
      const portIds = ports.map(p => p.id);
      if (portIds.length > 0) {
        positions = (await pool.query('SELECT * FROM positions WHERE portfolio_id = ANY($1)', [portIds])).rows;
        txs = (await pool.query('SELECT * FROM transactions WHERE portfolio_id = ANY($1) ORDER BY executed_at DESC', [portIds])).rows;
      }
    } else {
      ports = memoryDb.portfolios.filter(p => p.user_id === userId);
      const portIds = ports.map(p => p.id);
      positions = memoryDb.positions.filter(pos => portIds.includes(pos.portfolio_id));
      txs = memoryDb.transactions.filter(t => portIds.includes(t.portfolio_id));
    }

    res.json(ports.map(p => ({
      id: p.id,
      name: p.name,
      cashBalance: parseFloat(p.cash_balance),
      positions: positions.filter(pos => pos.portfolio_id === p.id).map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        shares: parseFloat(pos.shares),
        avgPrice: parseFloat(pos.avg_price),
        currency: pos.currency || 'USD'
      })),
      transactions: txs.filter(t => t.portfolio_id === p.id).map(t => ({
        id: t.id,
        symbol: t.symbol,
        type: t.type,
        shares: parseFloat(t.shares),
        price: parseFloat(t.price),
        currency: t.currency || 'USD',
        totalDKK: parseFloat(t.total_value),
        timestamp: t.executed_at
      }))
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/portfolios/trade', async (req, res) => {
  try {
    const { portfolioId, symbol, type, shares, price, currency } = req.body;
    const qty = parseFloat(shares);
    const execPrice = parseFloat(price);
    const upperSym = symbol.toUpperCase();
    const curr = currency || (upperSym.endsWith('.CO') ? 'DKK' : 'USD');
    
    // Fetch live real-time FX conversion rate from Yahoo Finance
    const fxRate = await getLiveFxRateToDKK(curr);
    const costDKK = qty * execPrice * fxRate;

    if (pool) {
      const pRes = await pool.query('SELECT * FROM portfolios WHERE id = $1', [portfolioId]);
      const portfolio = pRes.rows[0];
      if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

      let cash = parseFloat(portfolio.cash_balance);
      const posRes = await pool.query('SELECT * FROM positions WHERE portfolio_id = $1 AND symbol = $2', [portfolioId, upperSym]);
      const pos = posRes.rows[0];

      if (type === 'BUY') {
        if (cash < costDKK) return res.status(400).json({ error: 'Insufficient DKK cash reserves' });
        cash -= costDKK;
        if (pos) {
          const oldShares = parseFloat(pos.shares);
          const oldAvg = parseFloat(pos.avg_price);
          const newShares = oldShares + qty;
          const newAvg = (oldShares * oldAvg + execPrice) / newShares;
          await pool.query('UPDATE positions SET shares = $1, avg_price = $2, currency = $3, updated_at = NOW() WHERE id = $4', [newShares, newAvg, curr, pos.id]);
        } else {
          await pool.query('INSERT INTO positions (id, portfolio_id, symbol, shares, avg_price, currency) VALUES ($1, $2, $3, $4, $5, $6)', [
            'pos_' + crypto.randomUUID().slice(0, 8),
            portfolioId,
            upperSym,
            qty,
            execPrice,
            curr
          ]);
        }
      } else if (type === 'SELL') {
        if (!pos || parseFloat(pos.shares) < qty) return res.status(400).json({ error: 'Insufficient shares held' });
        cash += costDKK;
        const remaining = parseFloat(pos.shares) - qty;
        if (remaining <= 0.00001) {
          await pool.query('DELETE FROM positions WHERE id = $1', [pos.id]);
        } else {
          await pool.query('UPDATE positions SET shares = $1, updated_at = NOW() WHERE id = $2', [remaining, pos.id]);
        }
      }

      await pool.query('UPDATE portfolios SET cash_balance = $1 WHERE id = $2', [cash, portfolioId]);
      await pool.query('INSERT INTO transactions (id, portfolio_id, symbol, type, shares, price, total_value, currency) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
        'tx_' + crypto.randomUUID().slice(0, 8),
        portfolioId,
        upperSym,
        type,
        qty,
        execPrice,
        costDKK,
        curr
      ]);
    } else {
      const port = memoryDb.portfolios.find(p => p.id === portfolioId);
      if (!port) return res.status(404).json({ error: 'Portfolio not found' });

      let pos = memoryDb.positions.find(p => p.portfolio_id === portfolioId && p.symbol === upperSym);

      if (type === 'BUY') {
        if (port.cash_balance < costDKK) return res.status(400).json({ error: 'Insufficient DKK cash reserves' });
        port.cash_balance -= costDKK;
        if (pos) {
          const newQty = pos.shares + qty;
          pos.avg_price = (pos.shares * pos.avg_price + execPrice) / newQty;
          pos.shares = newQty;
          pos.currency = curr;
        } else {
          memoryDb.positions.push({
            id: 'pos_' + crypto.randomUUID().slice(0, 8),
            portfolio_id: portfolioId,
            symbol: upperSym,
            shares: qty,
            avg_price: execPrice,
            currency: curr
          });
        }
      } else if (type === 'SELL') {
        if (!pos || pos.shares < qty) return res.status(400).json({ error: 'Insufficient shares held' });
        port.cash_balance += costDKK;
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
        total_value: costDKK,
        currency: curr,
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
    if (pool) await pool.query('UPDATE portfolios SET name = $1 WHERE id = $2', [name, portfolioId]);
    else {
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
    let users = [], portfolios = [], positions = [];
    if (pool) {
      users = (await pool.query('SELECT id, username FROM users')).rows;
      portfolios = (await pool.query('SELECT * FROM portfolios')).rows;
      positions = (await pool.query('SELECT * FROM positions')).rows;
    } else {
      users = memoryDb.users;
      portfolios = memoryDb.portfolios;
      positions = memoryDb.positions;
    }

    // Pre-fetch live FX rates for currencies in positions
    const uniqueCurrencies = [...new Set(positions.map(pos => pos.currency || (pos.symbol.endsWith('.CO') ? 'DKK' : 'USD')))];
    const fxRatesMap = {};
    await Promise.all(uniqueCurrencies.map(async curr => {
      fxRatesMap[curr] = await getLiveFxRateToDKK(curr);
    }));

    const leaderboard = await Promise.all(portfolios.map(async p => {
      const user = users.find(u => u.id === p.user_id) || { username: 'Trader' };
      const portPositions = positions.filter(pos => pos.portfolio_id === p.id);
      
      let holdingsValueDKK = 0;
      for (const pos of portPositions) {
        const q = quoteCache[pos.symbol]?.data?.price || parseFloat(pos.avg_price);
        const curr = pos.currency || (pos.symbol.endsWith('.CO') ? 'DKK' : 'USD');
        const fx = fxRatesMap[curr] || await getLiveFxRateToDKK(curr);
        holdingsValueDKK += parseFloat(pos.shares) * q * fx;
      }

      const totalEquity = parseFloat(p.cash_balance) + holdingsValueDKK;
      const roi = ((totalEquity - 1000000) / 1000000) * 100;

      return {
        id: p.id,
        username: user.username,
        portfolioName: p.name,
        totalEquity: parseFloat(totalEquity.2 ? totalEquity.toFixed(2) : totalEquity),
        roi: parseFloat(roi.toFixed(2)),
        assetsCount: portPositions.length,
        lastActive: 'Just now'
      };
    }));

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
    console.log(`Backend active on port ${PORT}`);
  });
}
