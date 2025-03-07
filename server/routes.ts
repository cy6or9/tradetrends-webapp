import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertStockSchema, insertFavoriteSchema } from "@shared/schema";
import { ZodError } from "zod";
import crypto from 'crypto';

// Store connected clients
const clients = new Set<WebSocket>();

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 100; // ms between requests
const BATCH_SIZE = 30; // Process fewer stocks at once
const MAX_RETRIES = 3;

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

// Utility function for API requests with retries and backoff
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
        continue;
      }

      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status}`);
      }

      const data = await response.json();
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

// Update the searchAndFilterStocks function to be more resilient
async function searchAndFilterStocks(req: express.Request, res: express.Response) {
  const { query, exchange, sort, minPrice, maxPrice, minMarketCap, maxMarketCap } = req.query;

  try {
    log(`Stock search request: ${JSON.stringify({ 
      query, exchange, sort, minPrice, maxPrice, minMarketCap, maxMarketCap 
    })}`, 'search');

    // Get base stock list
    log('Fetching stock symbols from Finnhub...', 'search');
    const symbols = await finnhubRequest('/stock/symbol?exchange=US');

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
    for (let i = 0; i < activeStocks.length; i += BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + BATCH_SIZE);
      log(`Processing batch ${i / BATCH_SIZE + 1}: ${batch.length} stocks`, 'search');

      const batchPromises = batch.map(async (stock: any) => {
        try {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

          const [quote, profile] = await Promise.all([
            finnhubRequest(`/quote?symbol=${stock.symbol}`).catch(() => ({})),
            finnhubRequest(`/stock/profile2?symbol=${stock.symbol}`).catch(() => ({}))
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
            high52Week: profile.weekHigh52 || 0,
            low52Week: profile.weekLow52 || 0,
            beta: profile.beta || 0,
            exchange: stock.exchange,
            industry: profile.industry || 'Unknown',
            lastUpdate: new Date().toISOString()
          };

          log(`Processed ${stock.symbol} successfully`, 'search');
          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          // Return basic stock info even if API calls fail
          return {
            id: stock.symbol,
            symbol: stock.symbol,
            name: stock.description,
            price: 0,
            change: 0,
            changePercent: 0,
            volume: 0,
            marketCap: 0,
            beta: 0,
            exchange: stock.exchange,
            industry: 'Unknown',
            lastUpdate: new Date().toISOString()
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      stocks.push(...batchResults);
      log(`Completed batch. Total stocks processed: ${stocks.length}/${activeStocks.length}`, 'search');
    }

    // Apply numeric filters
    const filteredStocks = stocks.filter(stock => {
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
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });
      log(`Sorted stocks by ${field} ${order}`, 'search');
    }

    log(`Sending ${filteredStocks.length} stocks after filtering and sorting`, 'search');
    res.json(filteredStocks);
  } catch (error) {
    log(`Search error: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to search stocks' });
  }
}

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
  app.get("/api/finnhub/calendar/ipo", async (_req, res) => {
    try {
      const data = await finnhubRequest('/calendar/ipo');
      res.json(data);
    } catch (error) {
      log(`IPO calendar error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch IPO calendar' });
    }
  });

  app.get("/api/finnhub/quote", (req, res) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/quote?symbol=${symbol}`, req, res);
  });

  app.get("/api/finnhub/stock/symbol", (req, res) => {
    proxyFinnhubRequest('/stock/symbol?exchange=US', req, res);
  });

  app.get("/api/finnhub/crypto/candle", (req, res) => {
    const { symbol, resolution, from, to } = req.query;
    if (!symbol || !resolution || !from || !to) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    proxyFinnhubRequest(`/crypto/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`, req, res);
  });

  app.get("/api/finnhub/stock/profile2", (req, res) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/stock/profile2?symbol=${symbol}`, req, res);
  });

  // Storage routes
  app.get("/api/stocks", async (req, res) => {
    const stocks = await storage.getStocks();
    res.json(stocks);
  });

  app.get("/api/stocks/:symbol", async (req, res) => {
    const stock = await storage.getStockBySymbol(req.params.symbol);
    if (!stock) {
      res.status(404).json({ message: "Stock not found" });
      return;
    }
    res.json(stock);
  });

  app.put("/api/stocks/:symbol", async (req, res) => {
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

  app.get("/api/users/:userId/favorites", async (req, res) => {
    const userId = parseInt(req.params.userId);
    const favorites = await storage.getFavorites(userId);
    res.json(favorites);
  });

  app.post("/api/users/:userId/favorites", async (req, res) => {
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

  app.delete("/api/users/:userId/favorites/:stockId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    const stockId = parseInt(req.params.stockId);
    await storage.removeFavorite(userId, stockId);
    res.status(204).end();
  });

  app.patch("/api/users/:userId/favorites/:stockId/notify", async (req, res) => {
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

  async function proxyFinnhubRequest(endpoint: string, req: express.Request, res: express.Response) {
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