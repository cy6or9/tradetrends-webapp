// Add this at the top of the file
if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertStockSchema, insertFavoriteSchema } from "@shared/schema";
import { ZodError } from "zod";

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

// Add this near the top after imports
function formatVolume(volume: number): number {
  return Math.max(volume || 0, 0);
}

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
// Update cache settings and batch processing
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const MAX_CACHE_AGE = 15 * 60 * 1000; // 15 minutes
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 5; // Reduce batch size to avoid rate limits
const MAX_RETRIES = 3;

// In-memory caches with timestamps
const stockCache = new Map<string, { data: any; timestamp: number }>();

async function refreshStockData(endpoint: string): Promise<any> {
  try {
    const url = `${FINNHUB_API_URL}${endpoint}`;
    const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

    const response = await fetch(fullUrl);
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data) {
      throw new Error('Invalid API response');
    }

    return data;
  } catch (error) {
    console.error(`Error refreshing data for ${endpoint}:`, error);
    throw error;
  }
}

async function finnhubRequest(endpoint: string, retries = MAX_RETRIES): Promise<any> {
  const cacheKey = `finnhub_${endpoint}`;
  const cached = stockCache.get(cacheKey);

  // Return cached data if it's still fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Return stale cache data if we have it while fetching new data in background
  if (cached && Date.now() - cached.timestamp < MAX_CACHE_AGE) {
    // Schedule background refresh without waiting
    setTimeout(() => {
      refreshStockData(endpoint).then(newData => {
        if (newData) {
          stockCache.set(cacheKey, { data: newData, timestamp: Date.now() });
        }
      });
    }, 0);
    return cached.data;
  }

  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const data = await refreshStockData(endpoint);
      if (data) {
        stockCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      }
    } catch (error) {
      lastError = error;
      if (error.message === 'Rate limit exceeded') {
        // Wait longer when rate limited
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * 2));
      } else if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }
  }

  if (cached) {
    // Return stale data if we have it
    return cached.data;
  }

  throw lastError;
}

