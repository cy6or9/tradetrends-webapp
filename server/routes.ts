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

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
// Update cache settings and batch processing
const RATE_LIMIT_DELAY = 1000; // Reduce delay between requests
const MAX_CACHE_AGE = 15 * 60 * 1000; // Extend max cache age to 15 minutes
const CACHE_TTL = 5 * 60 * 1000; // Increase cache time to 5 minutes
const BATCH_SIZE = 10; // Increase batch size for faster loading
const MAX_RETRIES = 5;


// Get Finnhub secret from environment
const FINNHUB_SECRET = process.env.EXPECTED_WEBHOOK_SECRET;
if (!FINNHUB_SECRET) {
  throw new Error('EXPECTED_WEBHOOK_SECRET environment variable is not set');
}

// In-memory caches with timestamps
const stockCache = new Map<string, { data: any; timestamp: number }>();


// Store connected clients
const clients = new Set<WebSocket>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

// Update the finnhubRequest function to be more cache-friendly
async function finnhubRequest(endpoint: string, retries = MAX_RETRIES): Promise<any> {
  const cacheKey = `finnhub_${endpoint}`;
  const cached = stockCache.get(cacheKey);

  // Return cached data if it's still fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Using cached data for ${endpoint}`, 'cache');
    return cached.data;
  }

  // Return stale cache data if we have it while fetching new data in background
  if (cached && Date.now() - cached.timestamp < MAX_CACHE_AGE) {
    // Fetch fresh data in background
    finnhubRequest(endpoint, 1).catch(console.error);
    log(`Using stale cache for ${endpoint} while refreshing`, 'cache');
    return cached.data;
  }

  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const url = `${FINNHUB_API_URL}${endpoint}`;
      const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

      log(`Request to Finnhub: ${endpoint} (attempt ${i + 1}/${retries})`, 'api');
      const response = await fetch(fullUrl);

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const delay = RATE_LIMIT_DELAY * Math.pow(1.5, i);
        log(`Rate limited, waiting ${delay}ms`, 'api');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      stockCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;

    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        const delay = RATE_LIMIT_DELAY * Math.pow(1.5, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Return stale cache as fallback if available
  if (cached) {
    log(`Using stale cache as fallback for ${endpoint}`, 'cache');
    return cached.data;
  }

  throw lastError;
}

// Update the searchAndFilterStocks function to use progressive loading
async function searchAndFilterStocks(req: any, res: any) {
  try {
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
      .filter(stock => !req.query.exchange || stock.exchange === req.query.exchange)
      .filter(stock => !req.query.query ||
        stock.symbol.toLowerCase().includes(req.query.query.toString().toLowerCase()) ||
        stock.description.toLowerCase().includes(req.query.query.toString().toLowerCase())
      );

    log(`Filtered to ${activeStocks.length} active stocks`, 'search');

    const stocks = [];
    // Process stocks in larger batches with smart throttling
    for (let i = 0; i < activeStocks.length; i += BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + BATCH_SIZE);
      log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(activeStocks.length/BATCH_SIZE)}`, 'search');

      const batchPromises = batch.map(async (stock) => {
        try {
          // Check cache first
          const cacheKey = `stock_${stock.symbol}`;
          const cached = stockCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
          }

          const [quote, profile] = await Promise.all([
            finnhubRequest(`/quote?symbol=${stock.symbol}`),
            finnhubRequest(`/stock/profile2?symbol=${stock.symbol}`)
          ]);

          if (!quote || !profile) {
            log(`Missing data for ${stock.symbol}`, 'error');
            return null;
          }

          const stockData = {
            id: stock.symbol,
            symbol: stock.symbol,
            name: profile.name || stock.description,
            price: quote.c || 0,
            change: quote.d || 0,
            changePercent: quote.dp || 0,
            volume: quote.v || 0,
            marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
            beta: profile.beta || 0,
            exchange: stock.exchange,
            industry: profile.industry || 'Unknown',
            sector: profile.sector || 'Unknown',
            analystRating: Math.floor(Math.random() * 30) + 70, // Placeholder for demo
            lastUpdate: new Date().toISOString()
          };

          stockCache.set(cacheKey, {
            data: stockData,
            timestamp: Date.now()
          });

          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      stocks.push(...batchResults.filter(Boolean));

      // Adaptive throttling based on rate limiting
      if (i + BATCH_SIZE < activeStocks.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    log(`Sending ${stocks.length} stocks`, 'search');
    res.json(stocks);
  } catch (error) {
    log(`Search failed: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
}

// WebSocket update broadcasting
function broadcastStockUpdate(update: any) {
  const message = JSON.stringify({
    type: 'stockUpdate',
    data: {
      symbol: update.symbol,
      price: update.data.price,
      change: update.data.change,
      timestamp: update.data.timestamp
    }
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        log(`Failed to send update: ${error}`, 'websocket');
        clients.delete(client);
      }
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false
  });

  // WebSocket connection handling
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

  app.get("/api/finnhub/stock/symbol", (_req: any, res: any) => {
    proxyFinnhubRequest('/stock/symbol?exchange=US', res);
  });

  app.get("/api/finnhub/stock/profile2", (req: any, res: any) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/stock/profile2?symbol=${symbol}`, res);
  });

  async function proxyFinnhubRequest(endpoint: string, res: any) {
    try {
      const data = await finnhubRequest(endpoint);
      res.json(data);
    } catch (error) {
      log(`Proxy error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  }

  return httpServer;
}