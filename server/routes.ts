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
const RATE_LIMIT_DELAY = 500; // Increase delay between requests to 500ms
const BATCH_SIZE = 5; // Process fewer stocks at once to avoid rate limits
const MAX_RETRIES = 3;

// Add memory cache for stock data
const stockDataCache = new Map<string, any>();

// Add crypto data cache
const cryptoDataCache = new Map<string, any>();

// Store connected clients
const clients = new Set<WebSocket>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

// Broadcast stock update to all connected clients
function broadcastStockUpdate(update: any) {
  const message = {
    type: 'stockUpdate',
    data: {
      symbol: update.symbol,
      price: update.data?.p || update.data?.price,
      change: update.data?.price_change || 0,
      timestamp: new Date().toISOString()
    }
  };

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        log(`Failed to send update to client: ${error}`, 'websocket');
        clients.delete(client);
      }
    }
  });
}

// Update the finnhubRequest utility to use cache
async function finnhubRequest(endpoint: string, retries = MAX_RETRIES): Promise<any> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const url = `${FINNHUB_API_URL}${endpoint}`;
      const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

      log(`Attempting Finnhub request: ${endpoint} (attempt ${i + 1}/${retries})`, 'api');
      const response = await fetch(fullUrl);
      log(`Finnhub response status: ${response.status}`, 'api');

      if (response.status === 429) {
        const delay = RATE_LIMIT_DELAY * Math.pow(2, i);
        log(`Rate limited, waiting ${delay}ms before retry ${i + 1}/${retries}`, 'api');
        await new Promise(resolve => setTimeout(resolve, delay));

        // Return cached data if available when rate limited
        if (endpoint.includes('/quote?symbol=') || endpoint.includes('/stock/profile2?symbol=')) {
          const symbol = new URL(fullUrl).searchParams.get('symbol');
          const cachedData = stockDataCache.get(symbol || '');
          if (cachedData) {
            log(`Using cached data for ${symbol}`, 'cache');
            return cachedData;
          }
        }
        continue;
      }

      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache the response data
      if (endpoint.includes('/quote?symbol=') || endpoint.includes('/stock/profile2?symbol=')) {
        const symbol = new URL(fullUrl).searchParams.get('symbol');
        if (symbol) {
          stockDataCache.set(symbol, data);
          log(`Cached data for ${symbol}`, 'cache');
        }
      }

      log(`Finnhub request successful: ${endpoint}`, 'api');
      return data;
    } catch (error) {
      lastError = error;
      log(`Finnhub request failed: ${error}`, 'error');
      if (i < retries - 1) {
        const delay = RATE_LIMIT_DELAY * Math.pow(2, i);
        log(`Retrying in ${delay}ms (${i + 1}/${retries})`, 'api');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Update searchAndFilterStocks to use smaller batches and better caching
async function searchAndFilterStocks(req: any, res: any) {
  const { query, exchange, sort, minPrice, maxPrice, minMarketCap, maxMarketCap } = req.query;

  try {
    log(`Stock search request: ${JSON.stringify({
      query, exchange, sort, minPrice, maxPrice, minMarketCap, maxMarketCap
    })}`, 'search');

    // Get base stock list
    log('Fetching stock symbols from Finnhub...', 'search');
    let symbols;
    try {
      symbols = await finnhubRequest('/stock/symbol?exchange=US');
    } catch (error) {
      log('Failed to fetch symbols, using cached data', 'error');
      // Return cached stocks if symbol fetch fails
      const cachedStocks = Array.from(stockDataCache.values());
      if (cachedStocks.length > 0) {
        return res.json(cachedStocks);
      }
      throw error;
    }

    if (!Array.isArray(symbols)) {
      log('Invalid response from Finnhub: symbols is not an array', 'error');
      throw new Error('Invalid response from Finnhub API');
    }

    log(`Received ${symbols.length} symbols from Finnhub`, 'search');

    const activeStocks = symbols.filter((stock: any) =>
      stock.type === 'Common Stock' &&
      (!exchange || stock.exchange === exchange) &&
      (!query ||
        stock.symbol.toLowerCase().includes(query.toString().toLowerCase()) ||
        stock.description.toLowerCase().includes(query.toString().toLowerCase()))
    );

    log(`Filtered to ${activeStocks.length} active stocks`, 'search');

    const stocks: any[] = [];
    // Use a smaller batch size to avoid rate limits
    const REDUCED_BATCH_SIZE = BATCH_SIZE;

    for (let i = 0; i < activeStocks.length; i += REDUCED_BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + REDUCED_BATCH_SIZE);
      log(`Processing batch ${i / REDUCED_BATCH_SIZE + 1}: ${batch.length} stocks`, 'search');

      const batchPromises = batch.map(async (stock: any) => {
        try {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

          const [quote, profile] = await Promise.all([
            finnhubRequest(`/quote?symbol=${stock.symbol}`).catch(() => {
              const cached = stockDataCache.get(stock.symbol);
              return cached || {};
            }),
            finnhubRequest(`/stock/profile2?symbol=${stock.symbol}`).catch(() => {
              const cached = stockDataCache.get(stock.symbol);
              return cached || {};
            })
          ]);

          // Broadcast stock update via WebSocket if we have price data
          if (quote.c) {
            broadcastStockUpdate({
              symbol: stock.symbol,
              data: {
                price: quote.c,
                change: quote.d || 0,
                timestamp: new Date().toISOString()
              }
            });
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
            high52Week: profile.weekHigh52 || 0,
            low52Week: profile.weekLow52 || 0,
            beta: profile.beta || 0,
            exchange: stock.exchange,
            industry: profile.industry || 'Unknown',
            lastUpdate: new Date().toISOString()
          };

          // Update cache with new data
          stockDataCache.set(stock.symbol, stockData);
          log(`Processed ${stock.symbol} successfully`, 'search');
          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          // Return cached data if available
          const cached = stockDataCache.get(stock.symbol);
          if (cached) {
            log(`Using cached data for ${stock.symbol}`, 'cache');
            return cached;
          }
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      stocks.push(...batchResults.filter(s => s !== null));
      log(`Completed batch. Total stocks processed: ${stocks.length}/${activeStocks.length}`, 'search');

      // Add a delay between batches to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * 2));
    }

    // Apply numeric filters
    const filteredStocks = stocks.filter(stock => {
      if (!stock) return false;
      if (minPrice && stock.price < Number(minPrice)) return false;
      if (maxPrice && stock.price > Number(maxPrice)) return false;
      if (minMarketCap && stock.marketCap < Number(minMarketCap)) return false;
      if (maxMarketCap && stock.marketCap > Number(maxMarketCap)) return false;
      return true;
    });

    log(`Applied filters: ${filteredStocks.length} stocks remaining`, 'search');

    // Apply sorting
    if (sort) {
      const [field, order] = sort.toString().split(':');
      filteredStocks.sort((a: any, b: any) => {
        let aVal = a[field];
        let bVal = b[field];

        // Handle string comparisons
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
          return order === 'desc' ?
            bVal.localeCompare(aVal) :
            aVal.localeCompare(bVal);
        }

        // Handle numeric comparisons
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;

        // Special handling for certain fields
        if (field === 'changePercent' || field === 'volume' || field === 'marketCap') {
          // Sort by absolute value for percentage changes
          if (field === 'changePercent' && order === 'desc') {
            return Math.abs(bVal) - Math.abs(aVal);
          }
          // Regular numeric sort for other fields
          return order === 'desc' ? bVal - aVal : aVal - bVal;
        }

        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });
      log(`Sorted stocks by ${field} ${order}`, 'search');
    }

    log(`Sending ${filteredStocks.length} stocks after filtering and sorting`, 'search');
    res.json(filteredStocks);
  } catch (error) {
    log(`Search error: ${error}`, 'error');

    // Try to return cached data if the search fails
    const cachedStocks = Array.from(stockDataCache.values());
    if (cachedStocks.length > 0) {
      log(`Returning ${cachedStocks.length} cached stocks after error`, 'cache');
      return res.json(cachedStocks);
    }

    res.status(500).json({ error: 'Failed to search stocks' });
  }
}

// Register routes
export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false
  });

  log('WebSocket server initialized', 'websocket');

  // WebSocket connection handling
  wss.on('connection', (ws: WebSocket) => {
    log('Client connected to WebSocket', 'websocket');
    clients.add(ws);

    // Set up heartbeat
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    // Handle pong responses
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    // Handle errors and disconnection
    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
      clearInterval(heartbeatInterval);
      clients.delete(ws);
    });

    ws.on('close', () => {
      log('Client disconnected from WebSocket', 'websocket');
      clearInterval(heartbeatInterval);
      clients.delete(ws);
    });
  });

  // Cleanup inactive connections
  setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as any;
      if (!client.isAlive) {
        log('Removing inactive WebSocket client', 'websocket');
        clients.delete(ws);
        return ws.terminate();
      }
      client.isAlive = false;
    });
  }, 30000);

  // Register routes
  app.get("/api/stocks/search", searchAndFilterStocks);

  app.get("/api/finnhub/crypto/candle", async (req: any, res: any) => {
    const { symbol, resolution } = req.query;
    if (!symbol || !resolution) {
      log('Missing required parameters for crypto candle request', 'error');
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
      // Calculate time range (last 24 hours)
      const to = Math.floor(Date.now() / 1000);
      const from = to - 86400; // 24 hours ago

      // Check cache first
      const cacheKey = `${symbol}_${from}_${to}`;
      const cachedData = cryptoDataCache.get(cacheKey);
      if (cachedData) {
        log(`Using cached crypto data for ${symbol}`, 'cache');
        return res.json(cachedData);
      }

      log(`Crypto candle request for ${symbol} from ${from} to ${to}`, 'api');
      const data = await finnhubRequest(`/crypto/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`);

      if (data && data.s !== 'no_data' && Array.isArray(data.c)) {
        // Cache successful response
        cryptoDataCache.set(cacheKey, data);
        log(`Cached crypto data for ${symbol}`, 'cache');
      }

      res.json(data);
    } catch (error) {
      log(`Crypto data error: ${error}`, 'error');

      // Return cached data if available on error
      const cacheKey = `${symbol}_${Math.floor((Date.now() / 1000) - 86400)}_${Math.floor(Date.now() / 1000)}`;
      const cachedData = cryptoDataCache.get(cacheKey);
      if (cachedData) {
        log(`Returning cached crypto data for ${symbol} after error`, 'cache');
        return res.json(cachedData);
      }

      res.status(500).json({ error: 'Failed to fetch crypto data' });
    }
  });

  app.get("/api/finnhub/calendar/ipo", async (_req: any, res: any) => {
    try {
      const data = await finnhubRequest('/calendar/ipo');
      res.json(data);
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
    proxyFinnhubRequest(`/quote?symbol=${symbol}`, req, res);
  });

  app.get("/api/finnhub/stock/symbol", (req: any, res: any) => {
    proxyFinnhubRequest('/stock/symbol?exchange=US', req, res);
  });


  app.get("/api/finnhub/stock/profile2", (req: any, res: any) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/stock/profile2?symbol=${symbol}`, req, res);
  });

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

  async function proxyFinnhubRequest(endpoint: string, req: any, res: any) {
    if (!FINNHUB_API_KEY) {
      log('Finnhub API key not configured', 'error');
      return res.status(500).json({ error: 'API key not configured' });
    }

    try {
      const data = await finnhubRequest(endpoint);
      res.json(data);
    } catch (error) {
      log(`Proxy error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch data from Finnhub' });
    }
  }

  return httpServer;
}