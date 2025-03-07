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
import crypto from 'crypto';

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 1000; // Increase delay between requests
const BATCH_SIZE = 3; // Process fewer stocks at once
const MAX_RETRIES = 3;

// In-memory caches
const stockCache = new Map<string, any>();
const CACHE_TTL = 60000; // 1 minute cache TTL

// WebSocket clients
const clients = new Set<WebSocket>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

async function finnhubRequest(endpoint: string, retries = MAX_RETRIES): Promise<any> {
  const cacheKey = endpoint;
  const cached = stockCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Cache hit for ${endpoint}`, 'cache');
    return cached.data;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const url = `${FINNHUB_API_URL}${endpoint}`;
      const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

      log(`Request to Finnhub: ${endpoint} (attempt ${i + 1})`, 'api');
      const response = await fetch(fullUrl);

      if (response.status === 429) {
        const delay = RATE_LIMIT_DELAY * Math.pow(2, i);
        log(`Rate limited, waiting ${delay}ms`, 'api');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      stockCache.set(cacheKey, { data, timestamp: Date.now() });
      log(`Cached response for ${endpoint}`, 'cache');
      return data;

    } catch (error) {
      log(`Request failed: ${error}`, 'error');
      if (i === retries - 1 && cached) {
        log(`Using stale cache for ${endpoint}`, 'cache');
        return cached.data;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Failed after ${retries} retries`);
}

async function searchAndFilterStocks(req: any, res: any) {
  const { query, exchange, sort } = req.query;

  try {
    // First check if we have cached results
    const cacheKey = `search_${query || ''}_${exchange || ''}_${sort || ''}`;
    const cached = stockCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      log(`Using cached search results`, 'cache');
      return res.json(cached.data);
    }

    // Get base stock list
    log('Fetching symbols...', 'search');
    const symbols = await finnhubRequest('/stock/symbol?exchange=US');
    if (!Array.isArray(symbols)) {
      throw new Error('Invalid response format');
    }

    // Filter active stocks
    const activeStocks = symbols.filter(stock =>
      stock.type === 'Common Stock' &&
      (!exchange || stock.exchange === exchange) &&
      (!query ||
        stock.symbol.toLowerCase().includes(query.toString().toLowerCase()) ||
        stock.description.toLowerCase().includes(query.toString().toLowerCase()))
    );

    log(`Processing ${activeStocks.length} stocks...`, 'search');
    const stocks = [];

    // Process in small batches
    for (let i = 0; i < activeStocks.length; i += BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (stock) => {
        try {
          // Check cache first
          const stockCacheKey = `stock_${stock.symbol}`;
          const stockCached = stockCache.get(stockCacheKey);
          if (stockCached && Date.now() - stockCached.timestamp < CACHE_TTL) {
            return stockCached.data;
          }

          const [quote, profile] = await Promise.all([
            finnhubRequest(`/quote?symbol=${stock.symbol}`),
            finnhubRequest(`/stock/profile2?symbol=${stock.symbol}`)
          ]);

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
            lastUpdate: new Date().toISOString()
          };

          stockCache.set(stockCacheKey, {
            data: stockData,
            timestamp: Date.now()
          });

          // Broadcast update
          broadcastStockUpdate({
            symbol: stock.symbol,
            data: {
              price: quote.c,
              change: quote.d,
              timestamp: new Date().toISOString()
            }
          });

          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          return null;
        }
      }));

      stocks.push(...batchResults.filter(Boolean));
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // Apply sorting
    if (sort) {
      const [field, order] = sort.split(':');
      stocks.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return order === 'desc'
            ? bVal.localeCompare(aVal)
            : aVal.localeCompare(bVal);
        }

        const aNum = Number(aVal) || 0;
        const bNum = Number(bVal) || 0;

        return order === 'desc' ? bNum - aNum : aNum - bNum;
      });
    }

    // Cache the results
    stockCache.set(cacheKey, {
      data: stocks,
      timestamp: Date.now()
    });

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

// Register routes
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

    // Heartbeat to keep connection alive
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

  // Clean up inactive connections
  setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as any;
      if (!client.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      client.isAlive = false;
    });
  }, 30000);

  // Register the API routes
  app.get("/api/stocks/search", searchAndFilterStocks);

  // IPO Calendar route
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
    app.get("/api/finnhub/quote", (req: any, res: any) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/quote?symbol=${symbol}`, res);
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

  // Storage routes
  app.get("/api/stocks", async (req: any, res: any) => {
    const stocks = await storage.getStocks();
    res.json(stocks);
  });

  app.get("/api/stocks/:symbol", async (req: any, res: any) => {
    const stock = await storage.getStockBySymbol(req.params.symbol);
    if (!stock) {
      res.status(404).json({ message: "Stock not found" });
      return;
    }
    res.json(stock);
  });

  app.put("/api/stocks/:symbol", async (req: any, res: any) => {
    try {
      const data = insertStockSchema.parse(req.body);
      const stock = await storage.upsertStock(data);
      res.json(stock);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Invalid stock data", errors: error.errors });
        return;
      }
      throw error;
    }
  });

  app.get("/api/users/:userId/favorites", async (req: any, res: any) => {
    const userId = parseInt(req.params.userId);
    const favorites = await storage.getFavorites(userId);
    res.json(favorites);
  });

  app.post("/api/users/:userId/favorites", async (req: any, res: any) => {
    try {
      const data = insertFavoriteSchema.parse(req.body);
      const favorite = await storage.addFavorite(data);
      res.json(favorite);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Invalid favorite data", errors: error.errors });
        return;
      }
      throw error;
    }
  });

  app.delete("/api/users/:userId/favorites/:stockId", async (req: any, res: any) => {
    const userId = parseInt(req.params.userId);
    const stockId = parseInt(req.params.stockId);
    await storage.removeFavorite(userId, stockId);
    res.status(204).end();
  });

  app.patch("/api/users/:userId/favorites/:stockId/notify", async (req: any, res: any) => {
    const userId = parseInt(req.params.userId);
    const stockId = parseInt(req.params.stockId);
    const { notify } = req.body;

    if (typeof notify !== "boolean") {
      res.status(400).json({ message: "notify must be a boolean" });
      return;
    }

    const favorite = await storage.updateFavoriteNotifications(userId, stockId, notify);
    res.json(favorite);
  });


  return httpServer;
}

// Add crypto data cache (This part was already in the original code, no need to add again)
//const cryptoDataCache = new Map<string, any>();