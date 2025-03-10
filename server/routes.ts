import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";

if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 200; // 0.2 second between requests
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory tracking of known stocks and new listings
const stockCache = new Map<string, { 
  data: any; 
  timestamp: number;
  analystRating?: number;
  isNewListing?: boolean;
}>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

function generateAnalystRating(): number {
  return Math.floor(Math.random() * 20) + 80; // Generate rating between 80-99
}

async function finnhubRequest(endpoint: string, retryCount = 0): Promise<any> {
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
    // Check cache first
    const cacheKey = `stock_${symbol}`;
    const cached = stockCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

    const [quote, profile] = await Promise.all([
      finnhubRequest(`/quote?symbol=${symbol}`),
      finnhubRequest(`/stock/profile2?symbol=${symbol}`)
    ]);

    if (!quote || !profile) {
      return null;
    }

    // Generate a consistent analyst rating for this stock
    const analystRating = cached?.analystRating || generateAnalystRating();

    const stockData = {
      symbol,
      name: profile.name || symbol,
      price: quote.c || 0,
      change: quote.d || 0,
      changePercent: quote.dp || 0,
      volume: Math.max(quote.v || 0, 0),
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
      beta: profile.beta || 0,
      exchange: profile.exchange || 'Unknown',
      industry: profile.finnhubIndustry || 'Unknown',
      analystRating,
      lastUpdate: new Date().toISOString(),
      isNewListing: cached?.isNewListing || false
    };

    if (stockData.price > 0) {
      stockCache.set(cacheKey, {
        data: stockData,
        timestamp: Date.now(),
        analystRating,
        isNewListing: cached?.isNewListing || false
      });
      log(`Cached data for ${symbol}`, 'cache');
    }

    return stockData;
  } catch (error) {
    log(`Error fetching ${symbol}: ${error}`, 'error');
    return null;
  }
}

async function checkNewListings(): Promise<void> {
  try {
    const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
    if (!symbolsData) return;

    const currentDate = new Date();
    const newListings = symbolsData.filter((stock: any) => {
      const symbol = stock.symbol;
      const cacheKey = `stock_${symbol}`;
      const cached = stockCache.get(cacheKey);

      // If not in cache and is a new stock, mark as new listing
      if (!cached && stock.type === 'Common Stock') {
        stockCache.set(cacheKey, {
          data: null,
          timestamp: Date.now(),
          isNewListing: true
        });
        log(`New stock detected: ${symbol}`, 'newListing');
        return true;
      }
      return false;
    });

    if (newListings.length > 0) {
      log(`Found ${newListings.length} new listings`, 'newListing');
      // Process new listings
      for (const stock of newListings) {
        await fetchStockData(stock.symbol);
      }
    }
  } catch (error) {
    log(`Error checking new listings: ${error}`, 'error');
  }
}

// Check for new listings every hour
setInterval(checkNewListings, 60 * 60 * 1000);

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

    const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
    if (!symbolsData) {
      throw new Error('Failed to fetch stock symbols');
    }

    const symbols = symbolsData
      .filter((stock: any) => stock.type === 'Common Stock')
      .map((stock: any) => stock.symbol);

    // Filter symbols first if search is provided
    const filteredSymbols = symbols.filter(symbol => 
      !search || symbol.toLowerCase().includes(search)
    );

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, filteredSymbols.length);
    const paginatedSymbols = filteredSymbols.slice(startIndex, endIndex);

    log(`Processing ${paginatedSymbols.length} symbols for page ${page}`, 'search');

    // Process stocks sequentially
    const stocks = [];
    for (const symbol of paginatedSymbols) {
      const stockData = await fetchStockData(symbol);
      if (stockData && stockData.price > 0) {
        if (!showNewOnly || stockData.isNewListing) {
          stocks.push(stockData);
        }
      }
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // Filter out duplicates and apply filters
    const uniqueStocks = stocks.reduce((acc, current) => {
      if (!acc.find(stock => stock.symbol === current.symbol)) {
        acc.push(current);
      }
      return acc;
    }, []);

    const filteredStocks = uniqueStocks
      .filter(stock => !search || 
        stock.symbol.toLowerCase().includes(search) ||
        stock.name.toLowerCase().includes(search)
      )
      .filter(stock => !industry || industry === 'Any' || stock.industry === industry)
      .filter(stock => !exchange || exchange === 'Any' || stock.exchange === exchange)
      .filter(stock => !tradingApp || tradingApp === 'Any' || isStockAvailableOnPlatform(stock.symbol, tradingApp));

    log(`Sending ${filteredStocks.length} unique stocks`, 'search');
    res.json({
      stocks: filteredStocks,
      hasMore: endIndex < filteredSymbols.length,
      total: filteredSymbols.length
    });
  } catch (error) {
    log(`Search failed: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
}

function isStockAvailableOnPlatform(symbol: string, platform: string): boolean {
  return true; // For demo purposes, assume all stocks are available on all platforms
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
  });

  // Start checking for new listings
  checkNewListings();

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
      const response = await finnhubRequest('/stock/symbol?exchange=US');
      if (!response) throw new Error('Failed to fetch SPAC data');

      // Filter for potential SPACs
      const spacSymbols = response
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

      // Fetch detailed data for SPACs
      const spacs = [];
      for (const symbol of spacSymbols) {
        const stockData = await fetchStockData(symbol);
        if (stockData && stockData.price > 0) {
          spacs.push({
            ...stockData,
            status: 'Pre-merger',
            trustValue: Math.floor(Math.random() * 500 + 100) * 1e6,
            targetCompany: null
          });
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