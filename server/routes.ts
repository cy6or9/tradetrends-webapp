import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";

// Initial set of major stocks to ensure we have some working data
const MAJOR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
  'PFE', 'KO', 'PEP', 'DIS', 'NFLX'
];

if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 500; // 0.5 second between requests
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache
const stockCache = new Map<string, { data: any; timestamp: number }>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

async function fetchStockData(symbol: string): Promise<any> {
  try {
    // Check cache first
    const cacheKey = `stock_${symbol}`;
    const cached = stockCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const [quoteResponse, profileResponse] = await Promise.all([
      fetch(`${FINNHUB_API_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`),
      fetch(`${FINNHUB_API_URL}/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    ]);

    if (!quoteResponse.ok || !profileResponse.ok) {
      throw new Error(`Failed to fetch data for ${symbol}`);
    }

    const quote = await quoteResponse.json();
    const profile = await profileResponse.json();

    const stockData = {
      symbol,
      name: profile.name || symbol,
      price: quote.c || 0,
      change: quote.d || 0,
      changePercent: quote.dp || 0,
      volume: quote.v || 0,
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
      beta: profile.beta || 0,
      exchange: profile.exchange || 'Unknown',
      industry: profile.finnhubIndustry || 'Unknown',
      analystRating: Math.floor(Math.random() * 30) + 70, // Placeholder
      lastUpdate: new Date().toISOString()
    };

    // Cache the data
    stockCache.set(cacheKey, {
      data: stockData,
      timestamp: Date.now()
    });

    return stockData;
  } catch (error) {
    log(`Error fetching ${symbol}: ${error}`, 'error');
    return null;
  }
}

async function searchAndFilterStocks(req: any, res: any) {
  try {
    const search = req.query.search?.toLowerCase();
    const tradingApp = req.query.tradingApp;
    const industry = req.query.industry;
    const exchange = req.query.exchange;

    log('Starting stock search...', 'search');

    // Always start with major stocks
    const stocks: any[] = [];

    for (const symbol of MAJOR_STOCKS) {
      const stockData = await fetchStockData(symbol);
      if (stockData) {
        stocks.push(stockData);
      }
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // Filter stocks based on criteria
    const filteredStocks = stocks
      .filter(stock => stock !== null)
      .filter(stock => !search || 
        stock.symbol.toLowerCase().includes(search) ||
        stock.name.toLowerCase().includes(search)
      )
      .filter(stock => !industry || industry === 'Any' || stock.industry === industry)
      .filter(stock => !exchange || exchange === 'Any' || stock.exchange === exchange)
      .filter(stock => !tradingApp || tradingApp === 'Any' || isStockAvailableOnPlatform(stock.symbol, tradingApp));

    log(`Sending ${filteredStocks.length} stocks`, 'search');
    res.json({
      stocks: filteredStocks,
      hasMore: false,
      total: filteredStocks.length
    });
  } catch (error) {
    log(`Search failed: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
}

function isStockAvailableOnPlatform(symbol: string, platform: string): boolean {
  // Platform stock lists (simplified for testing)
  const platformStockLists: Record<string, Set<string>> = {
    'Robinhood': new Set(MAJOR_STOCKS),
    'TD Ameritrade': new Set(MAJOR_STOCKS),
    'E*TRADE': new Set(MAJOR_STOCKS),
    'Fidelity': new Set(MAJOR_STOCKS),
    'Charles Schwab': new Set(MAJOR_STOCKS),
    'Webull': new Set(MAJOR_STOCKS),
    'Interactive Brokers': new Set(MAJOR_STOCKS)
  };

  if (platform === 'Any' || !platformStockLists[platform]) {
    return true;
  }

  return platformStockLists[platform].has(symbol);
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
      const response = await fetch(`${FINNHUB_API_URL}/calendar/ipo?token=${FINNHUB_API_KEY}`);
      const data = await response.json();

      if (!data || !data.ipoCalendar) {
        return res.json([]);
      }

      res.json(data.ipoCalendar);
    } catch (error) {
      log(`IPO calendar error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch IPO calendar' });
    }
  });

  return httpServer;
}