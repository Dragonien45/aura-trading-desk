import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieChartIcon,
  Briefcase,
  Layers,
  Trophy,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  LogOut,
  User,
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit3,
  ChevronDown,
  ArrowRight,
  Lock,
  Building2,
  Check,
  Sparkles,
  Info,
  Server,
  Database,
  Loader2
} from 'lucide-react';

// US Market Hours Detector (NYSE/NASDAQ: 9:30 AM - 4:00 PM ET, Monday - Friday)
function getMarketStatus(symbol = '') {
  if (symbol.includes('-USD') || symbol === 'BTC' || symbol === 'ETH') {
    return { status: 'OPEN', label: '24/7 LIVE FEED', isOpen: true };
  }
  const now = new Date();
  // Format to US Eastern Time
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  const day = etDate.getDay(); // 0 = Sun, 6 = Sat
  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Mon-Fri, 9:30 (570m) to 16:00 (960m)
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = timeInMinutes >= 570 && timeInMinutes < 960;

  if (isWeekday && isMarketHours) {
    return { status: 'OPEN', label: 'REGULAR MARKET OPEN', isOpen: true };
  } else {
    return { status: 'CLOSED', label: 'MARKET CLOSED (OFF-HOURS)', isOpen: false };
  }
}

// Normalizer for relational Postgres snake_case vs camelCase
function normalizePortfolio(p) {
  if (!p) return null;
  return {
    id: p.id,
    userId: p.user_id || p.userId,
    name: p.name,
    cashBalance: Number(p.cash_balance ?? p.cashBalance ?? 1000000),
    createdAt: p.created_at || p.createdAt
  };
}

function normalizePosition(pos) {
  return {
    id: pos.id,
    portfolioId: pos.portfolio_id || pos.portfolioId,
    symbol: pos.symbol,
    shares: Number(pos.shares),
    averageBuyPrice: Number(pos.average_buy_price ?? pos.averageBuyPrice),
    updatedAt: pos.updated_at || pos.updatedAt
  };
}

function normalizeTransaction(tx) {
  return {
    id: tx.id,
    portfolioId: tx.portfolio_id || tx.portfolioId,
    symbol: tx.symbol,
    type: tx.type,
    shares: Number(tx.shares),
    price: Number(tx.price),
    totalValue: Number(tx.total_value ?? tx.totalValue),
    realizedPnL: Number(tx.realized_pnl ?? tx.realizedPnL ?? 0),
    timestamp: tx.created_at || tx.timestamp
  };
}

