import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Server,
  Globe2,
  ArrowRight,
  TrendingUp,
  Filter
} from 'lucide-react';

const API_BASE = typeof window !== 'undefined' && window.location.origin.includes('vercel.app') 
  ? '/api' 
  : 'https://aura-trading-desk-ten.vercel.app/api';

const QUICK_ASSETS = [
  { symbol: 'AAPL', label: 'Apple', currency: 'USD' },
  { symbol: 'NVDA', label: 'NVIDIA', currency: 'USD' },
  { symbol: 'TSLA', label: 'Tesla', currency: 'USD' },
  { symbol: 'XPEV', label: 'XPENG', currency: 'USD' },
  { symbol: 'VWS.CO', label: 'Vestas', currency: 'DKK' },
  { symbol: 'SPY', label: 'S&P 500', currency: 'USD' },
  { symbol: 'BTC-USD', label: 'Bitcoin', currency: 'USD' },
  { symbol: 'ETH-USD', label: 'Ethereum', currency: 'USD' }
];

const TIMEFRAMES = ['1D', '1W', '1M', '1Y'];

const formatDKK = (amount) => {
  const val = Number(amount) || 0;
  return val.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' kr.';
};

const formatNativePrice = (amount, currency = 'USD') => {
  const val = Number(amount) || 0;
  if (currency === 'USD') return `$${val.toFixed(2)}`;
  if (currency === 'EUR') return `€${val.toFixed(2)}`;
  if (currency === 'GBP') return `£${val.toFixed(2)}`;
  if (currency === 'DKK') return `${val.toFixed(2)} kr.`;
  return `${val.toFixed(2)} ${currency}`;
};

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
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const [portfolioTimeframe, setPortfolioTimeframe] = useState('1M');
  const [portfolioChartData, setPortfolioChartData] = useState([]);
  const [portfolioChartLoading, setPortfolioChartLoading] = useState(false);
  const [holdingsFilter, setHoldingsFilter] = useState('all'); // 'all' | portfolioId

  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSearching, setSearchSearching] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState('1M');
  const [quote, setQuote] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [heldLiveQuotes, setHeldLiveQuotes] = useState({});

  const [liveFxRate, setLiveFxRate] = useState(6.85);

  const [orderType, setOrderType] = useState('BUY');
  const [orderShares, setOrderShares] = useState('');
  const [inputMode, setInputMode] = useState('shares');
  const [targetNativeAmount, setTargetNativeAmount] = useState('');
  const [orderStatus, setOrderStatus] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);

  const searchBoxRef = useRef(null);

  const activeCurrency = quote?.currency || (selectedSymbol?.endsWith('.CO') ? 'DKK' : 'USD');
  const activeCurrencySymbol = activeCurrency === 'USD' ? '$' : activeCurrency === 'EUR' ? '€' : activeCurrency === 'GBP' ? '£' : 'kr.';

  useEffect(() => {
    if (activeCurrency === 'DKK') {
      setLiveFxRate(1.0);
      return;
    }
    let isCancelled = false;
    fetch(`${API_BASE}/markets/quote/${activeCurrency}DKK=X`)
      .then(res => res.json())
      .then(data => {
        if (!isCancelled && data && data.price > 0) {
          setLiveFxRate(data.price);
        }
      })
      .catch(() => {});
    return () => { isCancelled = true; };
  }, [activeCurrency]);

  const handleSharesChange = (val) => {
    setOrderShares(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && quote?.price) {
      setTargetNativeAmount((num * quote.price).toFixed(2));
    } else {
      setTargetNativeAmount('');
    }
  };

  const handleNativeAmountChange = (val) => {
    setTargetNativeAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && quote?.price) {
      const nearestShares = Math.max(1, Math.round(num / quote.price));
      setOrderShares(String(nearestShares));
    } else {
      setOrderShares('');
    }
  };

  const applyCashPercentage = (pct) => {
    if (!activePortfolio?.cashBalance || !quote?.price || !liveFxRate) return;
    const availableInNative = activePortfolio.cashBalance / liveFxRate;
    const targetNative = availableInNative * (pct / 100);
    handleNativeAmountChange(targetNative.toFixed(2));
    setInputMode('native');
  };

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      if (data && data.status === 'ok') {
        setApiStatus(data.database === 'postgresql' ? 'ONLINE (POSTGRESQL)' : 'ONLINE (IN-MEMORY)');
        setIsBackendConnected(true);
      } else {
        setApiStatus('OFFLINE');
        setIsBackendConnected(false);
      }
    } catch {
      setApiStatus('OFFLINE (UNREACHABLE)');
      setIsBackendConnected(false);
    }
  };

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
          const defaultId = portData[0].id;
          setActivePortfolioId(prev => (prev && portData.some(p => p.id === prev) ? prev : defaultId));
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

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchSearching(true);
      try {
        const res = await fetch(`${API_BASE}/markets/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectAsset = (sym) => {
    if (!sym) return;
    const clean = sym.trim().toUpperCase();
    setSelectedSymbol(clean);
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      selectAsset(searchResults[0].symbol);
    } else if (searchQuery.trim()) {
      selectAsset(searchQuery.trim().toUpperCase());
    }
  };

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

  const activePortfolio = useMemo(() => {
    if (!portfolios || portfolios.length === 0) return null;
    return portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
  }, [portfolios, activePortfolioId]);

  const handlePortfolioSwitch = (newId) => {
    setActivePortfolioId(newId);
    if (holdingsFilter !== 'all') {
      setHoldingsFilter(newId);
    }
  };

  useEffect(() => {
    if (!activePortfolio) return;
    let isCancelled = false;

    const computePortfolioChart = async () => {
      setPortfolioChartLoading(true);
      try {
        const positions = activePortfolio.positions || [];
        if (positions.length === 0) {
          const dummyPoints = Array.from({ length: 30 }, (_, i) => ({
            time: `Dag ${i + 1}`,
            value: activePortfolio.cashBalance || 1000000
          }));
          if (!isCancelled) setPortfolioChartData(dummyPoints);
          setPortfolioChartLoading(false);
          return;
        }

        const chartPromises = positions.map(pos =>
          fetch(`${API_BASE}/markets/chart/${encodeURIComponent(pos.symbol)}?range=${portfolioTimeframe}`)
            .then(res => res.json())
            .catch(() => [])
        );

        const chartsResults = await Promise.all(chartPromises);
        
        const symbolCharts = {};
        positions.forEach((pos, idx) => {
          const data = chartsResults[idx];
          if (Array.isArray(data) && data.length > 0) {
            symbolCharts[pos.symbol] = data;
          }
        });

        const baseSymbol = positions[0].symbol;
        const basePoints = symbolCharts[baseSymbol] || [];

        if (basePoints.length === 0) {
          const cashVal = activePortfolio.cashBalance || 0;
          const fallbackPoints = Array.from({ length: 30 }, (_, i) => ({ time: `T${i}`, value: cashVal }));
          if (!isCancelled) setPortfolioChartData(fallbackPoints);
          setPortfolioChartLoading(false);
          return;
        }

        const combined = basePoints.map((pt, idx) => {
          let totalValDKK = activePortfolio.cashBalance || 0;

          positions.forEach(pos => {
            const symChart = symbolCharts[pos.symbol];
            const pointPrice = (symChart && symChart[idx]) ? symChart[idx].price : pos.avgPrice;
            const currency = pos.currency || (pos.symbol.endsWith('.CO') ? 'DKK' : 'USD');
            const fxRate = currency === 'DKK' ? 1.0 : liveFxRate;
            totalValDKK += pos.shares * pointPrice * fxRate;
          });

          return {
            time: pt.time,
            value: parseFloat(totalValDKK.toFixed(2))
          };
        });

        if (!isCancelled) {
          setPortfolioChartData(combined);
        }
      } catch (err) {
        console.error('Portfolio chart computation error:', err);
      } finally {
        if (!isCancelled) setPortfolioChartLoading(false);
      }
    };

    computePortfolioChart();
    return () => { isCancelled = true; };
  }, [activePortfolio, portfolioTimeframe, liveFxRate]);

  useEffect(() => {
    const allSymbols = [
      ...new Set(
        portfolios.flatMap(p => (p.positions || []).map(pos => pos.symbol))
      )
    ].filter(Boolean);

    if (allSymbols.length === 0) return;

    fetch(`${API_BASE}/markets/quotes?symbols=${encodeURIComponent(allSymbols.join(','))}`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object') {
          setHeldLiveQuotes(data);
        }
      })
      .catch(() => {});
  }, [portfolios]);

  const allHoldingsCalculations = useMemo(() => {
    let totalMarketValueDKK = 0;
    let totalCostBasisDKK = 0;
    const allItems = [];

    portfolios.forEach(port => {
      (port.positions || []).forEach(pos => {
        const liveData = heldLiveQuotes[pos.symbol] || (selectedSymbol === pos.symbol ? quote : null);
        const livePrice = liveData?.price || pos.avgPrice;
        const currency = pos.currency || liveData?.currency || (pos.symbol.endsWith('.CO') ? 'DKK' : 'USD');
        const fxRate = currency === 'DKK' ? 1.0 : liveFxRate;

        const marketValNative = pos.shares * livePrice;
        const marketValDKK = marketValNative * fxRate;
        const costBasisNative = pos.shares * pos.avgPrice;
        const costBasisDKK = costBasisNative * fxRate;
        const gainDKK = marketValDKK - costBasisDKK;
        const gainPct = costBasisDKK > 0 ? (gainDKK / costBasisDKK) * 100 : 0;

        if (port.id === activePortfolio?.id) {
          totalMarketValueDKK += marketValDKK;
          totalCostBasisDKK += costBasisDKK;
        }

        allItems.push({
          ...pos,
          portfolioId: port.id,
          portfolioName: port.name,
          livePrice,
          currency,
          fxRate,
          marketValNative,
          marketValDKK,
          costBasisDKK,
          gainDKK,
          gainPct,
          stockName: liveData?.name || pos.symbol
        });
      });
    });

    const unrealizedGainDKK = totalMarketValueDKK - totalCostBasisDKK;
    const unrealizedGainPct = totalCostBasisDKK > 0 ? (unrealizedGainDKK / totalCostBasisDKK) * 100 : 0;

    return { totalMarketValueDKK, unrealizedGainDKK, unrealizedGainPct, allItems };
  }, [portfolios, activePortfolio, heldLiveQuotes, quote, selectedSymbol, liveFxRate]);

  const displayedHoldings = useMemo(() => {
    if (holdingsFilter === 'all') {
      return allHoldingsCalculations.allItems;
    }
    return allHoldingsCalculations.allItems.filter(item => item.portfolioId === holdingsFilter);
  }, [allHoldingsCalculations, holdingsFilter]);

  const totalEquity = (activePortfolio?.cashBalance || 0) + (allHoldingsCalculations.totalMarketValueDKK || 0);

  const timeframeReturn = useMemo(() => {
    if (!chartData || chartData.length < 2) {
      return { change: quote?.change || 0, changePercent: quote?.changePercent || 0 };
    }
    const firstPrice = chartData[0].price;
    const lastPrice = chartData[chartData.length - 1].price;
    const change = lastPrice - firstPrice;
    const changePercent = firstPrice > 0 ? (change / firstPrice) * 100 : 0;
    return { change, changePercent };
  }, [chartData, quote]);

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
      if (!res.ok) throw new Error(data?.error || 'Authentication failed');

      const resolvedUser = (data && data.user) ? data.user : data;
      if (!resolvedUser || !resolvedUser.id) throw new Error('Database returned invalid profile format');

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
      setOrderStatus({ type: 'error', message: 'Indtast venligst et gyldigt antal aktier' });
      return;
    }

    const totalNative = qty * quote.price;
    const curr = activeCurrency;
    const totalDKK = totalNative * liveFxRate;

    if (orderType === 'BUY' && totalDKK > activePortfolio.cashBalance) {
      setOrderStatus({ 
        type: 'error', 
        message: `Utilstrækkelig likviditet. Kræver ${formatDKK(totalDKK)}, men du har kun ${formatDKK(activePortfolio.cashBalance)}.` 
      });
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
          price: quote.price,
          currency: curr,
          totalDKK: totalDKK,
          totalValue: totalDKK
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Order execution rejected');

      setOrderStatus({
        type: 'success',
        message: `Udført ${orderType} ${qty.toLocaleString()} ${quote.symbol} @ ${formatNativePrice(quote.price, curr)} (Afregnet: ${formatDKK(totalDKK)})`
      });
      setOrderShares('');
      setTargetNativeAmount('');
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
    if (!window.confirm('Nulstil dette handelsbord? Alle positioner vil blive likvideret og saldoen gendannet til 1.000.000,00 kr.')) return;
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

  const allocationData = useMemo(() => {
    if (!activePortfolio) return [];
    const cash = activePortfolio.cashBalance || 0;
    const data = [{ name: 'Kontantbeholdning (kr.)', value: cash, color: '#0F172A' }];
    const colors = ['#2563EB', '#0D9488', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#6366F1'];

    const portfolioPositions = allHoldingsCalculations.allItems.filter(
      p => p.portfolioId === activePortfolio.id
    );

    portfolioPositions.forEach((pos, idx) => {
      data.push({
        name: pos.symbol,
        value: pos.marketValDKK,
        color: colors[idx % colors.length]
      });
    });
    return data;
  }, [activePortfolio, allHoldingsCalculations]);

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
            <span className={isBackendConnected ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
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
            Global market desk integrated with Yahoo Finance scraping backend.
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
                  Authenticating...
                </>
              ) : (
                authMode === 'login' ? 'Authenticate Access' : 'Register Profile in Database'
              )}
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] font-mono text-slate-400">
          AURA Institutional Desk &bull; Base Currency: DKK
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
      <nav className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="w-8 h-8 bg-slate-950 rounded flex items-center justify-center text-white font-bold text-sm shadow-sm">
                A
              </div>
              <div>
                <span className="font-semibold tracking-tight text-base text-slate-950 block">AURA Desk</span>
                <span className="text-[10px] font-mono text-slate-400">Base: DKK (kr.)</span>
              </div>
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
                <span className="font-bold text-slate-900">{formatDKK(totalEquity || 0)}</span>
                <select
                  aria-label="Active Portfolio Switcher"
                  value={activePortfolioId || ''}
                  onChange={(e) => handlePortfolioSwitch(e.target.value)}
                  className="bg-transparent border-none text-slate-700 focus:outline-none cursor-pointer text-xs ml-1 font-sans font-medium"
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

      {}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Samlet Porteføljeværdi</div>
                <div className="text-2xl font-mono font-bold text-slate-950">
                  {formatDKK(totalEquity || 0)}
                </div>
                <div className="text-xs font-mono text-slate-600 mt-2">
                  Startkapital: 1.000.000,00 kr.
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Tilgængelige Kontanter</div>
                <div className="text-2xl font-mono font-bold text-slate-950">
                  {formatDKK(activePortfolio?.cashBalance || 0)}
                </div>
                <div className="text-xs font-mono text-slate-600 mt-2">
                  Købekraft i DKK ({activePortfolio?.name})
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Urealiseret Gevinst / Tab</div>
                <div className={`text-2xl font-mono font-bold flex items-center gap-1 ${(allHoldingsCalculations.unrealizedGainDKK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {(allHoldingsCalculations.unrealizedGainDKK || 0) >= 0 ? '+' : ''}
                  {formatDKK(allHoldingsCalculations.unrealizedGainDKK || 0)}
                </div>
                <div className={`text-xs font-mono mt-2 font-medium ${(allHoldingsCalculations.unrealizedGainPct || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {(allHoldingsCalculations.unrealizedGainPct || 0) >= 0 ? '+' : ''}{(allHoldingsCalculations.unrealizedGainPct || 0).toFixed(2)}% på åbne positioner
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600 mb-1">Samlet Afkast (ROI)</div>
                {(() => {
                  const roi = (((totalEquity || 1000000) - 1000000) / 1000000) * 100;
                  return (
                    <>
                      <div className={`text-2xl font-mono font-bold ${roi >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                      </div>
                      <div className="text-xs font-mono text-slate-600 mt-2">
                        I forhold til 1.000.000 kr.
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-5 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-900">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Samlet Porteføljeudvikling</h3>
                    <p className="text-xs text-slate-600">Historisk markedsværdi af det valgte handelsbord i DKK</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Dashboard Portfolio Selector"
                    value={activePortfolioId || ''}
                    onChange={(e) => handlePortfolioSwitch(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    {portfolios.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md">
                    {TIMEFRAMES.map(tf => (
                      <button
                        key={tf}
                        onClick={() => setPortfolioTimeframe(tf)}
                        className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded transition ${
                          portfolioTimeframe === tf ? 'bg-white text-slate-950 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-72 w-full">
                {portfolioChartLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 text-xs font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Beregner samlet porteføljetidslinje...
                  </div>
                ) : portfolioChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={portfolioChartData}>
                      <defs>
                        <linearGradient id="colorPort" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0F172A" stopOpacity={0.18}/>
                          <stop offset="95%" stopColor="#0F172A" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="time" stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <YAxis domain={['auto', 'auto']} stroke="#94A3B8" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k kr.`} />
                      <RechartsTooltip
                        formatter={(val) => [formatDKK(val), 'Samlet Værdi']}
                        contentStyle={{ backgroundColor: '#0F172A', borderRadius: '6px', border: 'none', color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#0F172A" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPort)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
                    Ingen tidslinjedata tilgængelig for dette bord
                  </div>
                )}
              </div>
            </div>

            {}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Aktivbeholdninger</h3>
                    <p className="text-xs text-slate-600">Markedsværdi og afkast oversat til danske kroner (DKK)</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('markets')}
                    className="text-xs font-mono font-semibold text-blue-600 hover:text-blue-800 transition"
                  >
                    Gå til handel &rarr;
                  </button>
                </div>

                {/* Portfolio Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-slate-100 text-xs">
                  <span className="text-slate-400 text-[11px] flex items-center gap-1 mr-1 shrink-0 font-mono">
                    <Filter className="w-3 h-3" /> Vis:
                  </span>
                  <button
                    onClick={() => setHoldingsFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition shrink-0 ${
                      holdingsFilter === 'all'
                        ? 'bg-slate-950 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Alle Borde ({allHoldingsCalculations.allItems.length})
                  </button>
                  {portfolios.map(p => {
                    const count = allHoldingsCalculations.allItems.filter(i => i.portfolioId === p.id).length;
                    const isSelected = holdingsFilter === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setHoldingsFilter(p.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {p.name} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-600">
                        <th className="pb-3">Aktiv / Navn</th>
                        {holdingsFilter === 'all' && <th className="pb-3">Handelsbord</th>}
                        <th className="pb-3 text-right">Antal</th>
                        <th className="pb-3 text-right">Gns. Pris</th>
                        <th className="pb-3 text-right">Aktuel Pris</th>
                        <th className="pb-3 text-right">Markedsværdi (DKK)</th>
                        <th className="pb-3 text-right">Afkast (DKK)</th>
                        <th className="pb-3 text-right">Handling</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {displayedHoldings.length === 0 ? (
                        <tr>
                          <td colSpan={holdingsFilter === 'all' ? 8 : 7} className="py-8 text-center text-slate-500 font-sans">
                            {holdingsFilter === 'all'
                              ? 'Ingen åbne positioner i nogen af dine handelsborde endnu.'
                              : `Ingen åbne positioner i ${portfolios.find(p => p.id === holdingsFilter)?.name || 'dette bord'}.`}
                          </td>
                        </tr>
                      ) : (
                        displayedHoldings.map(pos => (
                          <tr key={`${pos.portfolioId}-${pos.symbol}`} className="hover:bg-slate-50 transition">
                            <td className="py-3.5">
                              <button
                                onClick={() => {
                                  selectAsset(pos.symbol);
                                  handlePortfolioSwitch(pos.portfolioId);
                                  setActiveTab('markets');
                                }}
                                className="text-left group cursor-pointer"
                              >
                                <div className="font-bold text-slate-950 group-hover:text-blue-600 transition flex items-center gap-1.5">
                                  <span>{pos.symbol}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">({pos.currency})</span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-normal truncate max-w-[160px] font-sans">
                                  {pos.stockName}
                                </div>
                              </button>
                            </td>
                            {holdingsFilter === 'all' && (
                              <td className="py-3.5">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-sans font-medium">
                                  {pos.portfolioName}
                                </span>
                              </td>
                            )}
                            <td className="py-3.5 text-right text-slate-800">{pos.shares.toLocaleString()}</td>
                            <td className="py-3.5 text-right text-slate-800">{formatNativePrice(pos.avgPrice, pos.currency)}</td>
                            <td className="py-3.5 text-right font-medium text-slate-950">{formatNativePrice(pos.livePrice, pos.currency)}</td>
                            <td className="py-3.5 text-right font-bold text-slate-950">{formatDKK(pos.marketValDKK)}</td>
                            <td className={`py-3.5 text-right font-medium ${(pos.gainDKK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {(pos.gainDKK || 0) >= 0 ? '+' : ''}{formatDKK(pos.gainDKK)}
                              <div className="text-[10px] text-slate-400">({(pos.gainPct || 0) >= 0 ? '+' : ''}{(pos.gainPct || 0).toFixed(2)}%)</div>
                            </td>
                            <td className="py-3.5 text-right">
                              <button
                                onClick={() => {
                                  selectAsset(pos.symbol);
                                  handlePortfolioSwitch(pos.portfolioId);
                                  setActiveTab('markets');
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded font-semibold text-[11px] transition"
                              >
                                Handl
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">Aktivfordeling</h3>
                  <p className="text-xs text-slate-600 mb-4">{activePortfolio?.name} (Vægtet fordeling i DKK)</p>

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
                          formatter={(val) => formatDKK(val)}
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

        {}
        {activeTab === 'markets' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="relative mb-3" ref={searchBoxRef}>
                  <form onSubmit={handleSearchSubmit} className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-slate-950 focus-within:bg-white transition">
                    <Search className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      placeholder="Søg aktier, krypto eller ETF'er (f.eks. Vestas, XPENG, VWS.CO, NVDA)..."
                      className="bg-transparent text-xs w-full focus:outline-none font-mono"
                    />
                    {searchSearching && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin mr-2" />}
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-white rounded text-[11px] font-semibold flex items-center gap-1 shrink-0"
                    >
                      <span>Hent</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </form>

                  {searchFocused && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-64 overflow-y-auto">
                      {searchResults.map(s => (
                        <div
                          key={s.symbol}
                          onMouseDown={() => selectAsset(s.symbol)}
                          className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs border-b border-slate-50 last:border-none"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-bold font-mono text-slate-900 text-sm">{s.symbol}</span>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{s.exchange}</span>
                            </div>
                            <span className="text-slate-600 text-[11px] truncate max-w-sm">{s.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">{s.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-4 text-xs font-mono">
                  <span className="text-slate-400 text-[11px] mr-1 flex items-center gap-1">
                    <Globe2 className="w-3 h-3" /> Hurtig:
                  </span>
                  {QUICK_ASSETS.map(item => (
                    <button
                      key={item.symbol}
                      onClick={() => selectAsset(item.symbol)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition border shrink-0 ${
                        selectedSymbol === item.symbol
                          ? 'bg-slate-950 text-white border-slate-950'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label} ({item.symbol})
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap justify-between items-end gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold font-mono text-slate-950">{quote?.symbol || selectedSymbol}</h2>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                        {activeCurrency}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                        1 {activeCurrency} = {liveFxRate.toFixed(2)} DKK (Live)
                      </span>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-semibold ${
                        quote?.isLive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {quote?.marketState === 'REGULAR' ? 'Live Marked' : 'Lukket'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{quote?.name || selectedSymbol}</p>
                    {quote?.exchangeName && (
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">Børs: {quote.exchangeName}</p>
                    )}
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-3xl font-bold text-slate-950">
                      {formatNativePrice(quote?.price, activeCurrency)}
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      ≈ {formatDKK((quote?.price || 0) * liveFxRate)}
                    </div>
                    <div className={`text-xs font-semibold flex items-center justify-end gap-1 mt-1 ${
                      timeframeReturn.change >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {timeframeReturn.change >= 0 ? '+' : ''}{timeframeReturn.change.toFixed(2)} ({timeframeReturn.changePercent >= 0 ? '+' : ''}{timeframeReturn.changePercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-5 mb-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-600">Historiske Graffer ({activeTimeframe})</div>
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
                      Henter Yahoo Finance data fra backend...
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
                        <YAxis domain={['auto', 'auto']} stroke="#94A3B8" fontSize={10} tickLine={false} tickFormatter={(v) => `${v}`} />
                        <RechartsTooltip
                          formatter={(v) => [formatNativePrice(v, activeCurrency), 'Pris']}
                          contentStyle={{ backgroundColor: '#0F172A', borderRadius: '6px', border: 'none', color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                        />
                        <Area type="monotone" dataKey="price" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
                      Ingen data modtaget fra Yahoo Finance scraper
                    </div>
                  )}
                </div>
              </div>
            </div>

            {}
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-base font-semibold text-slate-950">Handelsordre</h3>
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    Bord: {activePortfolio?.name}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-5">Handles i aktiens native valuta ({activeCurrency}) &bull; Afregnet i DKK</p>

                <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg mb-5">
                  <button
                    onClick={() => setOrderType('BUY')}
                    className={`py-2 text-xs font-bold font-mono rounded-md transition ${
                      orderType === 'BUY' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    KØBSORDRE
                  </button>
                  <button
                    onClick={() => setOrderType('SELL')}
                    className={`py-2 text-xs font-bold font-mono rounded-md transition ${
                      orderType === 'SELL' ? 'bg-rose-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    SALGSORDRE
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
                      Aktiv & Pris
                    </label>
                    <div className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-950 flex justify-between items-center">
                      <span>{quote?.symbol || selectedSymbol}</span>
                      <span className="font-normal text-slate-700">
                        {quote?.price ? formatNativePrice(quote.price, activeCurrency) : 'Indlæser...'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5 font-sans">
                      <label className="text-[11px] uppercase tracking-wider text-slate-600">
                        {inputMode === 'shares' ? 'Antal Aktier' : `Investering i ${activeCurrency}`}
                      </label>
                      <div className="flex bg-slate-100 p-0.5 rounded text-[10px] font-mono">
                        <button
                          type="button"
                          onClick={() => setInputMode('shares')}
                          className={`px-2 py-0.5 rounded transition ${inputMode === 'shares' ? 'bg-white font-bold text-slate-950 shadow-xs' : 'text-slate-500'}`}
                        >
                          Aktier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInputMode('native');
                            if (orderShares && quote?.price) setTargetNativeAmount((parseFloat(orderShares) * quote.price).toFixed(2));
                          }}
                          className={`px-2 py-0.5 rounded transition ${inputMode === 'native' ? 'bg-white font-bold text-slate-950 shadow-xs' : 'text-slate-500'}`}
                        >
                          {activeCurrency}
                        </button>
                      </div>
                    </div>

                    {inputMode === 'shares' ? (
                      <div>
                        <input
                          type="number"
                          step="any"
                          min="1"
                          value={orderShares}
                          onChange={(e) => handleSharesChange(e.target.value)}
                          placeholder="Antal aktier"
                          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 font-mono text-sm"
                        />
                        <div className="flex justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
                          <span>Pris i {activeCurrency}:</span>
                          <span className="font-bold text-slate-900">
                            {formatNativePrice((parseFloat(orderShares) || 0) * (quote?.price || 0), activeCurrency)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs font-bold">
                            {activeCurrencySymbol}
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="1"
                            value={targetNativeAmount}
                            onChange={(e) => handleNativeAmountChange(e.target.value)}
                            placeholder={`Beløb i ${activeCurrency}`}
                            className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950 font-mono text-sm"
                          />
                        </div>

                        {orderType === 'BUY' && (
                          <div className="flex items-center gap-1 text-[10px] font-mono">
                            <span className="text-slate-400">Likviditet:</span>
                            {[10, 25, 50, 100].map(pct => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => applyCashPercentage(pct)}
                                className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 transition"
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        )}

                        {parseFloat(targetNativeAmount) > 0 && quote?.price && (
                          <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] font-mono text-blue-900 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-blue-700">Nærmeste aktier:</span>
                              <span className="font-bold text-slate-950">{orderShares} stk</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-blue-700">Tilpasset total:</span>
                              <span className="font-bold text-slate-950">
                                {formatNativePrice((parseFloat(orderShares) || 0) * quote.price, activeCurrency)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-lg space-y-2 border border-slate-100 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Børsnotering ({activeCurrency}):</span>
                      <span className="font-bold text-slate-950">
                        {formatNativePrice((parseFloat(orderShares) || 0) * (quote?.price || 0), activeCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Afregnes i DKK (Live kurs {liveFxRate.toFixed(2)}):</span>
                      <span className="font-bold text-slate-950">
                        {formatDKK((parseFloat(orderShares) || 0) * (quote?.price || 0) * liveFxRate)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleTrade}
                    disabled={tradeLoading || !quote?.price}
                    className={`w-full py-3.5 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-sm ${
                      orderType === 'BUY' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'
                    }`}
                  >
                    {tradeLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Udfører ordre...
                      </>
                    ) : (
                      `Bekræft ${orderType === 'BUY' ? 'Køb' : 'Salg'} (${formatNativePrice((parseFloat(orderShares) || 0) * (quote?.price || 0), activeCurrency)})`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'portfolios' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">Porteføljestyring</h3>
                  <p className="text-xs text-slate-600">Skift, omdøb eller nulstil dine handelsborde</p>
                </div>

                <div className="flex items-center gap-2">
                  {renaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nyt navn..."
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                      <button onClick={handleRename} className="px-3 py-1.5 bg-slate-950 text-white rounded-lg text-xs font-semibold">Gem</button>
                      <button onClick={() => setRenaming(false)} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs">Annuller</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setRenaming(true); setNewName(activePortfolio?.name || ''); }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold transition"
                    >
                      Omdøb Bord
                    </button>
                  )}

                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition"
                  >
                    Nulstil til 1M kr.
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {portfolios.map(p => {
                  const isActive = p.id === activePortfolioId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handlePortfolioSwitch(p.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition ${
                        isActive ? 'border-slate-950 bg-slate-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-950 mb-1">{p.name}</div>
                      <div className="text-lg font-mono font-bold text-slate-950">
                        {formatDKK(p.cashBalance || 0)}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono mt-2">
                        {p.positions?.length || 0} Positioner
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-950 mb-1">Handelslog (Audit Trail)</h3>
              <p className="text-xs text-slate-600 mb-5">Transaktionshistorik for {activePortfolio?.name}</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600">
                      <th className="pb-3">Tidspunkt</th>
                      <th className="pb-3">Aktiv</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3 text-right">Antal</th>
                      <th className="pb-3 text-right">Pris (Native)</th>
                      <th className="pb-3 text-right">Afregnet (DKK)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!activePortfolio?.transactions || activePortfolio.transactions.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                          Ingen transaktioner fundet.
                        </td>
                      </tr>
                    ) : (
                      activePortfolio.transactions.map((tx, idx) => (
                        <tr key={tx.id || idx} className="hover:bg-slate-50">
                          <td className="py-3 text-slate-500">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                          <td className="py-3 font-bold text-slate-950">{tx.symbol}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {tx.type === 'BUY' ? 'KØB' : 'SALG'}
                            </span>
                          </td>
                          <td className="py-3 text-right">{tx.shares.toLocaleString()}</td>
                          <td className="py-3 text-right">{formatNativePrice(tx.price, tx.currency || 'USD')}</td>
                          <td className="py-3 text-right font-bold">{formatDKK(tx.totalDKK || tx.totalValue || 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'leaderboard' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-950 mb-1">Rangliste (Leaderboard)</h3>
            <p className="text-xs text-slate-600 mb-6">Globale placeringer baseret på samlet markedsværdi i DKK</p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-600">
                    <th className="pb-3">Placering</th>
                    <th className="pb-3">Trader</th>
                    <th className="pb-3">Portefølje</th>
                    <th className="pb-3 text-right">Samlet Værdi (DKK)</th>
                    <th className="pb-3 text-right">Afkast (ROI)</th>
                    <th className="pb-3 text-right">Aktiver</th>
                    <th className="pb-3 text-right">Sidst Aktiv</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {leaderboard.map((entry, idx) => (
                    <tr key={entry.id || idx} className="hover:bg-slate-50">
                      <td className="py-3.5 font-bold text-slate-900">#{idx + 1}</td>
                      <td className="py-3.5 font-semibold text-slate-950 font-sans">{entry.username}</td>
                      <td className="py-3.5 text-slate-600">{entry.portfolioName}</td>
                      <td className="py-3.5 text-right font-bold text-slate-950">{formatDKK(entry.totalEquity || 0)}</td>
                      <td className={`py-3.5 text-right font-semibold ${(entry.roi || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {(entry.roi || 0) >= 0 ? '+' : ''}{(entry.roi || 0).toFixed(2)}%
                      </td>
                      <td className="py-3.5 text-right text-slate-600">{entry.assetsCount}</td>
                      <td className="py-3.5 text-right text-slate-500">{entry.lastActive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
