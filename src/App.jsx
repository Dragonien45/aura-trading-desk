import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import {
  Briefcase,
  Layers,
  Trophy,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Building2,
  Activity,
  Server
} from 'lucide-react';

const API_BASE = '/api';

const WATCHLIST_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductors' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Automotive' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'Index ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'Tech ETF' },
  { symbol: 'BTC-USD', name: 'Bitcoin USD', sector: 'Digital Assets' },
  { symbol: 'ETH-USD', name: 'Ethereum USD', sector: 'Digital Assets' }
];

const TIMEFRAMES = ['1D', '1W', '1M', '1Y'];

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('aura_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [apiStatus, setApiStatus] = useState('CHECKING...');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState('1M');
  const [quote, setQuote] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);

  const [orderType, setOrderType] = useState('BUY');
  const [orderShares, setOrderShares] = useState('');
  const [orderStatus, setOrderStatus] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      if (data && data.status === 'ok') {
        setApiStatus(data.database === 'postgresql' ? 'ONLINE (POSTGRESQL)' : 'ONLINE (IN-MEMORY)');
      } else {
        setApiStatus('OFFLINE');
      }
    } catch {
      setApiStatus('OFFLINE (UNREACHABLE)');
    }
  };

  useEffect(() => {
    checkHealth();
    fetchLeaderboard();
    const interval = setInterval(() => {
      checkHealth();
      fetchLeaderboard();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const refreshUserData = async (targetUserId) => {
    const uId = targetUserId || user?.id;
    if (!uId) return;
    setPortfolioLoading(true);
    try {
      const res = await fetch(`${API_BASE}/portfolios/${uId}`);
      if (!res.ok) throw new Error('Failed to load portfolios');
      const portData = await res.json();
      if (Array.isArray(portData)) {
        setPortfolios(portData);
        if (portData.length > 0) {
          setActivePortfolioId(prev => (prev && portData.some(p => p.id === prev) ? prev : portData[0].id));
        }
      }
    } catch (err) {
      console.error('Portfolio refresh error:', err);
    } finally {
      setPortfolioLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      refreshUserData(user.id);
    }
  }, [user]);

  const fetchMarketData = async (symbol, range = activeTimeframe) => {
    setMarketLoading(true);
    try {
      const [quoteRes, chartRes] = await Promise.all([
        fetch(`${API_BASE}/markets/quote/${encodeURIComponent(symbol)}`),
        fetch(`${API_BASE}/markets/chart/${encodeURIComponent(symbol)}?range=${range}`)
      ]);
      if (quoteRes.ok) {
        const qData = await quoteRes.json();
        setQuote(qData);
      }
      if (chartRes.ok) {
        const cData = await chartRes.json();
        setChartData(Array.isArray(cData) ? cData : []);
      }
    } catch (err) {
      console.error('Market fetch error:', err);
    } finally {
      setMarketLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMarketData(selectedSymbol, activeTimeframe);
    }
  }, [selectedSymbol, activeTimeframe, user]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_BASE}/leaderboard`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Leaderboard error:', e);
    }
  };

  const activePortfolio = useMemo(() => {
    if (!portfolios || portfolios.length === 0) return null;
    return portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
  }, [portfolios, activePortfolioId]);

  const holdingsCalculations = useMemo(() => {
    if (!activePortfolio) {
      return { totalMarketValue: 0, unrealizedGain: 0, unrealizedGainPct: 0, items: [] };
    }
    let totalMarketValue = 0;
    let totalCostBasis = 0;

    const items = (activePortfolio.positions || []).map(pos => {
      const livePrice = (selectedSymbol === pos.symbol && quote?.price) ? quote.price : pos.avgPrice;
      const mVal = pos.shares * livePrice;
      const cost = pos.shares * pos.avgPrice;
      const gain = mVal - cost;
      const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

      totalMarketValue += mVal;
      totalCostBasis += cost;

      return {
        ...pos,
        livePrice,
        marketValue: mVal,
        gain,
        gainPct
      };
    });

    const unrealizedGain = totalMarketValue - totalCostBasis;
    const unrealizedGainPct = totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0;

    return { totalMarketValue, unrealizedGain, unrealizedGainPct, items };
  }, [activePortfolio, quote, selectedSymbol]);

  const totalEquity = (activePortfolio?.cashBalance || 0) + (holdingsCalculations.totalMarketValue || 0);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, accessCode: authPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Authentication failed');
      }

      const resolvedUser = (data && data.user) ? data.user : data;
      if (!resolvedUser || !resolvedUser.id) {
        throw new Error('Database returned invalid profile format');
      }

      const sessionData = { id: resolvedUser.id, username: resolvedUser.username };
      setUser(sessionData);
      localStorage.setItem('aura_session', JSON.stringify(sessionData));
      await refreshUserData(sessionData.id);
      await fetchLeaderboard();
    } catch (err) {
      setAuthError(err.message || 'Authentication error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('aura_session');
    setPortfolios([]);
  };

  const handleTrade = async () => {
    if (!activePortfolio?.id || !quote?.price) return;
    const qty = parseFloat(orderShares);
    if (!qty || qty <= 0) {
      setOrderStatus({ type: 'error', message: 'Enter a valid share quantity' });
      return;
    }
    const cost = qty * quote.price;
    if (orderType === 'BUY' && cost > activePortfolio.cashBalance) {
      setOrderStatus({ type: 'error', message: 'Insufficient cash reserves' });
      return;
    }

    setTradeLoading(true);
    setOrderStatus(null);
    try {
      const res = await fetch(`${API_BASE}/portfolios/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: activePortfolio.id,
          symbol: quote.symbol,
          type: orderType,
          shares: qty,
          price: quote.price
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Order execution rejected');

      setOrderStatus({ type: 'success', message: `Executed ${orderType} ${qty} ${quote.symbol} @ $${quote.price.toFixed(2)}` });
      setOrderShares('');
      await refreshUserData(user.id);
      await fetchLeaderboard();
    } catch (err) {
      setOrderStatus({ type: 'error', message: err.message });
    } finally {
      setTradeLoading(false);
    }
  };

  const handleReset = async () => {
    if (!activePortfolio?.id) return;
    if (!window.confirm('Reset this portfolio? Active positions will be liquidated and cash restored to $1,000,000.00.')) return;
    try {
      const res = await fetch(`${API_BASE}/portfolios/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId: activePortfolio.id })
      });
      if (res.ok) {
        await refreshUserData(user.id);
        await fetchLeaderboard();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRename = async () => {
    if (!activePortfolio?.id || !newName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/portfolios/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId: activePortfolio.id, name: newName.trim() })
      });
      if (res.ok) {
        setRenaming(false);
        setNewName('');
        await refreshUserData(user.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSymbols = WATCHLIST_SYMBOLS.filter(s =>
    s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allocationData = useMemo(() => {
    if (!activePortfolio) return [];
    const cash = activePortfolio.cashBalance || 0;
    const data = [{ name: 'Cash Reserves', value: cash, color: '#0F172A' }];
    const colors = ['#2563EB', '#0D9488', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981'];

    (holdingsCalculations.items || []).forEach((pos, idx) => {
      data.push({
        name: pos.symbol,
        value: pos.marketValue,
        color: colors[idx % colors.length]
      });
    });
    return data;
  }, [activePortfolio, holdingsCalculations]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] flex flex-col justify-between p-6">
        <header className="flex justify-between items-center max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-950 rounded flex items-center justify-center text-white font-bold tracking-wider text-sm shadow-sm">
              A
            </div>
            <span className="text-slate-900 font-semibold tracking-tight text-base">AURA Institutional Desk</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span className={apiStatus.includes('ONLINE') ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
              API: {apiStatus}
            </span>
          </div>
        </header>

        <div className="w-full max-w-md mx-auto my-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-slate-100 rounded-xl">
              <Building2 className="w-6 h-6 text-slate-700" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 text-center">Institutional Terminal Access</h2>
          <p className="text-xs text-slate-500 text-center mt-1 mb-6">
            Paper trading platform backed by PostgreSQL with live market feeds.
          </p>

          <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg mb-6">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`py-2 text-xs font-medium rounded-md transition ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`py-2 text-xs font-medium rounded-md transition ${authMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1.5">
                Trader Username
              </label>
              <input
                type="text"
                required
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder="e.g. Karlos"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1.5">
                Access Code
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:bg-white transition"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 py-3 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-semibold uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-sm"
            >
              {authLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting to PostgreSQL...
                </>
              ) : (
                authMode === 'login' ? 'Authenticate Access' : 'Register Profile in Database'
              )}
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] font-mono text-slate-400">
          Simulated paper trading platform. Market feeds integrated via Yahoo Finance.
        </footer>
      </div>
    );
  }

  if (portfolios.length === 0 && portfolioLoading) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] flex flex-col items-center justify-center gap-3 font-mono text-xs text-slate-600">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-900" />
        <span>Loading institutional desks from PostgreSQL...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBF9] text-slate-900 flex flex-col font-sans">
      {/* Top Navigation */}
      <nav className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-slate-950 rounded flex items-center justify-center text-white font-bold text-sm shadow-sm">
                A
              </div>
              <span className="font-semibold tracking-tight text-base text-slate-950">AURA Desk</span>
            </div>

            <div className="hidden md:flex items-center gap-1 border-l border-slate-200 pl-6">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: Briefcase },
                { id: 'markets', label: 'Trade / Markets', icon: Activity },
                { id: 'portfolios', label: 'Portfolios', icon: Layers },
                { id: 'leaderboard', label: 'Leaderboard', icon: Trophy }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition ${
                      isActive ? 'bg-slate-100 text-slate-950 font-semibold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {portfolios.length > 0 && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono">
                <span className="text-slate-500">{activePortfolio?.name || 'Desk'}:</span>
                <span className="font-bold text-slate-900">${(totalEquity || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <select
                  aria-label="Active Portfolio Switcher"
                  value={activePortfolioId || ''}
                  onChange={(e) => setActivePortfolioId(e.target.value)}
                  className="bg-transparent border-none text-slate-700 focus:outline-none cursor-pointer text-xs ml-1"
                >
                  {portfolios.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
              <span className="text-xs font-medium text-slate-700 font-mono hidden sm:inline">{user?.username}</span>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-md transition"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Total Portfolio Equity</div>
                <div className="text-2xl font-mono font-bold text-slate-950">
                  ${(totalEquity || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono text-slate-600 mt-2 flex items-center gap-1">
                  Baseline: $1,000,000.00
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Available Cash Reserves</div>
                <div className="text-2xl font-mono font-bold text-slate-950">
                  ${(activePortfolio?.cashBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono text-slate-600 mt-2">
                  Immediate buying power
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Unrealized P&L</div>
                <div className={`text-2xl font-mono font-bold flex items-center gap-1 ${(holdingsCalculations.unrealizedGain || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {(holdingsCalculations.unrealizedGain || 0) >= 0 ? '+' : ''}
                  ${(holdingsCalculations.unrealizedGain || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={`text-xs font-mono mt-2 font-medium ${(holdingsCalculations.unrealizedGainPct || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {(holdingsCalculations.unrealizedGainPct || 0) >= 0 ? '+' : ''}{(holdingsCalculations.unrealizedGainPct || 0).toFixed(2)}% on open positions
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Return on Investment</div>
                {(() => {
                  const roi = (((totalEquity || 1000000) - 1000000) / 1000000) * 100;
                  return (
                    <>
                      <div className={`text-2xl font-mono font-bold ${roi >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                      </div>
                      <div className="text-xs font-mono text-slate-600 mt-2">
                        Relative to starting capital
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Active Portfolio Holdings</h3>
                    <p className="text-xs text-slate-600">Weighted positions and mark-to-market performance</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('markets')}
                    className="text-xs font-mono font-semibold text-slate-900 hover:text-blue-600 transition"
                  >
                    Open Trade Ticket &rarr;
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-600">
                        <th className="pb-3">Symbol</th>
                        <th className="pb-3 text-right">Shares</th>
                        <th className="pb-3 text-right">Avg Cost</th>
                        <th className="pb-3 text-right">Current Price</th>
                        <th className="pb-3 text-right">Market Value</th>
                        <th className="pb-3 text-right">Gain / Loss</th>
                        <th className="pb-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {(!holdingsCalculations.items || holdingsCalculations.items.length === 0) ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                            No open positions in {activePortfolio?.name || 'this desk'}. Use Trade / Markets to execute paper orders.
                          </td>
                        </tr>
                      ) : (
                        holdingsCalculations.items.map(pos => (
                          <tr key={pos.id || pos.symbol} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 font-bold text-slate-950">{pos.symbol}</td>
                            <td className="py-3.5 text-right text-slate-800">{pos.shares.toLocaleString()}</td>
                            <td className="py-3.5 text-right text-slate-800">${(pos.avgPrice || 0).toFixed(2)}</td>
                            <td className="py-3.5 text-right font-medium text-slate-950">${(pos.livePrice || 0).toFixed(2)}</td>
                            <td className="py-3.5 text-right font-bold text-slate-950">${(pos.marketValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={`py-3.5 text-right font-medium ${(pos.gain || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {(pos.gain || 0) >= 0 ? '+' : ''}${(pos.gain || 0).toFixed(2)} ({(pos.gainPct || 0).toFixed(2)}%)
                            </td>
                            <td className="py-3.5 text-right">
                              <button
                                onClick={() => {
                                  setSelectedSymbol(pos.symbol);
                                  setActiveTab('markets');
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded font-semibold text-[11px] transition"
                              >
                                Trade
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">Asset Allocation</h3>
                  <p className="text-xs text-slate-600 mb-4">Capital distribution vs cash reserves</p>

                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={allocationData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {allocationData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                          contentStyle={{ backgroundColor: '#0F172A', borderRadius: '6px', border: 'none', color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                  {allocationData.map(item => {
                    const pct = totalEquity > 0 ? (item.value / totalEquity) * 100 : 0;
                    return (
                      <div key={item.name} className="flex justify-between items-center text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-slate-700">{item.name}</span>
                        </div>
                        <span className="font-semibold text-slate-950">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TRADE / MARKETS TAB */}
        {activeTab === 'markets' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="relative mb-5">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Search className="w-4 h-4 text-slate-500 mr-2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      placeholder="Search asset symbol (e.g. AAPL, NVDA, SPY, BTC-USD)..."
                      className="bg-transparent text-xs w-full focus:outline-none font-mono"
                    />
                  </div>

                  {searchFocused && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      {filteredSymbols.map(s => (
                        <div
                          key={s.symbol}
                          onMouseDown={() => {
                            setSelectedSymbol(s.symbol);
                            setSearchQuery('');
                            setSearchFocused(false);
                          }}
                          className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs"
                        >
                          <div>
                            <span className="font-bold font-mono text-slate-900 mr-2">{s.symbol}</span>
                            <span className="text-slate-600">{s.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{s.sector}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-between items-end gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold font-mono text-slate-950">{quote?.symbol || selectedSymbol}</h2>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-semibold ${
                        quote?.isLive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {quote?.marketState === 'REGULAR' ? 'Live Market' : 'Off-Hours / Closed'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{quote?.name}</p>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-3xl font-bold text-slate-950">
                      ${quote?.price ? quote.price.toFixed(2) : '---'}
                    </div>
                    <div className={`text-xs font-semibold flex items-center justify-end gap-1 ${
                      (quote?.change || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {(quote?.change || 0) >= 0 ? '+' : ''}${quote?.change?.toFixed(2)} ({(quote?.changePercent || 0) >= 0 ? '+' : ''}{quote?.changePercent?.toFixed(2)}%)
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-5 mb-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600">Yahoo Historical Candlesticks</div>
                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md">
                    {TIMEFRAMES.map(tf => (
                      <button
                        key={tf}
                        onClick={() => setActiveTimeframe(tf)}
                        className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded transition ${
                          activeTimeframe === tf ? 'bg-white text-slate-950 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-72 w-full">
                  {marketLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 text-xs font-mono">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Fetching Real-Time Market Data...
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="time" stroke="#94A3B8" fontSize={10} tickLine={false} />
                        <YAxis domain={['auto', 'auto']} stroke="#94A3B8" fontSize={10} tickLine={false} tickFormatter={(v) => `$${v}`} />
                        <RechartsTooltip
                          formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Price']}
                          contentStyle={{ backgroundColor: '#0F172A', borderRadius: '6px', border: 'none', color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                        />
                        <Area type="monotone" dataKey="price" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
                      Market candle stream syncing...
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-950 mb-1">Execution Ticket</h3>
                <p className="text-xs text-slate-600 mb-5">Zero-slippage simulated market execution</p>

                <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg mb-5">
                  <button
                    onClick={() => setOrderType('BUY')}
                    className={`py-2 text-xs font-bold font-mono rounded-md transition ${
                      orderType === 'BUY' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    BUY ORDER
                  </button>
                  <button
                    onClick={() => setOrderType('SELL')}
                    className={`py-2 text-xs font-bold font-mono rounded-md transition ${
                      orderType === 'SELL' ? 'bg-rose-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    SELL ORDER
                  </button>
                </div>

                {orderStatus && (
                  <div className={`mb-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
                    orderStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {orderStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{orderStatus.message}</span>
                  </div>
                )}

                <div className="space-y-4 font-mono text-xs">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1.5 font-sans">
                      Target Asset
                    </label>
                    <div className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 flex justify-between items-center">
                      <span>{quote?.symbol || selectedSymbol}</span>
                      <span className="font-normal text-slate-600">${quote?.price ? quote.price.toFixed(2) : '0.00'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1.5 font-sans">
                      Share Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      value={orderShares}
                      onChange={(e) => setOrderShares(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 font-mono text-sm"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-100">
                    <div className="flex justify-between text-slate-600">
                      <span>Estimated Value:</span>
                      <span className="font-bold text-slate-950">
                        ${((parseFloat(orderShares) || 0) * (quote?.price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Cash Reserves:</span>
                      <span>${(activePortfolio?.cashBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleTrade}
                    disabled={tradeLoading || !quote?.price}
                    className={`w-full py-3 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-sm ${
                      orderType === 'BUY' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'
                    }`}
                  >
                    {tradeLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Transacting on PostgreSQL...
                      </>
                    ) : (
                      `Submit ${orderType} Market Order`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PORTFOLIOS TAB */}
        {activeTab === 'portfolios' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">Portfolio Management</h3>
                  <p className="text-xs text-slate-600">Switch, rename, or liquidate active desks</p>
                </div>

                <div className="flex items-center gap-2">
                  {renaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="New portfolio title..."
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                      <button onClick={handleRename} className="px-3 py-1.5 bg-slate-950 text-white rounded-lg text-xs font-semibold">
                        Save
                      </button>
                      <button onClick={() => setRenaming(false)} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setRenaming(true); setNewName(activePortfolio?.name || ''); }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold transition"
                    >
                      Rename Portfolio
                    </button>
                  )}

                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition"
                  >
                    Reset Desk to $1,000,000
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {portfolios.map(p => {
                  const isActive = p.id === activePortfolioId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setActivePortfolioId(p.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition ${
                        isActive ? 'border-slate-950 bg-slate-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-950 mb-1">{p.name}</div>
                      <div className="text-lg font-mono font-bold text-slate-950">
                        ${(p.cashBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono mt-2">
                        {p.positions?.length || 0} Open Positions
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-950 mb-1">Execution Audit Trail</h3>
              <p className="text-xs text-slate-600 mb-5">Permanent trade ledger recorded to PostgreSQL</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600">
                      <th className="pb-3">Timestamp</th>
                      <th className="pb-3">Asset</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3 text-right">Shares</th>
                      <th className="pb-3 text-right">Price</th>
                      <th className="pb-3 text-right">Total Notional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!activePortfolio?.transactions || activePortfolio.transactions.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                          No transactions recorded yet for this desk.
                        </td>
                      </tr>
                    ) : (
                      activePortfolio.transactions.map((tx, idx) => (
                        <tr key={tx.id || idx} className="hover:bg-slate-50">
                          <td className="py-3 text-slate-500">{new Date(tx.timestamp).toLocaleString()}</td>
                          <td className="py-3 font-bold text-slate-950">{tx.symbol}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-3 text-right">{tx.shares.toLocaleString()}</td>
                          <td className="py-3 text-right">${(tx.price || 0).toFixed(2)}</td>
                          <td className="py-3 text-right font-bold">${(tx.totalValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {activeTab === 'leaderboard' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-950 mb-1">Institutional Leaderboard</h3>
            <p className="text-xs text-slate-600 mb-6">Global rankings by Mark-to-Market Portfolio Equity</p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-600">
                    <th className="pb-3">Rank</th>
                    <th className="pb-3">Trader</th>
                    <th className="pb-3">Portfolio</th>
                    <th className="pb-3 text-right">Total Equity</th>
                    <th className="pb-3 text-right">ROI (%)</th>
                    <th className="pb-3 text-right">Assets</th>
                    <th className="pb-3 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 font-sans">
                        Compiling leaderboard metrics...
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((entry, idx) => (
                      <tr key={entry.id || idx} className="hover:bg-slate-50">
                        <td className="py-3.5 font-bold text-slate-900">#{idx + 1}</td>
                        <td className="py-3.5 font-semibold text-slate-950 font-sans">{entry.username}</td>
                        <td className="py-3.5 text-slate-600">{entry.portfolioName}</td>
                        <td className="py-3.5 text-right font-bold text-slate-950">
                          ${(entry.totalEquity || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`py-3.5 text-right font-semibold ${(entry.roi || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {(entry.roi || 0) >= 0 ? '+' : ''}{(entry.roi || 0).toFixed(2)}%
                        </td>
                        <td className="py-3.5 text-right text-slate-600">{entry.assetsCount}</td>
                        <td className="py-3.5 text-right text-slate-500">{entry.lastActive}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
