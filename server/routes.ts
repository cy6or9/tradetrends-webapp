import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";

if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 250; // 0.25 second between requests
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache
const stockCache = new Map<string, { data: any; timestamp: number }>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

async function fetchStockSymbols(): Promise<string[]> {
  try {
    const response = await fetch(`${FINNHUB_API_URL}/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`);
    if (!response.ok) throw new Error('Failed to fetch stock symbols');
    const data = await response.json();
    return data
      .filter((stock: any) => stock.type === 'Common Stock')
      .map((stock: any) => stock.symbol);
  } catch (error) {
    log(`Error fetching stock symbols: ${error}`, 'error');
    return [];
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

    const [quoteResponse, profileResponse] = await Promise.all([
      fetch(`${FINNHUB_API_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`),
      fetch(`${FINNHUB_API_URL}/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    ]);

    if (!quoteResponse.ok || !profileResponse.ok) {
      throw new Error(`Failed to fetch data for ${symbol}`);
    }

    const quote = await quoteResponse.json();
    const profile = await profileResponse.json();

    if (!quote || !profile) {
      return null;
    }

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
      analystRating: Math.floor(Math.random() * 30) + 70, // Placeholder
      lastUpdate: new Date().toISOString()
    };

    // Only cache valid data with non-zero values
    if (stockData.price > 0) {
      stockCache.set(cacheKey, {
        data: stockData,
        timestamp: Date.now()
      });
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

    // Get all available stock symbols
    const symbols = await fetchStockSymbols();
    log(`Found ${symbols.length} total stocks`, 'search');

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSymbols = symbols.slice(startIndex, endIndex);

    // Fetch data for paginated symbols
    const stocks: any[] = [];
    for (const symbol of paginatedSymbols) {
      const stockData = await fetchStockData(symbol);
      if (stockData && stockData.price > 0) {
        stocks.push(stockData);
      }
    }

    // Apply filters
    const filteredStocks = stocks
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
      hasMore: endIndex < symbols.length,
      total: symbols.length
    });
  } catch (error) {
    log(`Search failed: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
}

async function fetchSpacList(): Promise<any[]> {
  try {
    const response = await fetch(`${FINNHUB_API_URL}/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`);
    if (!response.ok) throw new Error('Failed to fetch SPAC data');
    const data = await response.json();

    // Filter for potential SPACs
    const spacSymbols = data
      .filter((stock: any) => {
        const symbol = stock.symbol.toUpperCase();
        const description = (stock.description || '').toUpperCase();
        return (
          symbol.endsWith('U') || 
          symbol.includes('SPAC') || 
          symbol.includes('ACQ') ||
          description.includes('SPAC') ||
          description.includes('ACQUISITION')
        );
      })
      .map((stock: any) => stock.symbol);

    log(`Found ${spacSymbols.length} potential SPACs`, 'spac');

    // Fetch detailed data for each SPAC
    const spacs = [];
    for (const symbol of spacSymbols) {
      const stockData = await fetchStockData(symbol);
      if (stockData) {
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
  // In a real implementation, this would check against actual platform APIs
  // For now, we'll assume all stocks are available on all platforms
  return true;
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