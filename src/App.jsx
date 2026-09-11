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
  Sliders,
  ShieldCheck,
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
  BarChart3,
  ListFilter,
  Check,
  X,
  Sparkles,
  Info
} from 'lucide-react';

const INITIAL_MARKET_ASSETS = [
  { symbol: 'AAPL', name: 'Apple Inc.', basePrice: 228.45, category: 'Equity', change24h: 1.24, high24h: 230.15, low24h: 226.80, volume: '48.2M' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', basePrice: 442.80, category: 'Equity', change24h: -0.42, high24h: 446.50, low24h: 440.10, volume: '22.1M' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', basePrice: 126.90, category: 'Equity', change24h: 3.18, high24h: 128.40, low24h: 123.10, volume: '74.6M' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', basePrice: 242.15, category: 'Equity', change24h: -1.85, high24h: 248.00, low24h: 239.50, volume: '61.3M' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', basePrice: 562.30, category: 'ETF', change24h: 0.65, high24h: 563.80, low24h: 560.20, volume: '58.4M' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust Series 1', basePrice: 486.20, category: 'ETF', change24h: 0.92, high24h: 488.10, low24h: 483.50, volume: '39.8M' },
  { symbol: 'BTC-USD', name: 'Bitcoin USD', basePrice: 63420.00, category: 'Crypto', change24h: 2.45, high24h: 64150.00, low24h: 61800.00, volume: '$28.4B' },
  { symbol: 'ETH-USD', name: 'Ethereum USD', basePrice: 2685.50, category: 'Crypto', change24h: -0.78, high24h: 2740.00, low24h: 2640.00, volume: '$14.2B' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', basePrice: 187.60, category: 'Equity', change24h: 1.05, high24h: 189.20, low24h: 186.00, volume: '31.5M' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', basePrice: 167.40, category: 'Equity', change24h: -0.35, high24h: 169.00, low24h: 166.20, volume: '24.9M' }
];

const PRE_SEEDED_LEADERBOARD = [
  { id: 'lead_1', username: 'Citadel_Tactical', portfolioName: 'Alpha Arbitrage Fund', totalEquity: 1428500.00, roi: 42.85, positionsCount: 7, lastActive: '2m ago' },
  { id: 'lead_2', username: 'Bridgewater_Sim', portfolioName: 'All-Weather Macro III', totalEquity: 1284120.50, roi: 28.41, positionsCount: 5, lastActive: '14m ago' },
  { id: 'lead_3', username: 'Renaissance_Quant', portfolioName: 'Medallion Synthetic', totalEquity: 1215400.00, roi: 21.54, positionsCount: 8, lastActive: '1h ago' },
  { id: 'lead_4', username: 'TwoSigma_Labs', portfolioName: 'StatArb Systematic', totalEquity: 1162900.25, roi: 16.29, positionsCount: 4, lastActive: '3h ago' },
  { id: 'lead_5', username: 'Millennium_Global', portfolioName: 'Multi-Strategy Pod 4', totalEquity: 1089300.00, roi: 8.93, positionsCount: 6, lastActive: '5h ago' },
  { id: 'lead_6', username: 'Vanguard_Indexed', portfolioName: 'Passive Core 100', totalEquity: 1042100.00, roi: 4.21, positionsCount: 3, lastActive: '12h ago' },
  { id: 'lead_7', username: 'BlackRock_Tactical', portfolioName: 'Global Allocation Desk', totalEquity: 974300.00, roi: -2.57, positionsCount: 4, lastActive: '1d ago' },
];

const DEFAULT_PORTFOLIO_NAMES = [
  'Portfolio 1: Core Equity',
  'Portfolio 2: Growth & Momentum',
  'Portfolio 3: Macro & Crypto'
];

const STORAGE_PREFIX = 'aura_desk_storage_';

const storage = {
  get: (key, fallback) => {
    try {
      const item = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      console.warn('Storage read fallback', e);
      return fallback;
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage write fallback', e);
    }
  }
};

const generateHistoricalData = (basePrice, timeframe) => {
  let points = 24;
  let intervalLabel = 'Hour';
  let volatility = 0.008;

  if (timeframe === '1D') {
    points = 24;
    volatility = 0.006;
  } else if (timeframe === '1W') {
    points = 28;
    volatility = 0.015;
  } else if (timeframe === '1M') {
    points = 30;
    volatility = 0.025;
  } else if (timeframe === '1Y') {
    points = 36;
    volatility = 0.055;
  } else if (timeframe === 'ALL') {
    points = 48;
    volatility = 0.085;
  }

  const data = [];
  let current = basePrice * (1 - volatility * (points / 3));

  for (let i = 0; i < points; i++) {
    const randomDelta = (Math.sin(i * 0.7) + (Math.random() - 0.48)) * volatility * basePrice;
    current = Math.max(current + randomDelta, basePrice * 0.4);
    
    let label = '';
    if (timeframe === '1D') {
      const hr = (9 + Math.floor(i * 0.35)) % 24;
      const min = (i % 2 === 0) ? '00' : '30';
      label = `${hr}:${min}`;
    } else if (timeframe === '1W') {
      label = `Day ${Math.floor(i / 4) + 1}`;
    } else if (timeframe === '1M') {
      label = `D-${30 - i}`;
    } else if (timeframe === '1Y') {
      label = `M${(i % 12) + 1}`;
    } else {
      label = `Q${(i % 16) + 1}`;
    }

    data.push({
      time: label,
      price: Number(current.toFixed(2)),
      benchmark: Number((current * 0.98).toFixed(2))
    });
  }

  // Anchor the final point close to basePrice
  data[data.length - 1].price = Number(basePrice.toFixed(2));
  return data;
};

export default function App() {
  // Authentication state
  const [currentUser, setCurrentUser] = useState(() => storage.get('current_user', null));
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authAccessCode, setAuthAccessCode] = useState('');
  const [authError, setAuthError] = useState('');

  // Active navigation view
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'trade' | 'portfolios' | 'leaderboard'
  
  // Market live quotes
  const [marketQuotes, setMarketQuotes] = useState(() => {
    const saved = storage.get('market_quotes', null);
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    return INITIAL_MARKET_ASSETS;
  });
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState('1M');

  // Multi-portfolio data
  const [portfolios, setPortfolios] = useState(() => {
    return storage.get('portfolios', []);
  });
  const [activePortfolioId, setActivePortfolioId] = useState(() => {
    return storage.get('active_portfolio_id', null);
  });
  const [positions, setPositions] = useState(() => {
    return storage.get('positions', []);
  });
  const [transactions, setTransactions] = useState(() => {
    return storage.get('transactions', []);
  });

  // Trading ticket form
  const [tradeAction, setTradeAction] = useState('BUY'); // 'BUY' | 'SELL'
  const [tradeShares, setTradeShares] = useState('10');
  const [tradeMessage, setTradeMessage] = useState(null); // { type: 'success'|'error', text: '' }

  // Portfolio management modals & controls
  const [isRenamingPortfolio, setIsRenamingPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isPortfolioSwitcherOpen, setIsPortfolioSwitcherOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketQuotes(prev => {
        const updated = prev.map(item => {
          // Generate a natural random fluctuation between -0.35% and +0.35%
          const variance = (Math.random() - 0.495) * 0.007;
          const newPrice = Number((item.basePrice * (1 + variance)).toFixed(2));
          const netChange = Number((newPrice - item.basePrice).toFixed(2));
          const netChangePct = Number((item.change24h + (variance * 100)).toFixed(2));
          
          return {
            ...item,
            basePrice: Math.max(0.01, newPrice),
            change24h: netChangePct,
            high24h: Math.max(item.high24h, newPrice),
            low24h: Math.min(item.low24h, newPrice)
          };
        });
        storage.set('market_quotes', updated);
        return updated;
      });
    }, 3800);

    return () => clearInterval(interval);
  }, []);

  const initializeUserPortfolios = (userId, username) => {
    const existing = storage.get('portfolios', []).filter(p => p.userId === userId);
    if (existing.length === 3) {
      setPortfolios(storage.get('portfolios', []));
      setActivePortfolioId(existing[0].id);
      storage.set('active_portfolio_id', existing[0].id);
      return;
    }

    const createdPortfolios = DEFAULT_PORTFOLIO_NAMES.map((name, index) => ({
      id: `port_${userId}_${index + 1}`,
      userId: userId,
      name: name,
      cashBalance: 1000000.00,
      createdAt: new Date().toISOString()
    }));

    const allPortfolios = [...storage.get('portfolios', []).filter(p => p.userId !== userId), ...createdPortfolios];
    storage.set('portfolios', allPortfolios);
    setPortfolios(allPortfolios);
    setActivePortfolioId(createdPortfolios[0].id);
    storage.set('active_portfolio_id', createdPortfolios[0].id);
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError('');

    const cleanUsername = authUsername.trim();
    const cleanCode = authAccessCode.trim();

    if (!cleanUsername || !cleanCode) {
      setAuthError('Institutional ID and access code are required.');
      return;
    }

    const users = storage.get('users', []);
    
    if (authTab === 'login') {
      const found = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
      if (!found || found.accessCode !== cleanCode) {
        setAuthError('Invalid credentials. Check your Trader ID or Access Code.');
        return;
      }
      setCurrentUser(found);
      storage.set('current_user', found);
      initializeUserPortfolios(found.id, found.username);
    } else {
      const exists = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
      if (exists) {
        setAuthError('Trader ID already registered. Please choose another username or sign in.');
        return;
      }
      const newUser = {
        id: `usr_${Date.now()}`,
        username: cleanUsername,
        accessCode: cleanCode,
        createdAt: new Date().toISOString()
      };
      const updatedUsers = [...users, newUser];
      storage.set('users', updatedUsers);
      setCurrentUser(newUser);
      storage.set('current_user', newUser);
      initializeUserPortfolios(newUser.id, newUser.username);
    }

    setAuthUsername('');
    setAuthAccessCode('');
  };

  const handleQuickDemoLogin = () => {
    const demoUser = {
      id: 'usr_institutional_demo',
      username: 'Apex_Principal',
      accessCode: 'demo2026',
      createdAt: new Date().toISOString()
    };
    setCurrentUser(demoUser);
    storage.set('current_user', demoUser);
    initializeUserPortfolios(demoUser.id, demoUser.username);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    storage.set('current_user', null);
    storage.set('active_portfolio_id', null);
    setActivePortfolioId(null);
  };

  const userPortfolios = useMemo(() => {
    if (!currentUser) return [];
    return portfolios.filter(p => p.userId === currentUser.id);
  }, [portfolios, currentUser]);

  const activePortfolio = useMemo(() => {
    if (!userPortfolios.length) return null;
    return userPortfolios.find(p => p.id === activePortfolioId) || userPortfolios[0];
  }, [userPortfolios, activePortfolioId]);

  const activePositions = useMemo(() => {
    if (!activePortfolio) return [];
    return positions.filter(pos => pos.portfolioId === activePortfolio.id && pos.shares > 0);
  }, [positions, activePortfolio]);

  const activeTransactions = useMemo(() => {
    if (!activePortfolio) return [];
    return transactions.filter(tx => tx.portfolioId === activePortfolio.id);
  }, [transactions, activePortfolio]);

  // Map of quotes by symbol for fast lookups
  const quoteMap = useMemo(() => {
    const map = {};
    marketQuotes.forEach(q => {
      map[q.symbol] = q;
    });
    return map;
  }, [marketQuotes]);

  // Holdings enriched with live market pricing
  const enrichedHoldings = useMemo(() => {
    return activePositions.map(pos => {
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
  }, [activePositions, quoteMap]);

  // Summary financials
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
    
    // Approximate 24h day return on total equity
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

  // Donut chart allocation breakdown
  const allocationData = useMemo(() => {
    const data = [
      { name: 'Cash Reserves', value: portfolioSummary.cash, color: '#64748B' }
    ];

    const categoryColors = {
      'Equity': '#2563EB',
      'ETF': '#0284C7',
      'Crypto': '#D97706',
      'Other': '#8B5CF6'
    };

    enrichedHoldings.forEach((h, idx) => {
      const quote = quoteMap[h.symbol];
      const category = quote ? quote.category : 'Other';
      const color = categoryColors[category] || '#3B82F6';
      
      data.push({
        name: h.symbol,
        value: h.marketValue,
        color: color
      });
    });

    return data.filter(d => d.value > 0);
  }, [portfolioSummary.cash, enrichedHoldings, quoteMap]);

  const selectedQuote = useMemo(() => {
    return marketQuotes.find(q => q.symbol === selectedSymbol) || marketQuotes[0];
  }, [marketQuotes, selectedSymbol]);

  const historicalChartData = useMemo(() => {
    return generateHistoricalData(selectedQuote.basePrice, timeframe);
  }, [selectedQuote.basePrice, timeframe]);

  const handleExecuteOrder = (e) => {
    e.preventDefault();
    setTradeMessage(null);

    const qty = parseFloat(tradeShares);
    if (isNaN(qty) || qty <= 0) {
      setTradeMessage({ type: 'error', text: 'Enter a valid positive number of shares.' });
      return;
    }

    if (!activePortfolio) {
      setTradeMessage({ type: 'error', text: 'No active portfolio selected.' });
      return;
    }

    const currentPrice = selectedQuote.basePrice;
    const totalOrderCost = qty * currentPrice;

    if (tradeAction === 'BUY') {
      if (activePortfolio.cashBalance < totalOrderCost) {
        setTradeMessage({
          type: 'error',
          text: `Insufficient cash reserves. Order requires $${totalOrderCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
        });
        return;
      }

      // Deduct cash from portfolio
      const updatedPortfolios = portfolios.map(p => {
        if (p.id === activePortfolio.id) {
          return { ...p, cashBalance: p.cashBalance - totalOrderCost };
        }
        return p;
      });
      setPortfolios(updatedPortfolios);
      storage.set('portfolios', updatedPortfolios);

      // Update positions with weighted average cost basis
      const existingPos = positions.find(pos => pos.portfolioId === activePortfolio.id && pos.symbol === selectedSymbol);
      let updatedPositions;

      if (existingPos) {
        const newShares = existingPos.shares + qty;
        const newAvg = ((existingPos.shares * existingPos.averageBuyPrice) + (qty * currentPrice)) / newShares;
        updatedPositions = positions.map(pos => {
          if (pos.id === existingPos.id) {
            return {
              ...pos,
              shares: newShares,
              averageBuyPrice: newAvg,
              updatedAt: new Date().toISOString()
            };
          }
          return pos;
        });
      } else {
        const newPos = {
          id: `pos_${Date.now()}`,
          portfolioId: activePortfolio.id,
          symbol: selectedSymbol,
          shares: qty,
          averageBuyPrice: currentPrice,
          updatedAt: new Date().toISOString()
        };
        updatedPositions = [...positions, newPos];
      }
      setPositions(updatedPositions);
      storage.set('positions', updatedPositions);

      // Append immutable transaction
      const newTx = {
        id: `tx_${Date.now()}`,
        portfolioId: activePortfolio.id,
        symbol: selectedSymbol,
        type: 'BUY',
        shares: qty,
        price: currentPrice,
        totalValue: totalOrderCost,
        realizedPnL: 0,
        timestamp: new Date().toISOString()
      };
      const updatedTx = [newTx, ...transactions];
      setTransactions(updatedTx);
      storage.set('transactions', updatedTx);

      setTradeMessage({
        type: 'success',
        text: `Executed BUY for ${qty} shares of ${selectedSymbol} at $${currentPrice.toFixed(2)}.`
      });
    } else {
      // SELL ORDER
      const existingPos = positions.find(pos => pos.portfolioId === activePortfolio.id && pos.symbol === selectedSymbol);
      if (!existingPos || existingPos.shares < qty) {
        const available = existingPos ? existingPos.shares : 0;
        setTradeMessage({
          type: 'error',
          text: `Insufficient position holdings. You own ${available} shares of ${selectedSymbol}.`
        });
        return;
      }

      const totalProceeds = qty * currentPrice;
      const costOfSoldShares = qty * existingPos.averageBuyPrice;
      const realizedProfit = totalProceeds - costOfSoldShares;

      // Credit cash
      const updatedPortfolios = portfolios.map(p => {
        if (p.id === activePortfolio.id) {
          return { ...p, cashBalance: p.cashBalance + totalProceeds };
        }
        return p;
      });
      setPortfolios(updatedPortfolios);
      storage.set('portfolios', updatedPortfolios);

      // Decrement shares
      const remainingShares = existingPos.shares - qty;
      let updatedPositions;
      if (remainingShares <= 0.00001) {
        updatedPositions = positions.filter(pos => pos.id !== existingPos.id);
      } else {
        updatedPositions = positions.map(pos => {
          if (pos.id === existingPos.id) {
            return {
              ...pos,
              shares: remainingShares,
              updatedAt: new Date().toISOString()
            };
          }
          return pos;
        });
      }
      setPositions(updatedPositions);
      storage.set('positions', updatedPositions);

      // Record transaction
      const newTx = {
        id: `tx_${Date.now()}`,
        portfolioId: activePortfolio.id,
        symbol: selectedSymbol,
        type: 'SELL',
        shares: qty,
        price: currentPrice,
        totalValue: totalProceeds,
        realizedPnL: realizedProfit,
        timestamp: new Date().toISOString()
      };
      const updatedTx = [newTx, ...transactions];
      setTransactions(updatedTx);
      storage.set('transactions', updatedTx);

      setTradeMessage({
        type: 'success',
        text: `Executed SELL for ${qty} shares of ${selectedSymbol} at $${currentPrice.toFixed(2)} (Realized: ${realizedProfit >= 0 ? '+' : ''}$${realizedProfit.toFixed(2)}).`
      });
    }
  };

  const handleRenamePortfolio = (e) => {
    e.preventDefault();
    if (!newPortfolioName.trim() || !activePortfolio) return;

    const updated = portfolios.map(p => {
      if (p.id === activePortfolio.id) {
        return { ...p, name: newPortfolioName.trim() };
      }
      return p;
    });
    setPortfolios(updated);
    storage.set('portfolios', updated);
    setIsRenamingPortfolio(false);
  };

  const handleResetPortfolio = () => {
    if (!activePortfolio) return;

    // Reset balance to exactly 1,000,000.00
    const updatedPortfolios = portfolios.map(p => {
      if (p.id === activePortfolio.id) {
        return { ...p, cashBalance: 1000000.00 };
      }
      return p;
    });

    // Liquidate all positions for this portfolio
    const updatedPositions = positions.filter(pos => pos.portfolioId !== activePortfolio.id);

    // Append reset transaction marker
    const resetTx = {
      id: `tx_${Date.now()}`,
      portfolioId: activePortfolio.id,
      symbol: 'PORTFOLIO_RESET',
      type: 'RESET',
      shares: 0,
      price: 0,
      totalValue: 1000000.00,
      realizedPnL: 0,
      timestamp: new Date().toISOString()
    };

    setPortfolios(updatedPortfolios);
    setPositions(updatedPositions);
    setTransactions([resetTx, ...transactions]);

    storage.set('portfolios', updatedPortfolios);
    storage.set('positions', updatedPositions);
    storage.set('transactions', [resetTx, ...transactions]);

    setShowResetConfirmModal(false);
  };

  const leaderboardData = useMemo(() => {
    // 1. Calculate live net worth for all user portfolios currently stored
    const userRankings = [];
    const allUsers = storage.get('users', []);
    const allPositions = storage.get('positions', []);

    portfolios.forEach(p => {
      const user = allUsers.find(u => u.id === p.userId) || (currentUser && currentUser.id === p.userId ? currentUser : { username: 'Trader' });
      const pPositions = allPositions.filter(pos => pos.portfolioId === p.id && pos.shares > 0);
      const holdingsValue = pPositions.reduce((acc, pos) => {
        const q = quoteMap[pos.symbol];
        return acc + (pos.shares * (q ? q.basePrice : pos.averageBuyPrice));
      }, 0);

      const netWorth = p.cashBalance + holdingsValue;
      const roi = ((netWorth - 1000000) / 1000000) * 100;

      userRankings.push({
        id: p.id,
        username: user.username,
        portfolioName: p.name,
        totalEquity: netWorth,
        roi: Number(roi.toFixed(2)),
        positionsCount: pPositions.length,
        lastActive: 'Active Now',
        isCurrentUser: currentUser ? p.userId === currentUser.id : false
      });
    });

    // Combine with institutional pre-seeded participants
    const combined = [...userRankings, ...PRE_SEEDED_LEADERBOARD];

    // Sort descending by total equity
    return combined.sort((a, b) => b.totalEquity - a.totalEquity);
  }, [portfolios, positions, quoteMap, currentUser]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return marketQuotes;
    const q = searchQuery.toLowerCase();
    return marketQuotes.filter(item => 
      item.symbol.toLowerCase().includes(q) || 
      item.name.toLowerCase().includes(q)
    );
  }, [marketQuotes, searchQuery]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] text-[#0F172A] flex flex-col justify-between font-sans antialiased selection:bg-slate-200">
        <header className="border-b border-[#E2E8F0] bg-white/80 backdrop-blur px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-[#0F172A] flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider">
                A
              </div>
              <span className="font-semibold text-lg tracking-tight text-[#0F172A]">AURA Portfolio Desk</span>
              <span className="hidden sm:inline-block text-[11px] font-mono uppercase tracking-widest text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E2E8F0]">
                Institutional Terminal v4.2
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-[#64748B] font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>FEED STATUS: NOMINAL</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-8">
            <div className="mb-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] mb-3 text-[#0F172A]">
                <Building2 className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h1 className="text-xl font-semibold text-[#0F172A]">Terminal Authentication</h1>
              <p className="text-xs text-[#64748B] mt-1">
                Access your paper trading desk and multi-portfolio environment.
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

            <form onSubmit={handleAuthSubmit} className="space-x-0 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5 uppercase tracking-wider font-mono">
                  Trader Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="e.g., JaneStreet_Desk"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] font-sans"
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
                    value={authAccessCode}
                    onChange={(e) => setAuthAccessCode(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] font-mono"
                  />
                  <Lock className="absolute right-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
                </div>
                <p className="text-[11px] text-[#64748B] mt-1.5">
                  No email or external verification required. Local terminal encryption.
                </p>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2.5 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-md text-sm font-medium tracking-wide transition-colors flex items-center justify-center space-x-2 shadow-sm"
              >
                <span>{authTab === 'login' ? 'Authenticate Session' : 'Register Trader Profile'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#E2E8F0] text-center">
              <button
                type="button"
                onClick={handleQuickDemoLogin}
                className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium inline-flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Instant Sandbox Access (Demo Principal Account)</span>
              </button>
            </div>
          </div>
        </main>

        <footer className="border-t border-[#E2E8F0] bg-white py-4 px-6 text-center text-xs text-[#64748B] font-mono">
          Simulated paper trading platform. Market feeds integrated via Yahoo Finance with CORS-resilient fallback engine. All balances are simulated currency.
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBF9] text-[#0F172A] flex flex-col font-sans antialiased selection:bg-slate-200">
      {/* Institutional Top Navigation Bar */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Brand and Active Portfolio Quick Switcher */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded bg-[#0F172A] flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider shadow-sm">
                  A
                </div>
                <span className="font-bold text-base tracking-tight text-[#0F172A]">AURA</span>
              </div>

              <div className="h-5 w-[1px] bg-[#E2E8F0] hidden sm:block"></div>

              {/* Quick Switcher Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsPortfolioSwitcherOpen(!isPortfolioSwitcherOpen)}
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] transition-colors"
                >
                  <Briefcase className="w-3.5 h-3.5 text-[#64748B]" />
                  <div className="text-left flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                    <span className="font-semibold truncate max-w-[140px]">{activePortfolio ? activePortfolio.name : 'Select Portfolio'}</span>
                    <span className="font-mono text-[#059669] font-medium hidden sm:inline">
                      ${portfolioSummary.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
                </button>

                {isPortfolioSwitcherOpen && (
                  <div className="absolute left-0 mt-2 w-72 bg-white border border-[#E2E8F0] rounded-lg shadow-xl py-1 z-50">
                    <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-[#64748B] font-mono border-b border-[#E2E8F0]">
                      Switch Fantasy Portfolio (Max 3)
                    </div>
                    {userPortfolios.map((p) => {
                      const isSelected = p.id === activePortfolio?.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActivePortfolioId(p.id);
                            storage.set('active_portfolio_id', p.id);
                            setIsPortfolioSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs hover:bg-[#F8FAFC] transition-colors ${isSelected ? 'bg-blue-50/50 text-[#2563EB] font-semibold' : 'text-[#0F172A]'}`}
                        >
                          <div className="truncate pr-2">
                            <div className="truncate">{p.name}</div>
                            <div className="font-mono text-[11px] text-[#64748B] font-normal">
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
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-[#F1F5F9] text-[#0F172A] font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('trade')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'trade' ? 'bg-[#F1F5F9] text-[#0F172A] font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                Trade / Markets
              </button>
              <button
                onClick={() => setActiveTab('portfolios')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'portfolios' ? 'bg-[#F1F5F9] text-[#0F172A] font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                Portfolios
              </button>
              <button
                onClick={() => setActiveTab('leaderboard')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === 'leaderboard' ? 'bg-[#F1F5F9] text-[#0F172A] font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                Leaderboard
              </button>
            </div>

            {/* User Session Controls */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1.5 rounded-md">
                <User className="w-3.5 h-3.5 text-[#64748B]" />
                <span className="font-mono font-medium text-[#334155]">{currentUser.username}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Disconnect Session"
                className="p-1.5 rounded-md text-[#64748B] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="md:hidden flex border-t border-[#E2E8F0] bg-[#F8FAFC] px-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-2.5 text-center text-xs font-medium whitespace-nowrap px-2 ${activeTab === 'dashboard' ? 'text-[#2563EB] border-b-2 border-[#2563EB] font-semibold' : 'text-[#64748B]'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('trade')}
            className={`flex-1 py-2.5 text-center text-xs font-medium whitespace-nowrap px-2 ${activeTab === 'trade' ? 'text-[#2563EB] border-b-2 border-[#2563EB] font-semibold' : 'text-[#64748B]'}`}
          >
            Trade / Markets
          </button>
          <button
            onClick={() => setActiveTab('portfolios')}
            className={`flex-1 py-2.5 text-center text-xs font-medium whitespace-nowrap px-2 ${activeTab === 'portfolios' ? 'text-[#2563EB] border-b-2 border-[#2563EB] font-semibold' : 'text-[#64748B]'}`}
          >
            Portfolios
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-2.5 text-center text-xs font-medium whitespace-nowrap px-2 ${activeTab === 'leaderboard' ? 'text-[#2563EB] border-b-2 border-[#2563EB] font-semibold' : 'text-[#64748B]'}`}
          >
            Leaderboard
          </button>
        </div>
      </nav>

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* ========================================================================= */}
        {/* VIEW 1: DASHBOARD VIEW                                                   */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Metrics Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Portfolio Equity */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">Total Portfolio Equity</span>
                  <DollarSign className="w-4 h-4 text-[#64748B]" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold font-mono text-[#0F172A] tracking-tight">
                    ${portfolioSummary.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-[#64748B] mt-1 flex items-center space-x-1">
                    <span>Cash + Market Value of Holdings</span>
                  </div>
                </div>
              </div>

              {/* Available Cash Reserves */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">Cash Reserves</span>
                  <Briefcase className="w-4 h-4 text-[#64748B]" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold font-mono text-[#0F172A] tracking-tight">
                    ${portfolioSummary.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Settled Buying Power
                  </div>
                </div>
              </div>

              {/* Unrealized Gain / Loss */}
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
                    {portfolioSummary.unrealizedPnLPct >= 0 ? '+' : ''}{portfolioSummary.unrealizedPnLPct.toFixed(2)}% ROI on holdings
                  </div>
                </div>
              </div>

              {/* 24-Hour Return */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">24-Hour Return</span>
                  <Clock className="w-4 h-4 text-[#64748B]" />
                </div>
                <div className="mt-3">
                  <div className={`text-2xl font-bold font-mono tracking-tight ${portfolioSummary.dayReturnPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {portfolioSummary.dayReturnPct >= 0 ? '+' : ''}{portfolioSummary.dayReturnPct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Weighted portfolio volatility
                  </div>
                </div>
              </div>
            </div>

            {/* Asset Allocation & Strategic Exposure */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Donut Chart Component */}
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
                          formatter={(value) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          contentStyle={{ backgroundColor: '#0F172A', color: '#FFFFFF', borderRadius: '6px', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Legend list */}
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

              {/* Portfolio Performance Summary & Quick Stats */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Portfolio Performance & Exposure</h2>
                      <p className="text-xs text-[#64748B] mt-0.5">Real-time aggregate valuation of currently active positions.</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('trade')}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-[#0F172A] text-white hover:bg-[#1E293B] flex items-center space-x-1.5 transition-colors"
                    >
                      <span>New Trade Order</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                      <div className="text-[11px] text-[#64748B] uppercase font-mono">Invested Capital</div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] mt-1">
                        ${portfolioSummary.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                      <div className="text-[11px] text-[#64748B] uppercase font-mono">Active Holdings</div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] mt-1">
                        {enrichedHoldings.length} Assets
                      </div>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg col-span-2 sm:col-span-1">
                      <div className="text-[11px] text-[#64748B] uppercase font-mono">Cost Basis</div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] mt-1">
                        ${enrichedHoldings.reduce((sum, h) => sum + h.totalCostBasis, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-[#E2E8F0] text-xs text-[#475569] flex items-start space-x-3">
                  <Info className="w-4 h-4 text-[#2563EB] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#0F172A]">Execution Policy:</span> Instant settlement paper trades reflect live institutional pricing with zero slippage. Unrealized P&L is updated dynamically every 3.8 seconds based on market micro-variance.
                  </div>
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Open Portfolio Holdings</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">Mark-to-market live positions for {activePortfolio?.name}</p>
                </div>
                <div className="text-xs font-mono text-[#64748B]">
                  {enrichedHoldings.length} Active Positions
                </div>
              </div>

              {enrichedHoldings.length === 0 ? (
                <div className="py-16 text-center">
                  <Layers className="w-8 h-8 text-[#94A3B8] mx-auto mb-2 stroke-[1.5]" />
                  <p className="text-sm font-medium text-[#475569]">No open positions in this portfolio.</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Deploy cash reserves into liquid equities, ETFs, or cryptocurrencies.</p>
                  <button
                    onClick={() => setActiveTab('trade')}
                    className="mt-4 px-4 py-2 bg-[#0F172A] text-white text-xs font-medium rounded-md hover:bg-[#1E293B] transition-colors"
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
                        <th className="py-3 px-4 text-right">Shares Held</th>
                        <th className="py-3 px-4 text-right">Weighted Cost Basis</th>
                        <th className="py-3 px-4 text-right">Current Price</th>
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
                            <td className="py-3.5 px-4 text-right font-bold text-[#0F172A]">${holding.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                                className="px-2.5 py-1 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-[11px] font-sans font-medium transition-colors"
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
        {/* VIEW 2: TRADE / MARKETS VIEW                                              */}
        {/* ========================================================================= */}
        {activeTab === 'trade' && (
          <div className="space-y-6">
            
            {/* Asset Autocomplete and Search Bar */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search liquid tickers or asset names (e.g. AAPL, NVDA, SPY, BTC-USD)..."
                  className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
                />
              </div>

              {/* Quick asset chips */}
              <div className="flex items-center space-x-2 mt-3 overflow-x-auto pb-1 text-xs">
                <span className="text-[#64748B] font-mono text-[11px] uppercase mr-1">Liquid Feed:</span>
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

            {/* Trading Terminal Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Asset Details & Historical Area Chart */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Asset Header Banner */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl font-bold font-mono text-[#0F172A]">{selectedQuote.symbol}</span>
                        <span className="text-sm text-[#475569] font-medium">{selectedQuote.name}</span>
                        <span className="text-[10px] font-mono uppercase bg-slate-100 text-[#475569] px-2 py-0.5 rounded border border-slate-200">
                          {selectedQuote.category}
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
                        <div>24H HIGH: <span className="font-semibold text-[#0F172A]">${selectedQuote.high24h.toFixed(2)}</span></div>
                        <div>24H LOW: <span className="font-semibold text-[#0F172A]">${selectedQuote.low24h.toFixed(2)}</span></div>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg text-right">
                        <div>VOLUME: <span className="font-semibold text-[#0F172A]">{selectedQuote.volume}</span></div>
                        <div className="text-emerald-600 flex items-center justify-end">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                          MARKET OPEN
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Timeframe Selector */}
                  <div className="flex items-center justify-between border-t border-[#E2E8F0] mt-6 pt-4">
                    <div className="text-xs font-mono uppercase text-[#64748B]">Execution Chart</div>
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

                  {/* Recharts Area Chart */}
                  <div className="h-72 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historicalChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                          formatter={(val) => [`$${val}`, 'Execution Quote']}
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
                  </div>
                </div>

                {/* Market Feed Disclaimer */}
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg text-xs text-[#64748B] flex items-center justify-between font-mono">
                  <span>PRICE ROUTER: PRIMARY YAHOO FEED + AUTONOMOUS SYNTHETIC DRIFT</span>
                  <span className="text-emerald-600 font-semibold">SYNCHRONIZED</span>
                </div>
              </div>

              {/* Right Column: Order Execution Card */}
              <div className="lg:col-span-1">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm sticky top-20">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Order Ticket</h3>
                    <span className="text-[11px] font-mono text-[#64748B]">ZERO SLIPPAGE</span>
                  </div>

                  {/* Buy / Sell Segmented Control */}
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

                  {/* Execution Feedback Notification */}
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
                    {/* Share Quantity Input */}
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
                        value={tradeShares}
                        onChange={(e) => setTradeShares(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm font-mono text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
                      />
                    </div>

                    {/* Quick Percentage Buttons */}
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
                          className="py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#475569] rounded transition-colors"
                        >
                          {pct}
                        </button>
                      ))}
                    </div>

                    {/* Financial Summary Calculation Card */}
                    <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-[#64748B]">
                        <span>Price per Share</span>
                        <span className="text-[#0F172A] font-semibold">${selectedQuote.basePrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[#64748B]">
                        <span>Estimated Total</span>
                        <span className="text-[#0F172A] font-bold">
                          ${((parseFloat(tradeShares) || 0) * selectedQuote.basePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="border-t border-[#E2E8F0] pt-2 flex justify-between text-[#64748B]">
                        <span>Available Cash</span>
                        <span className="text-[#059669] font-semibold">
                          ${activePortfolio ? activePortfolio.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                        </span>
                      </div>
                    </div>

                    {/* Submit CTA */}
                    <button
                      type="submit"
                      className={`w-full py-3 px-4 rounded-md text-sm font-semibold tracking-wide text-white transition-all shadow-sm ${tradeAction === 'BUY' ? 'bg-[#16A34A] hover:bg-[#15803D]' : 'bg-[#DC2626] hover:bg-[#B91C1C]'}`}
                    >
                      {tradeAction === 'BUY' ? `Execute Buy Order (${selectedSymbol})` : `Execute Sell Order (${selectedSymbol})`}
                    </button>
                  </form>

                  <div className="mt-4 text-center">
                    <p className="text-[11px] text-[#64748B]">
                      Orders execute immediately at quoted market price with zero slippage.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: PORTFOLIOS VIEW                                                   */}
        {/* ========================================================================= */}
        {activeTab === 'portfolios' && (
          <div className="space-y-6">
            
            {/* 3-Portfolio Selector Tabs Header */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex space-x-2 overflow-x-auto">
                {userPortfolios.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActivePortfolioId(p.id);
                      storage.set('active_portfolio_id', p.id);
                      setIsRenamingPortfolio(false);
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs font-mono transition-all flex items-center space-x-2 flex-shrink-0 ${p.id === activePortfolio?.id ? 'bg-[#0F172A] text-white font-bold shadow-sm' : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] border border-[#E2E8F0]'}`}
                  >
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>

              {/* Portfolio Actions: Rename & Reset */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewPortfolioName(activePortfolio?.name || '');
                    setIsRenamingPortfolio(!isRenamingPortfolio);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#475569] flex items-center space-x-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Rename</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center space-x-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Portfolio</span>
                </button>
              </div>
            </div>

            {/* Inline Rename Form */}
            {isRenamingPortfolio && (
              <form onSubmit={handleRenamePortfolio} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex items-center space-x-3">
                <input
                  type="text"
                  required
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-md text-sm text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  placeholder="Enter custom portfolio designation..."
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F172A] text-white text-xs font-medium rounded-md hover:bg-[#1E293B]"
                >
                  Save Title
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenamingPortfolio(false)}
                  className="px-3 py-2 text-xs text-[#64748B] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
              </form>
            )}

            {/* Detailed Portfolio Breakdown Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="text-xs uppercase font-mono text-[#64748B]">Active Account Valuation</div>
                <div className="text-2xl font-bold font-mono text-[#0F172A] mt-2">
                  ${portfolioSummary.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-[#64748B] mt-1 font-mono">
                  Baseline: $1,000,000.00
                </div>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="text-xs uppercase font-mono text-[#64748B]">Settled Cash Reserves</div>
                <div className="text-2xl font-bold font-mono text-[#0F172A] mt-2">
                  ${portfolioSummary.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-[#64748B] mt-1 font-mono">
                  Available for immediate allocation
                </div>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
                <div className="text-xs uppercase font-mono text-[#64748B]">Net Cumulative ROI</div>
                <div className={`text-2xl font-bold font-mono mt-2 ${portfolioSummary.totalEquity >= 1000000 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {(((portfolioSummary.totalEquity - 1000000) / 1000000) * 100).toFixed(2)}%
                </div>
                <div className="text-xs text-[#64748B] mt-1 font-mono">
                  Fantasy currency performance
                </div>
              </div>
            </div>

            {/* Transaction Ledger Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0F172A] font-mono">Transaction Ledger</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">Immutable audit trail of all executed market orders</p>
                </div>
                <span className="text-xs font-mono text-[#64748B]">{activeTransactions.length} Logged Entries</span>
              </div>

              {activeTransactions.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#64748B]">
                  No historical trades logged for this portfolio.
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
                        <th className="py-3 px-4 text-right">Quantity</th>
                        <th className="py-3 px-4 text-right">Execution Price</th>
                        <th className="py-3 px-4 text-right">Total Consideration</th>
                        <th className="py-3 px-4 text-right">Realized P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {activeTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-[#F8FAFC] transition-colors">
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
        {/* VIEW 4: LEADERBOARD VIEW                                                  */}
        {/* ========================================================================= */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <h2 className="text-base font-bold text-[#0F172A] tracking-tight">Global Institutional Leaderboard</h2>
                  </div>
                  <p className="text-xs text-[#64748B] mt-1">
                    All paper trading participants ranked in real-time by total mark-to-market equity and ROI relative to the $1,000,000 baseline.
                  </p>
                </div>
                <div className="flex items-center space-x-2 font-mono text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-md">
                  <span>SORT: MARK-TO-MARKET NET WORTH (DESC)</span>
                </div>
              </div>
            </div>

            {/* Leaderboard Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-16 text-center">Rank</th>
                      <th className="py-3.5 px-4">Trader ID</th>
                      <th className="py-3.5 px-4">Portfolio Designation</th>
                      <th className="py-3.5 px-4 text-right">Total Equity</th>
                      <th className="py-3.5 px-4 text-right">ROI (%)</th>
                      <th className="py-3.5 px-4 text-right">Open Assets</th>
                      <th className="py-3.5 px-4 text-right">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {leaderboardData.map((entry, idx) => {
                      const rank = idx + 1;
                      const isTop3 = rank <= 3;
                      const isUser = entry.isCurrentUser;
                      return (
                        <tr
                          key={entry.id}
                          className={`hover:bg-[#F8FAFC] transition-colors ${isUser ? 'bg-blue-50/40 font-medium' : ''}`}
                        >
                          <td className="py-4 px-4 text-center">
                            {rank === 1 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold">1</span>}
                            {rank === 2 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold">2</span>}
                            {rank === 3 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-900 font-bold">3</span>}
                            {rank > 3 && <span className="text-[#64748B]">#{rank}</span>}
                          </td>
                          <td className="py-4 px-4 font-bold text-[#0F172A] flex items-center space-x-2">
                            <span>{entry.username}</span>
                            {isUser && (
                              <span className="text-[10px] bg-[#2563EB] text-white px-1.5 py-0.5 rounded font-sans">
                                YOU
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4 font-sans text-[#475569]">{entry.portfolioName}</td>
                          <td className="py-4 px-4 text-right font-bold text-[#0F172A]">
                            ${entry.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-4 px-4 text-right font-semibold ${entry.roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {entry.roi >= 0 ? '+' : ''}{entry.roi.toFixed(2)}%
                          </td>
                          <td className="py-4 px-4 text-right text-[#64748B]">{entry.positionsCount}</td>
                          <td className="py-4 px-4 text-right text-[#94A3B8]">{entry.lastActive}</td>
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

      {/* ========================================================================= */}
      {/* CONFIRMATION MODAL: PORTFOLIO RESET                                       */}
      {/* ========================================================================= */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-[#0F172A]">Liquidate and Reset Portfolio?</h3>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Resetting will immediately liquidate all active positions in <span className="font-semibold text-[#0F172A]">{activePortfolio?.name}</span> and restore your available cash reserves to exactly <span className="font-mono font-semibold text-[#0F172A]">$1,000,000.00</span>.
            </p>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-[11px] text-rose-800 font-mono">
              NOTICE: This simulated transaction is irreversible.
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 rounded-md border border-[#E2E8F0] text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPortfolio}
                className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors shadow-sm"
              >
                Confirm Liquidation & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Institutional Desk Global Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white py-6 px-4 sm:px-6 lg:px-8 text-xs text-[#64748B] font-mono mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            Simulated paper trading platform. Market feeds integrated via Yahoo Finance. All portfolio balances are fantasy currency.
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>SYSTEM LATENCY: 12ms</span>
            <span>DATA RESILIENCE: ACTIVE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
