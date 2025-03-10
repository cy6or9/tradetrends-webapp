const INITIAL_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
  'PFE', 'KO', 'PEP', 'DIS', 'NFLX', 'AMD', 'INTC', 'CSCO', 'ORCL', 'IBM'
];

import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import type { Stock } from "@shared/schema";

if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 200; // 0.2 second between requests
const CHECK_NEW_LISTINGS_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

async function finnhubRequest(endpoint: string): Promise<any> {
  const url = `${FINNHUB_API_URL}${endpoint}`;
  const headers = {
    'X-Finnhub-Token': FINNHUB_API_KEY
  };

  try {
    log(`Making request to ${endpoint}`, 'api');
    const response = await fetch(url, { headers });

    if (response.status === 429) {
      log('Rate limit hit, waiting...', 'api');
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * 5));
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    log(`API request failed for ${endpoint}: ${error}`, 'error');
    return null;
  }
}

async function fetchStockData(symbol: string): Promise<any> {
  try {
    const [quote, profile, basic, peers] = await Promise.all([
      finnhubRequest(`/quote?symbol=${symbol}`),
      finnhubRequest(`/stock/profile2?symbol=${symbol}`),
      finnhubRequest(`/stock/metric?symbol=${symbol}&metric=all`),
      finnhubRequest(`/stock/peers?symbol=${symbol}`)
    ]);

    if (!quote || !profile) {
      return null;
    }

    const stockData = {
      symbol,
      name: profile.name || symbol,
      price: quote.c || 0,
      changePercent: quote.dp || 0,
      volume: quote.v || 0,
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
      beta: profile.beta || 0,
      exchange: profile.exchange || 'Unknown',
      industry: profile.finnhubIndustry || 'Unknown',
      sector: profile.sector || null,
      dayHigh: quote.h || 0,
      dayLow: quote.l || 0,
      weekHigh52: basic?.metric['52WeekHigh'] || 0,
      weekLow52: basic?.metric['52WeekLow'] || 0,
      outstandingShares: profile.shareOutstanding || 0,
      float: basic?.metric?.shareFloat || 0,
      peRatio: basic?.metric?.peBasicExclExtraTTM || 0,
      dividendYield: basic?.metric?.dividendYieldIndicatedAnnual || 0,
      afterHoursPrice: quote.ap || quote.c || 0,
      afterHoursChange: quote.ap ? ((quote.ap - quote.c) / quote.c) * 100 : 0,
      isAfterHoursTrading: Boolean(quote.ap && quote.ap !== quote.c),
      industryRank: 0, // Will be calculated in batch
      analystRating: Math.floor(Math.random() * 20) + 80,
      firstListed: new Date(),
      lastUpdate: new Date(),
      nextUpdate: new Date(Date.now() + 5 * 60 * 1000),
      isActive: true,
      cached_data: JSON.stringify({
        peers: peers || [],
        metrics: basic?.metric || {}
      })
    };

    // Store in database if valid price
    if (stockData.price > 0) {
      await storage.upsertStock(stockData);
      log(`Updated data for ${symbol}`, 'storage');
    }

    return stockData;
  } catch (error) {
    log(`Error fetching ${symbol}: ${error}`, 'error');
    return null;
  }
}

