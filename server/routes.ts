import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";

if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 500; // 0.5 second between requests
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;

// In-memory cache with both stock data and analyst ratings
const stockCache = new Map<string, { 
  data: any; 
  timestamp: number;
  analystRating?: number; 
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
      if (retryCount < MAX_RETRIES) {
        return finnhubRequest(endpoint, retryCount + 1);
      }
      throw new Error('Rate limit exceeded after retries');
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    log(`API request failed for ${endpoint}: ${error}`, 'error');
    if (retryCount < MAX_RETRIES) {
      log(`Retrying request (${retryCount + 1}/${MAX_RETRIES})`, 'api');
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      return finnhubRequest(endpoint, retryCount + 1);
    }
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

    // Add delay before API call
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

    // Make API requests with retries
    const [quote, profile] = await Promise.all([
      finnhubRequest(`/quote?symbol=${symbol}`),
      finnhubRequest(`/stock/profile2?symbol=${symbol}`)
    ]);

    if (!quote || !profile) {
      log(`Missing data for ${symbol}`, 'error');
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
      lastUpdate: new Date().toISOString()
    };

    // Cache the data if it has a valid price
    if (stockData.price > 0) {
      stockCache.set(cacheKey, {
        data: stockData,
        timestamp: Date.now(),
        analystRating
      });
      log(`Cached data for ${symbol}`, 'cache');
    }

    return stockData;
  } catch (error) {
    log(`Error fetching ${symbol}: ${error}`, 'error');
    return null;
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

    log('Starting stock search...', 'search');

    // Get stock symbols
    const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
    if (!symbolsData) {
      throw new Error('Failed to fetch stock symbols');
    }

    const symbols = symbolsData
      .filter((stock: any) => stock.type === 'Common Stock')
      .map((stock: any) => stock.symbol);

    log(`Found ${symbols.length} total symbols`, 'search');

    // Filter symbols first if search is provided
    const filteredSymbols = symbols.filter(symbol => 
      !search || symbol.toLowerCase().includes(search)
    );

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, filteredSymbols.length);
    const paginatedSymbols = filteredSymbols.slice(startIndex, endIndex);

    log(`Processing ${paginatedSymbols.length} symbols for page ${page}`, 'search');

    // Process stocks sequentially to avoid rate limits
    const stocks = [];
    for (const symbol of paginatedSymbols) {
      const stockData = await fetchStockData(symbol);
      if (stockData && stockData.price > 0) {
        stocks.push(stockData);
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

async function fetchSpacList(): Promise<any[]> {
  try {
    const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
    if (!symbolsData) {
      throw new Error('Failed to fetch SPAC data');
    }

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
          description.includes('BLANK CHECK') ||
          symbol.match(/[A-Z]{4}U$/)
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

    return spacs;
  } catch (error) {
    log(`Error fetching SPAC list: ${error}`, 'error');
    return [];
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
      const spacs = await fetchSpacList();
      res.json(spacs);
    } catch (error) {
      log(`SPAC list error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch SPAC list' });
    }
  });

  return httpServer;
}