export default function App() {
  // Authentication & Session
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('aura_session_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authAccessCode, setAuthAccessCode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Active View Tab
  const [activeTab, setActiveTab] = useState('dashboard');

  // Backend Health State
  const [backendHealth, setBackendHealth] = useState({ status: 'checking', database: 'detecting' });

  // Portfolios & Active State
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [positions, setPositions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  // Market Quotes & Live Data
  const [marketQuotes, setMarketQuotes] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState('1M');
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Trading Ticket
  const [tradeAction, setTradeAction] = useState('BUY');
  const [tradeShares, setTradeShares] = useState('10');
  const [tradeExecuting, setTradeExecuting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState(null);

  // Portfolio Management
  const [isRenamingPortfolio, setIsRenamingPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isPortfolioSwitcherOpen, setIsPortfolioSwitcherOpen] = useState(false);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // 1. Check Backend Health & Database Type on Load
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setBackendHealth({ status: 'online', database: data.database });
      } else {
        setBackendHealth({ status: 'offline', database: 'unreachable' });
      }
    } catch {
      setBackendHealth({ status: 'offline', database: 'network-error' });
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // 2. Fetch Live Market Quotes from Backend Yahoo Finance Scraper
  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const res = await fetch('/api/market/quotes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMarketQuotes(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch Yahoo market quotes:', err);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // 3. Fetch Historical Recharts Data from Yahoo Finance endpoint
  const fetchChart = useCallback(async (sym, tf) => {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/market/chart/${encodeURIComponent(sym)}?timeframe=${tf}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setChartData(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch historical chart:', err);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSymbol) {
      fetchChart(selectedSymbol, timeframe);
    }
  }, [selectedSymbol, timeframe, fetchChart]);

  // 4. Fetch Active Portfolio Data (Positions + Transactions) from PostgreSQL
  const fetchPortfolioDetails = useCallback(async (portId) => {
    if (!portId) return;
    setLoadingPortfolio(true);
    try {
      const res = await fetch(`/api/portfolios/${portId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.portfolio) {
          const normPort = normalizePortfolio(data.portfolio);
          setPortfolios(prev => prev.map(p => p.id === normPort.id ? normPort : p));
        }
        setPositions((data.positions || []).map(normalizePosition));
        setTransactions((data.transactions || []).map(normalizeTransaction));
      }
    } catch (err) {
      console.error('Failed to load portfolio details:', err);
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    if (activePortfolioId) {
      fetchPortfolioDetails(activePortfolioId);
    }
  }, [activePortfolioId, fetchPortfolioDetails]);

  // 5. Fetch Global Leaderboard from Database
  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [activeTab, fetchLeaderboard]);

  // Authentication Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const cleanUser = authUsername.trim();
    const cleanCode = authAccessCode.trim();

    if (!cleanUser || !cleanCode) {
      setAuthError('Institutional Trader ID and Access Code are required.');
      setAuthLoading(false);
      return;
    }

    const endpoint = authTab === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, accessCode: cleanCode })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication rejected by institutional server.');
      }

      const userObj = { id: data.user.id, username: data.user.username };
      const userPorts = (data.portfolios || []).map(normalizePortfolio);

      setCurrentUser(userObj);
      setPortfolios(userPorts);
      localStorage.setItem('aura_session_user', JSON.stringify(userObj));

      if (userPorts.length > 0) {
        setActivePortfolioId(userPorts[0].id);
      }

      setAuthUsername('');
      setAuthAccessCode('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPortfolios([]);
    setPositions([]);
    setTransactions([]);
    setActivePortfolioId(null);
    localStorage.removeItem('aura_session_user');
  };

  // Active Portfolio References
  const activePortfolio = useMemo(() => {
    return portfolios.find(p => p.id === activePortfolioId) || portfolios[0] || null;
  }, [portfolios, activePortfolioId]);

  const quoteMap = useMemo(() => {
    const map = {};
    marketQuotes.forEach(q => {
      map[q.symbol] = q;
    });
    return map;
  }, [marketQuotes]);

  const selectedQuote = useMemo(() => {
    return quoteMap[selectedSymbol] || {
      symbol: selectedSymbol,
      name: selectedSymbol,
      basePrice: 150.00,
      change24h: 0.00,
      high24h: 151.00,
      low24h: 149.00,
      volume: '—',
      source: 'Loading...'
    };
  }, [quoteMap, selectedSymbol]);

  const marketStatus = useMemo(() => {
    return getMarketStatus(selectedSymbol);
  }, [selectedSymbol]);

  // Holdings enriched with live Yahoo Finance scraped prices
  const enrichedHoldings = useMemo(() => {
    return positions.map(pos => {
      const quote = quoteMap[pos.symbol] || { basePrice: pos.averageBuyPrice, change24h: 0, name: pos.symbol };
      const currentPrice = quote.basePrice;
      const marketValue = pos.shares * currentPrice;
      const totalCostBasis = pos.shares * pos.averageBuyPrice;
      const unrealizedPnL = marketValue - totalCostBasis;
      const unrealizedPnLPct = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;

      return {
        ...pos,
        name: quote.name,
        currentPrice,
        marketValue,
        totalCostBasis,
        unrealizedPnL,
        unrealizedPnLPct,
        change24h: quote.change24h
      };
    });
  }, [positions, quoteMap]);

  // Financial summary
  const portfolioSummary = useMemo(() => {
    if (!activePortfolio) {
      return { totalEquity: 1000000, cash: 1000000, marketValue: 0, unrealizedPnL: 0, unrealizedPnLPct: 0, dayReturnPct: 0 };
    }

    const cash = activePortfolio.cashBalance;
    const marketValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalCostBasis = enrichedHoldings.reduce((sum, h) => sum + h.totalCostBasis, 0);
    const totalEquity = cash + marketValue;
    const unrealizedPnL = marketValue - totalCostBasis;
    const unrealizedPnLPct = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;
    const weightedDayGain = enrichedHoldings.reduce((sum, h) => sum + (h.marketValue * (h.change24h / 100)), 0);
    const dayReturnPct = totalEquity > 0 ? (weightedDayGain / totalEquity) * 100 : 0;

    return {
      totalEquity,
      cash,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPct,
      dayReturnPct
    };
  }, [activePortfolio, enrichedHoldings]);

  // Donut allocation
  const allocationData = useMemo(() => {
    const data = [{ name: 'Cash Reserves', value: portfolioSummary.cash, color: '#64748B' }];
    const colors = ['#2563EB', '#0284C7', '#D97706', '#8B5CF6', '#10B981', '#EC4899'];

    enrichedHoldings.forEach((h, idx) => {
      data.push({
        name: h.symbol,
        value: h.marketValue,
        color: colors[idx % colors.length]
      });
    });

    return data.filter(d => d.value > 0);
  }, [portfolioSummary.cash, enrichedHoldings]);

  // Execute Real Trade Against Backend PostgreSQL
  const handleExecuteOrder = async (e) => {
    e.preventDefault();
    setTradeMessage(null);
    setTradeExecuting(true);

    const qty = parseFloat(tradeShares);
    if (isNaN(qty) || qty <= 0) {
      setTradeMessage({ type: 'error', text: 'Enter a valid positive number of shares.' });
      setTradeExecuting(false);
      return;
    }

    if (!activePortfolio) {
      setTradeMessage({ type: 'error', text: 'No active portfolio selected.' });
      setTradeExecuting(false);
      return;
    }

    try {
      const res = await fetch('/api/trade/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: activePortfolio.id,
          symbol: selectedSymbol,
          action: tradeAction,
          shares: qty
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Trade rejected by server.');
      }

      setTradeMessage({ type: 'success', text: data.message });
      // Refresh full portfolio state from database
      await fetchPortfolioDetails(activePortfolio.id);
    } catch (err) {
      setTradeMessage({ type: 'error', text: err.message });
    } finally {
      setTradeExecuting(false);
    }
  };

  // Rename Portfolio in Database
  const handleRenamePortfolio = async (e) => {
    e.preventDefault();
    if (!newPortfolioName.trim() || !activePortfolio) return;

    try {
      const res = await fetch(`/api/portfolios/${activePortfolio.id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPortfolioName.trim() })
      });

      if (res.ok) {
        setPortfolios(prev => prev.map(p => p.id === activePortfolio.id ? { ...p, name: newPortfolioName.trim() } : p));
        setIsRenamingPortfolio(false);
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  // Reset & Liquidate Portfolio in Database
  const handleResetPortfolio = async () => {
    if (!activePortfolio) return;

    try {
      const res = await fetch(`/api/portfolios/${activePortfolio.id}/reset`, {
        method: 'POST'
      });

      if (res.ok) {
        setShowResetConfirmModal(false);
        await fetchPortfolioDetails(activePortfolio.id);
      }
    } catch (err) {
      console.error('Reset failed:', err);
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return marketQuotes;
    const q = searchQuery.toLowerCase();
    return marketQuotes.filter(item =>
      item.symbol.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q)
    );
  }, [marketQuotes, searchQuery]);

  // -------------------------------------------------------------
  // AUTHENTICATION SCREEN
  // -------------------------------------------------------------
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] text-[#0F172A] flex flex-col justify-between font-sans antialiased">
        <header className="border-b border-[#E2E8F0] bg-white px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-[#0F172A] flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider">
                A
              </div>
              <span className="font-semibold text-lg tracking-tight text-[#0F172A]">AURA Institutional Desk</span>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono">
              <Server className="w-3.5 h-3.5 text-[#64748B]" />
              <span className={backendHealth.status === 'online' ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                API: {backendHealth.status.toUpperCase()} ({backendHealth.database.toUpperCase()})
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-8">
            <div className="mb-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] mb-3 text-[#0F172A]">
                <Building2 className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h1 className="text-xl font-semibold text-[#0F172A]">Institutional Terminal Access</h1>
              <p className="text-xs text-[#64748B] mt-1">
                Connected to PostgreSQL database with live Yahoo Finance feeds.
              </p>
            </div>

            {/* Auth Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#F1F5F9] rounded-lg mb-6 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setAuthTab('login'); setAuthError(''); }}
                className={`py-2 rounded-md transition-all ${authTab === 'login' ? 'bg-white text-[#0F172A] shadow-sm font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthTab('register'); setAuthError(''); }}
                className={`py-2 rounded-md transition-all ${authTab === 'register' ? 'bg-white text-[#0F172A] shadow-sm font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                Create Account
              </button>
            </div>

            {authError && (
              <div className="mb-5 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5 uppercase tracking-wider font-mono">
                  Trader Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={authLoading}
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="e.g. Citadel_Quant"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                  <User className="absolute right-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5 uppercase tracking-wider font-mono">
                  Access Code
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    disabled={authLoading}
                    value={authAccessCode}
                    onChange={(e) => setAuthAccessCode(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2563EB] font-mono"
                  />
                  <Lock className="absolute right-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
                </div>
                <p className="text-[11px] text-[#64748B] mt-1.5">
                  Saved directly to PostgreSQL. Password hash verified on backend.
                </p>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full mt-2 py-2.5 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-md text-sm font-medium tracking-wide transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Contacting Server...</span>
                  </>
                ) : (
                  <>
                    <span>{authTab === 'login' ? 'Authenticate Session' : 'Register Profile in Database'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </main>

        <footer className="border-t border-[#E2E8F0] bg-white py-4 px-6 text-center text-xs text-[#64748B] font-mono">
          Connected Backend: <span className="font-semibold text-[#0F172A]">Express + Node PostgreSQL</span> | Real-time Yahoo Finance Bridge
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN TRADING DESK
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#FBFBF9] text-[#0F172A] flex flex-col font-sans antialiased">
      {/* Institutional Top Bar */}
      <nav className="sticky top-0 z-40 bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo & Portfolio Switcher */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded bg-[#0F172A] flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider">
                  A
                </div>
                <span className="font-bold text-base tracking-tight text-[#0F172A]">AURA</span>
              </div>

              <div className="h-5 w-[1px] bg-[#E2E8F0] hidden sm:block"></div>

              {/* Portfolio Switcher Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsPortfolioSwitcherOpen(!isPortfolioSwitcherOpen)}
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] transition-colors"
                >
                  <Briefcase className="w-3.5 h-3.5 text-[#64748B]" />
                  <div className="text-left flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                    <span className="font-semibold truncate max-w-[140px]">{activePortfolio ? activePortfolio.name : 'Portfolios'}</span>
                    <span className="font-mono text-[#059669] font-medium hidden sm:inline">
                      ${portfolioSummary.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
                </button>

                {isPortfolioSwitcherOpen && (
                  <div className="absolute left-0 mt-2 w-72 bg-white border border-[#E2E8F0] rounded-lg shadow-xl py-1 z-50">
                    <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-[#64748B] font-mono border-b border-[#E2E8F0]">
                      PostgreSQL Portfolios
                    </div>
                    {portfolios.map((p) => {
                      const isSelected = p.id === activePortfolio?.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActivePortfolioId(p.id);
                            setIsPortfolioSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs hover:bg-[#F8FAFC] ${isSelected ? 'bg-blue-50/50 text-[#2563EB] font-semibold' : 'text-[#0F172A]'}`}
                        >
                          <div className="truncate pr-2">
                            <div className="truncate">{p.name}</div>
                            <div className="font-mono text-[11px] text-[#64748B]">
                              Cash: ${p.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[#2563EB] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="hidden md:flex items-center space-x-1">
              {['dashboard', 'trade', 'portfolios', 'leaderboard'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-md text-xs font-medium capitalize transition-colors ${activeTab === tab ? 'bg-[#F1F5F9] text-[#0F172A] font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
                >
                  {tab === 'trade' ? 'Trade / Markets' : tab}
                </button>
              ))}
            </div>

            {/* Status & Session */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => { fetchQuotes(); if (activePortfolioId) fetchPortfolioDetails(activePortfolioId); }}
                title="Refresh Live Data"
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-[#E2E8F0]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${quotesLoading ? 'animate-spin text-[#2563EB]' : ''}`} />
              </button>

              <div className="hidden sm:flex items-center space-x-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1.5 rounded-md font-mono">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[#334155] font-semibold">{currentUser.username}</span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 rounded-md text-[#64748B] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* ========================================================================= */}
        {/* DASHBOARD VIEW                                                            */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">Total Portfolio Equity</span>
                  <DollarSign className="w-4 h-4 text-[#64748B]" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold font-mono text-[#0F172A] tracking-tight">
                    ${portfolioSummary.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Cash + Live Market Value
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">Settled Cash Reserves</span>
                  <Briefcase className="w-4 h-4 text-[#64748B]" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold font-mono text-[#0F172A] tracking-tight">
                    ${portfolioSummary.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Available Buying Power
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">Unrealized P&L</span>
                  {portfolioSummary.unrealizedPnL >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <div className="mt-3">
                  <div className={`text-2xl font-bold font-mono tracking-tight ${portfolioSummary.unrealizedPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {portfolioSummary.unrealizedPnL >= 0 ? '+' : ''}${portfolioSummary.unrealizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-xs font-mono mt-1 ${portfolioSummary.unrealizedPnL >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {portfolioSummary.unrealizedPnLPct >= 0 ? '+' : ''}{portfolioSummary.unrealizedPnLPct.toFixed(2)}% on open positions
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">24H Day Change</span>
                  <Clock className="w-4 h-4 text-[#64748B]" />
                </div>
                <div className="mt-3">
                  <div className={`text-2xl font-bold font-mono tracking-tight ${portfolioSummary.dayReturnPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {portfolioSummary.dayReturnPct >= 0 ? '+' : ''}{portfolioSummary.dayReturnPct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Weighted portfolio fluctuation
                  </div>
                </div>
              </div>
            </div>

            {/* Asset Allocation & Performance Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm lg:col-span-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Asset Allocation</h2>
                    <PieChartIcon className="w-4 h-4 text-[#64748B]" />
                  </div>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={allocationData}
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {allocationData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          contentStyle={{ backgroundColor: '#0F172A', color: '#FFFFFF', borderRadius: '6px', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border-t border-[#E2E8F0] pt-4 space-y-2 text-xs">
                  {allocationData.map((item, idx) => {
                    const pct = portfolioSummary.totalEquity > 0 ? ((item.value / portfolioSummary.totalEquity) * 100).toFixed(1) : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between font-mono">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                          <span className="text-[#334155] font-sans">{item.name}</span>
                        </div>
                        <span className="text-[#64748B]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Market Exposure</h2>
                      <p className="text-xs text-[#64748B] mt-0.5">Scraped directly from Yahoo Finance by your backend server.</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('trade')}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-[#0F172A] text-white hover:bg-[#1E293B] flex items-center space-x-1.5"
                    >
                      <span>New Trade Order</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                      <div className="text-[11px] text-[#64748B] uppercase font-mono">Holdings Value</div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] mt-1">
                        ${portfolioSummary.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                      <div className="text-[11px] text-[#64748B] uppercase font-mono">Active Holdings</div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] mt-1">
                        {enrichedHoldings.length} Positions
                      </div>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg col-span-2 sm:col-span-1">
                      <div className="text-[11px] text-[#64748B] uppercase font-mono">Total Cost Basis</div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] mt-1">
                        ${enrichedHoldings.reduce((sum, h) => sum + h.totalCostBasis, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-[#E2E8F0] text-xs text-[#475569] flex items-start space-x-3 font-mono">
                  <Database className="w-4 h-4 text-[#2563EB] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#0F172A]">Backend Persistence:</span> Active portfolio ID <span className="text-[#2563EB]">{activePortfolio?.id}</span> is synced directly with PostgreSQL tables. All transactions are logged permanently.
                  </div>
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Open Portfolio Holdings</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">Real-time valuation from database for {activePortfolio?.name}</p>
                </div>
                <div className="text-xs font-mono text-[#64748B]">
                  {loadingPortfolio ? 'Syncing...' : `${enrichedHoldings.length} Positions`}
                </div>
              </div>

              {enrichedHoldings.length === 0 ? (
                <div className="py-16 text-center">
                  <Layers className="w-8 h-8 text-[#94A3B8] mx-auto mb-2 stroke-[1.5]" />
                  <p className="text-sm font-medium text-[#475569]">No active positions in this portfolio.</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Execute an order in the Trade tab to commit positions to PostgreSQL.</p>
                  <button
                    onClick={() => setActiveTab('trade')}
                    className="mt-4 px-4 py-2 bg-[#0F172A] text-white text-xs font-medium rounded-md hover:bg-[#1E293B]"
                  >
                    Open Trading Desk
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-mono uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Asset Name</th>
                        <th className="py-3 px-4 text-right">Shares</th>
                        <th className="py-3 px-4 text-right">Cost Basis</th>
                        <th className="py-3 px-4 text-right">Yahoo Quote</th>
                        <th className="py-3 px-4 text-right">Market Value</th>
                        <th className="py-3 px-4 text-right">Unrealized P&L</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] font-mono">
                      {enrichedHoldings.map((holding) => {
                        const isGain = holding.unrealizedPnL >= 0;
                        return (
                          <tr key={holding.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="py-3.5 px-4 font-bold text-[#0F172A]">{holding.symbol}</td>
                            <td className="py-3.5 px-4 font-sans text-[#475569]">{holding.name}</td>
                            <td className="py-3.5 px-4 text-right font-semibold text-[#0F172A]">{holding.shares.toLocaleString()}</td>
                            <td className="py-3.5 px-4 text-right text-[#475569]">${holding.averageBuyPrice.toFixed(2)}</td>
                            <td className="py-3.5 px-4 text-right font-semibold text-[#0F172A]">${holding.currentPrice.toFixed(2)}</td>
                            <td className="py-3.5 px-4 text-right font-bold text-[#0F172A]">
                              ${holding.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`py-3.5 px-4 text-right font-semibold ${isGain ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isGain ? '+' : ''}${holding.unrealizedPnL.toFixed(2)} ({isGain ? '+' : ''}{holding.unrealizedPnLPct.toFixed(2)}%)
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => {
                                  setSelectedSymbol(holding.symbol);
                                  setTradeAction('SELL');
                                  setActiveTab('trade');
                                }}
                                className="px-2.5 py-1 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-[11px] font-sans font-medium"
                              >
                                Trade
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TRADE / MARKETS VIEW                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'trade' && (
          <div className="space-y-6">
            
            {/* Search Bar */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search live tickers (e.g. AAPL, NVDA, SPY, BTC-USD, MSFT)..."
                  className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex items-center space-x-2 mt-3 overflow-x-auto pb-1 text-xs">
                <span className="text-[#64748B] font-mono text-[11px] uppercase mr-1">Yahoo Tickers:</span>
                {marketQuotes.slice(0, 8).map(quote => (
                  <button
                    key={quote.symbol}
                    onClick={() => {
                      setSelectedSymbol(quote.symbol);
                      setSearchQuery('');
                    }}
                    className={`px-2.5 py-1 rounded-md font-mono transition-all flex-shrink-0 ${selectedSymbol === quote.symbol ? 'bg-[#0F172A] text-white font-semibold' : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'}`}
                  >
                    {quote.symbol} <span className="text-[10px] opacity-75">${quote.basePrice.toFixed(1)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Trading Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Asset Chart */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl font-bold font-mono text-[#0F172A]">{selectedQuote.symbol}</span>
                        <span className="text-sm text-[#475569] font-medium">{selectedQuote.name}</span>
                        <span className="text-[10px] font-mono uppercase bg-slate-100 text-[#475569] px-2 py-0.5 rounded border border-slate-200">
                          {selectedQuote.category || 'Equity'}
                        </span>
                      </div>
                      <div className="flex items-baseline space-x-3 mt-2">
                        <span className="text-3xl font-extrabold font-mono text-[#0F172A] tracking-tight">
                          ${selectedQuote.basePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-sm font-mono font-semibold flex items-center ${selectedQuote.change24h >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {selectedQuote.change24h >= 0 ? <ArrowUpRight className="w-4 h-4 mr-0.5" /> : <ArrowDownRight className="w-4 h-4 mr-0.5" />}
                          {selectedQuote.change24h >= 0 ? '+' : ''}{selectedQuote.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-xs font-mono text-[#64748B]">
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg text-right">
                        <div>24H HIGH: <span className="font-semibold text-[#0F172A]">${selectedQuote.high24h?.toFixed(2)}</span></div>
                        <div>24H LOW: <span className="font-semibold text-[#0F172A]">${selectedQuote.low24h?.toFixed(2)}</span></div>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg text-right">
                        <div>VOLUME: <span className="font-semibold text-[#0F172A]">{selectedQuote.volume}</span></div>
                        <div className={`flex items-center justify-end font-semibold ${marketStatus.isOpen ? 'text-emerald-600' : 'text-amber-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${marketStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                          {marketStatus.label}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Timeframe selector */}
                  <div className="flex items-center justify-between border-t border-[#E2E8F0] mt-6 pt-4">
                    <div className="text-xs font-mono uppercase text-[#64748B]">Historical Yahoo Candles</div>
                    <div className="flex space-x-1">
                      {['1D', '1W', '1M', '1Y', 'ALL'].map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setTimeframe(tf)}
                          className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${timeframe === tf ? 'bg-[#0F172A] text-white font-bold' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="h-72 w-full mt-4">
                    {chartLoading ? (
                      <div className="h-full w-full flex items-center justify-center text-xs text-[#64748B] font-mono space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
                        <span>Fetching historical quotes from Yahoo Finance API...</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
                          <RechartsTooltip
                            formatter={(val) => [`$${val}`, 'Yahoo Quote']}
                            contentStyle={{ backgroundColor: '#0F172A', color: '#FFFFFF', borderRadius: '6px', fontSize: '12px' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#2563EB"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#priceGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg text-xs text-[#64748B] flex items-center justify-between font-mono">
                  <span>DATA SOURCE: YAHOO FINANCE V8 CHART SCRAPER (BACKEND PROXY)</span>
                  <span className="text-emerald-600 font-semibold">SERVER LIVE</span>
                </div>
              </div>

              {/* Order Execution Card */}
              <div className="lg:col-span-1">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm sticky top-20">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Order Ticket</h3>
                    <span className="text-[11px] font-mono text-[#64748B]">POSTGRESQL AUDIT</span>
                  </div>

                  <div className="grid grid-cols-2 p-1 bg-[#F1F5F9] rounded-lg mb-4 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => { setTradeAction('BUY'); setTradeMessage(null); }}
                      className={`py-2 rounded-md transition-all ${tradeAction === 'BUY' ? 'bg-[#16A34A] text-white shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'}`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTradeAction('SELL'); setTradeMessage(null); }}
                      className={`py-2 rounded-md transition-all ${tradeAction === 'SELL' ? 'bg-[#DC2626] text-white shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'}`}
                    >
                      SELL
                    </button>
                  </div>

                  {tradeMessage && (
                    <div className={`mb-4 p-3 rounded-md text-xs flex items-start space-x-2 ${tradeMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                      {tradeMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-600" />
                      )}
                      <span>{tradeMessage.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleExecuteOrder} className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs text-[#475569] font-mono">
                        <label>QUANTITY (SHARES)</label>
                        {tradeAction === 'SELL' && (
                          <span className="text-[11px] text-[#64748B]">
                            Held: {positions.find(p => p.portfolioId === activePortfolio?.id && p.symbol === selectedSymbol)?.shares || 0}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        required
                        disabled={tradeExecuting}
                        value={tradeShares}
                        onChange={(e) => setTradeShares(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm font-mono text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono">
                      {['25%', '50%', '75%', '100%'].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            if (tradeAction === 'BUY') {
                              const multiplier = parseInt(pct) / 100;
                              const maxPossible = Math.floor((activePortfolio.cashBalance * multiplier) / selectedQuote.basePrice);
                              setTradeShares(Math.max(1, maxPossible).toString());
                            } else {
                              const held = positions.find(p => p.portfolioId === activePortfolio?.id && p.symbol === selectedSymbol)?.shares || 0;
                              const portion = Math.floor(held * (parseInt(pct) / 100));
                              setTradeShares(portion.toString());
                            }
                          }}
                          className="py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#475569] rounded"
                        >
                          {pct}
                        </button>
                      ))}
                    </div>

                    <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-[#64748B]">
                        <span>Yahoo Live Price</span>
                        <span className="text-[#0F172A] font-semibold">${selectedQuote.basePrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[#64748B]">
                        <span>Total Consideration</span>
                        <span className="text-[#0F172A] font-bold">
                          ${((parseFloat(tradeShares) || 0) * selectedQuote.basePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="border-t border-[#E2E8F0] pt-2 flex justify-between text-[#64748B]">
                        <span>Portfolio Cash</span>
                        <span className="text-[#059669] font-semibold">
                          ${activePortfolio ? activePortfolio.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={tradeExecuting}
                      className={`w-full py-3 px-4 rounded-md text-sm font-semibold tracking-wide text-white transition-all shadow-sm flex items-center justify-center space-x-2 ${tradeAction === 'BUY' ? 'bg-[#16A34A] hover:bg-[#15803D]' : 'bg-[#DC2626] hover:bg-[#B91C1C]'} disabled:opacity-50`}
                    >
                      {tradeExecuting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Transacting on PostgreSQL...</span>
                        </>
                      ) : (
                        <span>{tradeAction === 'BUY' ? `Execute Buy Order (${selectedSymbol})` : `Execute Sell Order (${selectedSymbol})`}</span>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PORTFOLIOS VIEW                                                           */}
        {/* ========================================================================= */}
        {activeTab === 'portfolios' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex space-x-2 overflow-x-auto">
                {portfolios.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActivePortfolioId(p.id);
                      setIsRenamingPortfolio(false);
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs font-mono transition-all flex items-center space-x-2 flex-shrink-0 ${p.id === activePortfolio?.id ? 'bg-[#0F172A] text-white font-bold shadow-sm' : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] border border-[#E2E8F0]'}`}
                  >
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewPortfolioName(activePortfolio?.name || '');
                    setIsRenamingPortfolio(!isRenamingPortfolio);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#475569] flex items-center space-x-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Rename</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center space-x-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Portfolio</span>
                </button>
              </div>
            </div>

            {isRenamingPortfolio && (
              <form onSubmit={handleRenamePortfolio} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex items-center space-x-3">
                <input
                  type="text"
                  required
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-md text-sm text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  placeholder="Portfolio title..."
                />
                <button type="submit" className="px-4 py-2 bg-[#0F172A] text-white text-xs font-medium rounded-md">Save Title</button>
                <button type="button" onClick={() => setIsRenamingPortfolio(false)} className="px-3 py-2 text-xs text-[#64748B]">Cancel</button>
              </form>
            )}

            {/* Transaction Ledger Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">PostgreSQL Transaction Ledger</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">Immutable audit trail of executed market orders</p>
                </div>
                <span className="text-xs font-mono text-[#64748B]">{transactions.length} Logged Entries</span>
              </div>

              {transactions.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#64748B]">
                  No historical trades logged in PostgreSQL for this portfolio.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Portfolio</th>
                        <th className="py-3 px-4">Ticker</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4 text-right">Shares</th>
                        <th className="py-3 px-4 text-right">Execution Price</th>
                        <th className="py-3 px-4 text-right">Total Consideration</th>
                        <th className="py-3 px-4 text-right">Realized P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3.5 px-4 text-[#64748B]">
                            {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="py-3.5 px-4 font-sans text-[#475569]">{activePortfolio?.name}</td>
                          <td className="py-3.5 px-4 font-bold text-[#0F172A]">{tx.symbol}</td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tx.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : tx.type === 'SELL' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">{tx.shares > 0 ? tx.shares.toLocaleString() : '—'}</td>
                          <td className="py-3.5 px-4 text-right">${tx.price.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right font-semibold">${tx.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className={`py-3.5 px-4 text-right ${tx.realizedPnL > 0 ? 'text-emerald-600 font-semibold' : tx.realizedPnL < 0 ? 'text-rose-600 font-semibold' : 'text-[#64748B]'}`}>
                            {tx.realizedPnL !== 0 ? `${tx.realizedPnL > 0 ? '+' : ''}$${tx.realizedPnL.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LEADERBOARD VIEW                                                          */}
        {/* ========================================================================= */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <h2 className="text-base font-bold text-[#0F172A] tracking-tight">Global Leaderboard</h2>
                  </div>
                  <p className="text-xs text-[#64748B] mt-1">
                    Calculated live by the backend server comparing all portfolio holdings against live Yahoo Finance prices.
                  </p>
                </div>
                <button
                  onClick={fetchLeaderboard}
                  className="flex items-center space-x-2 font-mono text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-md hover:bg-[#F1F5F9]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${leaderboardLoading ? 'animate-spin' : ''}`} />
                  <span>REFRESH RANKINGS</span>
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-16 text-center">Rank</th>
                      <th className="py-3.5 px-4">Trader Username</th>
                      <th className="py-3.5 px-4">Portfolio Designation</th>
                      <th className="py-3.5 px-4 text-right">Mark-to-Market Equity</th>
                      <th className="py-3.5 px-4 text-right">ROI (%)</th>
                      <th className="py-3.5 px-4 text-right">Holdings</th>
                      <th className="py-3.5 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {leaderboard.map((entry, idx) => {
                      const rank = idx + 1;
                      const isUser = entry.username === currentUser?.username;
                      return (
                        <tr key={entry.id || idx} className={`hover:bg-[#F8FAFC] ${isUser ? 'bg-blue-50/50 font-medium' : ''}`}>
                          <td className="py-4 px-4 text-center">
                            {rank === 1 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold">1</span>}
                            {rank === 2 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold">2</span>}
                            {rank === 3 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-900 font-bold">3</span>}
                            {rank > 3 && <span className="text-[#64748B]">#{rank}</span>}
                          </td>
                          <td className="py-4 px-4 font-bold text-[#0F172A] flex items-center space-x-2">
                            <span>{entry.username}</span>
                            {isUser && <span className="text-[10px] bg-[#2563EB] text-white px-1.5 py-0.5 rounded font-sans">YOU</span>}
                          </td>
                          <td className="py-4 px-4 font-sans text-[#475569]">{entry.portfolioName}</td>
                          <td className="py-4 px-4 text-right font-bold text-[#0F172A]">
                            ${entry.totalEquity?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-4 px-4 text-right font-semibold ${entry.roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {entry.roi >= 0 ? '+' : ''}{entry.roi?.toFixed(2)}%
                          </td>
                          <td className="py-4 px-4 text-right text-[#64748B]">{entry.positionsCount}</td>
                          <td className="py-4 px-4 text-right text-[#94A3B8]">{entry.lastActive || 'Active'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-[#0F172A]">Reset Portfolio to $1,000,000.00?</h3>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              This will execute a reset on your PostgreSQL database, clearing all active positions and setting cash balance back to $1,000,000.00.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 rounded-md border border-[#E2E8F0] text-xs font-medium text-[#475569]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPortfolio}
                className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium"
              >
                Confirm Liquidation & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white py-4 px-6 text-xs text-[#64748B] font-mono mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>PostgreSQL Database & Yahoo Finance Backend Gateway active.</div>
          <div className="flex items-center space-x-3 text-[11px]">
            <span>DB: {backendHealth.database.toUpperCase()}</span>
            <span className="text-emerald-600">ONLINE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
