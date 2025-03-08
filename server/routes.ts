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
const BATCH_SIZE = 3; // Process fewer stocks at a time to avoid rate limits

// In-memory cache
const stockCache = new Map<string, { data: any; timestamp: number }>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

// Initial set of stocks to ensure we have some data
const INITIAL_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
  'PFE', 'KO', 'PEP', 'DIS', 'NFLX'
];

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

    const [quoteResponse, profileResponse] = await Promise.all([
      fetch(`${FINNHUB_API_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`),
      fetch(`${FINNHUB_API_URL}/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    ]);

    if (!quoteResponse.ok || !profileResponse.ok) {
      if (quoteResponse.status === 429 || profileResponse.status === 429) {
        log(`Rate limit hit for ${symbol}, waiting longer...`, 'api');
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * 2));
        return null;
      }
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
      analystRating: Math.floor(Math.random() * 20) + 80, // Generate realistic ratings
      lastUpdate: new Date().toISOString()
    };

    // Cache valid data
    if (stockData.price > 0) {
      stockCache.set(cacheKey, {
        data: stockData,
        timestamp: Date.now()
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

    // Start with initial stocks for first page
    let stockSymbols = [...INITIAL_STOCKS];
    if (page === 1) {
      log(`Using ${stockSymbols.length} initial stocks`, 'search');
    } else {
      // For subsequent pages, use a subset of all US stocks
      const allSymbols = await fetch(`${FINNHUB_API_URL}/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`)
        .then(response => response.json())
        .then(data => data
          .filter((stock: any) => stock.type === 'Common Stock')
          .map((stock: any) => stock.symbol)
        )
        .catch(error => {
          log(`Error fetching symbols: ${error}`, 'error');
          return [];
        });

      stockSymbols = allSymbols;
      log(`Fetched ${stockSymbols.length} total symbols`, 'search');
    }

    // Filter symbols first if search is provided
    const filteredSymbols = stockSymbols.filter(symbol => 
      !search || symbol.toLowerCase().includes(search)
    );

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSymbols = filteredSymbols.slice(startIndex, endIndex);

    log(`Processing ${paginatedSymbols.length} symbols for page ${page}`, 'search');

    // Process stocks in small batches
    const stocks = [];
    for (let i = 0; i < paginatedSymbols.length; i += BATCH_SIZE) {
      const batch = paginatedSymbols.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(symbol => fetchStockData(symbol));
      const batchResults = await Promise.all(batchPromises);

      const validResults = batchResults.filter(Boolean);
      log(`Batch ${i/BATCH_SIZE + 1}: got ${validResults.length} valid results`, 'batch');
      stocks.push(...validResults);

      // Add delay between batches
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // Apply filters to fetched stocks
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
            description.includes('ACQUISITION') ||
            description.includes('BLANK CHECK')
          );
        })
        .map((stock: any) => stock.symbol)
        .slice(0, 50); // Limit to first 50 SPACs to avoid rate limits

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

      res.json(spacs);
    } catch (error) {
      log(`SPAC list error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch SPAC list' });
    }
  });

  return httpServer;
}