async function checkNewListings(): Promise<void> {
  try {
    log('Checking for new listings...', 'newListings');
    const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
    if (!symbolsData) return;

    // Get all active stocks from database
    const activeStocks = await storage.getActiveStocks();
    const knownSymbols = new Set(activeStocks.map(s => s.symbol));

    // Find new listings
    const newListings = symbolsData
      .filter((stock: any) => stock.type === 'Common Stock' && !knownSymbols.has(stock.symbol))
      .map((stock: any) => stock.symbol);

    if (newListings.length > 0) {
      log(`Found ${newListings.length} new listings`, 'newListings');
      // Process new listings
      for (const symbol of newListings) {
        await fetchStockData(symbol);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    log('Finished checking new listings', 'newListings');
  } catch (error) {
    log(`Error checking new listings: ${error}`, 'error');
  }
}

async function searchAndFilterStocks(req: any, res: any) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search?.toLowerCase();
    const tradingApp = req.query.tradingApp;
    const industry = req.query.industry;
    const exchange = req.query.exchange;
    const showNewOnly = req.query.newOnly === 'true';

    log('Starting stock search...', 'search');

    // Get stocks from database
    let stocks = await storage.getActiveStocks();

    // Apply filters
    stocks = stocks.filter(stock =>
      (!search ||
        stock.symbol.toLowerCase().includes(search) ||
        stock.name.toLowerCase().includes(search)
      ) &&
      (!industry || industry === 'Any' || stock.industry === industry) &&
      (!exchange || exchange === 'Any' || stock.exchange === exchange) &&
      (!tradingApp || tradingApp === 'Any' || isStockAvailableOnPlatform(stock.symbol, tradingApp))
    );

    // Handle favorites filter
    if (req.query.isFavorite === 'true') {
      const userFavorites = await storage.getFavorites(req.session?.userId || 0);
      const favoriteStockIds = new Set(userFavorites.map(f => f.stockId));
      stocks = stocks.filter(stock => favoriteStockIds.has(stock.id));
    }

    // Update prices for displayed stocks
    for (const stock of stocks.slice((page - 1) * limit, page * limit)) {
      if (new Date(stock.nextUpdate) <= new Date()) {
        fetchStockData(stock.symbol).catch(console.error); // Update async
      }
    }

    // Calculate pagination
    const total = stocks.length;
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, total);
    const paginatedStocks = stocks.slice(startIndex, endIndex);

    log(`Sending ${paginatedStocks.length} stocks`, 'search');
    res.json({
      stocks: paginatedStocks,
      hasMore: endIndex < total,
      total
    });
  } catch (error) {
    log(`Search failed: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
}

function isStockAvailableOnPlatform(symbol: string, platform: string): boolean {
  return true; // For demo purposes, assume all stocks are available on all platforms
}

async function initializeStocks(): Promise<void> {
  try {
    log('Initializing stock database...', 'init');
    for (const symbol of INITIAL_STOCKS) {
      const stockData = await fetchStockData(symbol);
      if (stockData) {
        await storage.upsertStock({
          ...stockData,
          firstListed: new Date(),
          isActive: true
        });
        log(`Initialized ${symbol}`, 'init');
      }
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
    log('Stock database initialized', 'init');
  } catch (error) {
    log(`Error initializing stocks: ${error}`, 'error');
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false
  });

  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    log('Client connected', 'websocket');
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      log('Client disconnected', 'websocket');
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
    });
  });

  // Initialize database with some stocks if empty
  const stocks = await storage.getActiveStocks();
  if (stocks.length === 0) {
    await initializeStocks();
  }

  // Start checking for new listings
  checkNewListings();
  setInterval(checkNewListings, CHECK_NEW_LISTINGS_INTERVAL);

  // Update stock data periodically
  setInterval(async () => {
    const stocks = await storage.getActiveStocks();
    for (const stock of stocks) {
      if (new Date(stock.nextUpdate) <= new Date()) {
        fetchStockData(stock.symbol).catch(console.error);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // API routes
  app.get("/api/stocks/search", searchAndFilterStocks);

  app.get("/api/finnhub/calendar/ipo", async (_req: any, res: any) => {
    try {
      const data = await finnhubRequest('/calendar/ipo');
      if (!data || !data.ipoCalendar) {
        return res.json([]);
      }

      res.json(data.ipoCalendar);
    } catch (error) {
      log(`IPO calendar error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch IPO calendar' });
    }
  });

  app.get("/api/finnhub/spacs", async (_req: any, res: any) => {
    try {
      const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
      if (!symbolsData) throw new Error('Failed to fetch SPAC data');

      // Filter for potential SPACs
      const spacSymbols = symbolsData
        .filter((stock: any) => {
          const symbol = stock.symbol.toUpperCase();
          const description = (stock.description || '').toUpperCase();
          return (
            symbol.endsWith('U') ||
            symbol.includes('SPAC') ||
            symbol.includes('ACQ') ||
            description.includes('SPAC') ||
            description.includes('ACQUISITION') ||
            description.includes('BLANK CHECK')
          );
        })
        .map((stock: any) => stock.symbol);

      log(`Found ${spacSymbols.length} potential SPACs`, 'spac');

      // Get SPAC data
      const spacs = [];
      for (const symbol of spacSymbols) {
        const stockData = await storage.getStockBySymbol(symbol);
        if (stockData) {
          spacs.push({
            ...stockData,
            status: 'Pre-merger',
            trustValue: Math.floor(Math.random() * 500 + 100) * 1e6,
            targetCompany: null
          });
        } else {
          const newStockData = await fetchStockData(symbol);
          if (newStockData) {
            spacs.push({
              ...newStockData,
              status: 'Pre-merger',
              trustValue: Math.floor(Math.random() * 500 + 100) * 1e6,
              targetCompany: null
            });
          }
        }
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }

      res.json(spacs);
    } catch (error) {
      log(`SPAC list error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch SPAC list' });
    }
  });

  return httpServer;
}