async function searchAndFilterStocks(req: any, res: any) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search?.toLowerCase();
    const exchange = req.query.exchange;
    const tradingApp = req.query.tradingApp;
    const industry = req.query.industry;

    log('Starting stock search...', 'search');
    const symbols = await finnhubRequest('/stock/symbol?exchange=US');

    if (!Array.isArray(symbols)) {
      log('Invalid symbol response format', 'error');
      throw new Error('Invalid API response format');
    }

    log(`Got ${symbols.length} symbols`, 'search');

    // Filter active stocks
    const activeStocks = symbols
      .filter(stock => stock.type === 'Common Stock')
      .filter(stock => !exchange || exchange === 'Any' || stock.exchange === exchange)
      .filter(stock => !search ||
        stock.symbol.toLowerCase().includes(search) ||
        stock.description.toLowerCase().includes(search)
      );

    log(`Filtered to ${activeStocks.length} active stocks`, 'search');

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedStocks = activeStocks.slice(startIndex, endIndex);

    const stocks = [];
    // Process stocks in parallel batches with increased delays
    for (let i = 0; i < paginatedStocks.length; i += BATCH_SIZE) {
      const batch = paginatedStocks.slice(i, i + BATCH_SIZE);

      // Process each batch sequentially to avoid rate limits
      const batchPromises = batch.map(async (stock) => {
        try {
          // Check cache first
          const cacheKey = `stock_${stock.symbol}`;
          const cached = stockCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
          }

          // Add delay between requests
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

          const [quote, profile] = await Promise.all([
            finnhubRequest(`/quote?symbol=${stock.symbol}`),
            finnhubRequest(`/stock/profile2?symbol=${stock.symbol}`)
          ]);

          if (!quote || !profile) {
            log(`Missing data for ${stock.symbol}`, 'error');
            return null;
          }

          // Format volume data properly
          const volume = formatVolume(quote.v);
          if (volume === 0) {
            log(`Zero volume for ${stock.symbol}`, 'warning');
          }

          const stockData = {
            id: stock.symbol,
            symbol: stock.symbol,
            name: profile.name || stock.description,
            price: quote.c || 0,
            change: quote.d || 0,
            changePercent: quote.dp || 0,
            volume: volume,
            marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
            beta: profile.beta || 0,
            exchange: stock.exchange,
            industry: profile.finnhubIndustry || 'Unknown',
            analystRating: Math.floor(Math.random() * 30) + 70, // Placeholder for demo
            lastUpdate: new Date().toISOString()
          };

          // Only cache valid data
          if (stockData.volume > 0 && stockData.price > 0) {
            stockCache.set(cacheKey, {
              data: stockData,
              timestamp: Date.now()
            });
            log(`Cached data for ${stock.symbol}`, 'cache');
          }

          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter(Boolean);
      log(`Processed batch with ${validResults.length} valid results`, 'batch');
      stocks.push(...validResults);

      // Add delay between batches
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * 2));
    }

    // Apply filters after getting full stock data
    const filteredStocks = stocks
      .filter(stock => stock !== null)
      .filter(stock => stock.volume > 0)  // Only include stocks with valid volume
      .filter(stock => 
        !industry || industry === 'Any' || stock.industry === industry
      )
      .filter(stock =>
        !tradingApp || tradingApp === 'Any' || isStockAvailableOnPlatform(stock.symbol, tradingApp)
      );

    log(`Sending ${filteredStocks.length} stocks`, 'search');
    res.json({
      stocks: filteredStocks,
      hasMore: endIndex < activeStocks.length,
      total: activeStocks.length
    });
  } catch (error) {
    log(`Search failed: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
}

// Helper function for trading app filtering
function isStockAvailableOnPlatform(symbol: string, platform: string): boolean {
  // More comprehensive list of stocks available on different platforms
  const platformStockLists: Record<string, Set<string>> = {
    'Robinhood': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'PFE', 'KO', 'PEP', 'DIS', 'NFLX', 'CSCO', 'INTC', 'VZ', 'T', 'XOM',
      'CVX', 'PG', 'JNJ', 'UNH', 'HD', 'MA', 'V', 'PYPL', 'ADBE', 'CRM',
      'BA', 'CAT', 'GE', 'MMM', 'HON', 'LMT', 'RTX', 'GS', 'MS', 'C'
    ]),
    'TD Ameritrade': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'PFE', 'KO', 'PEP', 'DIS', 'NFLX', 'CSCO', 'INTC', 'VZ', 'T', 'XOM',
      'CVX', 'PG', 'JNJ', 'UNH', 'HD', 'MA', 'V', 'PYPL', 'ADBE', 'CRM',
      'BA', 'CAT', 'GE', 'MMM', 'HON', 'LMT', 'RTX', 'GS', 'MS', 'C',
      'AMD', 'QCOM', 'COST', 'NKE', 'MCD', 'SBUX', 'TGT', 'F', 'GM', 'UBER'
    ]),
    'E*TRADE': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'AMD', 'QCOM', 'COST', 'NKE', 'MCD', 'SBUX', 'TGT', 'F', 'GM', 'UBER'
    ]),
    'Fidelity': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'AMD', 'QCOM', 'COST', 'NKE', 'MCD', 'SBUX', 'TGT', 'F', 'GM', 'UBER'
    ]),
    'Charles Schwab': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'AMD', 'QCOM', 'COST', 'NKE', 'MCD', 'SBUX', 'TGT', 'F', 'GM', 'UBER'
    ]),
    'Webull': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'AMD', 'QCOM', 'COST', 'NKE', 'MCD', 'SBUX', 'TGT', 'F', 'GM', 'UBER'
    ]),
    'Interactive Brokers': new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'BAC', 'WMT',
      'AMD', 'QCOM', 'COST', 'NKE', 'MCD', 'SBUX', 'TGT', 'F', 'GM', 'UBER'
    ])
  };

  if (platform === 'Any' || !platformStockLists[platform]) {
    return true;
  }

  return platformStockLists[platform].has(symbol);
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false
  });

  // Store connected clients
  const clients = new Set<WebSocket>();

  // Update the WebSocket connection handling
  wss.on('connection', (ws: WebSocket) => {
    log('Client connected', 'websocket');
    clients.add(ws);

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(ws);
      log('Client disconnected', 'websocket');
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
      clearInterval(heartbeat);
      clients.delete(ws);
    });
  });

  // API routes
  app.get("/api/stocks/search", searchAndFilterStocks);

  app.get("/api/finnhub/calendar/ipo", async (_req: any, res: any) => {
    try {
      const data = await finnhubRequest('/calendar/ipo');
      if (!data || !data.ipoCalendar) {
        log('No IPO calendar data', 'api');
        return res.json([]);
      }

      // Map the IPO calendar data to include all necessary fields
      const ipoEvents = data.ipoCalendar.map((ipo: any) => ({
        symbol: ipo.symbol,
        name: ipo.name,
        date: ipo.date,
        price: ipo.price,
        numberOfShares: ipo.numberOfShares, // Add this field
        shares: ipo.numberOfShares, // Add both for compatibility
        totalShares: ipo.numberOfShares,
        exchange: ipo.exchange,
        status: ipo.status
      }));

      log(`Got ${ipoEvents.length} IPO events with share data`, 'api');
      res.json(ipoEvents);
    } catch (error) {
      log(`IPO calendar error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch IPO calendar' });
    }
  });

  return httpServer;
}