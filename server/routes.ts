import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertStockSchema, insertFavoriteSchema } from "@shared/schema";
import { ZodError } from "zod";
import crypto from 'crypto';
import express from 'express';

// Store connected clients
const clients = new Set<WebSocket>();

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 250; // ms between requests

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

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        log(`Failed to send update to client: ${error}`, 'websocket');
        clients.delete(client);
      }
    }
  }
}

// Stock search and filter endpoint
async function searchAndFilterStocks(req: express.Request, res: express.Response) {
  const { query, exchange, sort, minPrice, maxPrice, minMarketCap, maxMarketCap } = req.query;

  try {
    log('Search request params:', JSON.stringify({ 
      query, exchange, sort, minPrice, maxPrice, minMarketCap, maxMarketCap 
    }), 'search');

    // Get base stock list from Finnhub
    const response = await fetch(`${FINNHUB_API_URL}/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch stocks: ${response.status}`);
    }

    let stocks = await response.json();
    log(`Fetched ${stocks.length} stocks from Finnhub`, 'search');

    // Apply filters
    stocks = stocks.filter((stock: any) => {
      if (exchange && stock.exchange !== exchange) return false;
      if (query && !stock.symbol.includes(query.toString().toUpperCase()) && 
          !stock.description.toLowerCase().includes(query.toString().toLowerCase())) return false;
      return true;
    });

    log(`Filtered to ${stocks.length} stocks`, 'search');

    // Get quotes and profiles for filtered stocks
    const quotedStocks = await Promise.all(
      stocks.slice(0, 100).map(async (stock: any) => {
        try {
          const [quoteRes, profileRes] = await Promise.all([
            fetch(`${FINNHUB_API_URL}/quote?symbol=${stock.symbol}&token=${FINNHUB_API_KEY}`),
            fetch(`${FINNHUB_API_URL}/stock/profile2?symbol=${stock.symbol}&token=${FINNHUB_API_KEY}`)
          ]);

          const [quote, profile] = await Promise.all([
            quoteRes.json(),
            profileRes.json()
          ]);

          if (!quoteRes.ok || !profileRes.ok) {
            log(`Failed to fetch data for ${stock.symbol}`, 'error');
            return null;
          }

          const stockData = {
            ...stock,
            price: quote.c || 0,
            change: quote.d || 0,
            changePercent: quote.dp || 0,
            volume: quote.v || 0,
            marketCap: profile.marketCapitalization * 1e6 || 0,
            high52Week: profile.weekHigh52 || 0,
            low52Week: profile.weekLow52 || 0,
            beta: profile.beta || 0,
            industry: profile.industry || 'Unknown'
          };

          // Apply numeric filters
          if (minPrice && stockData.price < Number(minPrice)) return null;
          if (maxPrice && stockData.price > Number(maxPrice)) return null;
          if (minMarketCap && stockData.marketCap < Number(minMarketCap)) return null;
          if (maxMarketCap && stockData.marketCap > Number(maxMarketCap)) return null;

          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          return null;
        }
      })
    );

    // Remove null entries and sort
    const validStocks = quotedStocks.filter(s => s !== null);
    log(`Successfully processed ${validStocks.length} stocks with quotes`, 'search');

    // Apply sorting
    if (sort) {
      const [field, order] = sort.toString().split(':');
      validStocks.sort((a: any, b: any) => {
        const aVal = a[field] || 0;
        const bVal = b[field] || 0;
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    res.json(validStocks);
  } catch (error) {
    log(`Search error: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to search stocks' });
  }
}

// Proxy middleware for Finnhub API requests
async function proxyFinnhubRequest(endpoint: string, req: express.Request, res: express.Response) {
  if (!FINNHUB_API_KEY) {
    log('Finnhub API key not configured', 'error');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const url = `${FINNHUB_API_URL}${endpoint}`;
    const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

    log(`Proxying request to: ${endpoint}`, 'proxy');
    log(`Full URL (token hidden): ${fullUrl.replace(FINNHUB_API_KEY, 'HIDDEN')}`, 'proxy');

    const response = await fetch(fullUrl);
    log(`Finnhub response status: ${response.status}`, 'proxy');

    const data = await response.json();

    if (!response.ok) {
      log(`Finnhub error response: ${JSON.stringify(data)}`, 'error');
      return res.status(response.status).json(data);
    }

    // Log response summary for debugging
    let responseSummary = JSON.stringify(data);
    if (responseSummary.length > 80) {
      responseSummary = responseSummary.slice(0, 79) + "…";
    }
    log(`Successfully received data for ${endpoint}: ${responseSummary}`, 'proxy');
    res.json(data);
  } catch (error) {
    log(`Proxy error: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to fetch data from Finnhub' });
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
      log(`WebSocket error: ${error}`, 'error');
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
        clients.delete(ws);
        return ws.terminate();
      }
      client.isAlive = false;
    });
  }, 30000);

  // Search and filter endpoint
  app.get("/api/stocks/search", searchAndFilterStocks);

  // Finnhub API proxy routes
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

  app.get("/api/finnhub/stock/recommendation", (req, res) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/stock/recommendation?symbol=${symbol}`, req, res);
  });

  app.get("/api/finnhub/stock/profile2", (req, res) => {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    proxyFinnhubRequest(`/stock/profile2?symbol=${symbol}`, req, res);
  });

  // Webhook endpoint for real-time updates
  app.post("/webhook", express.json(), (req, res) => {
    const signature = req.headers['x-finnhub-webhook-signature'];
    const expectedSecret = process.env.EXPECTED_WEBHOOK_SECRET;

    if (!signature || !expectedSecret) {
      log('Missing webhook signature or secret', 'error');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Verify webhook signature
    const computedSignature = crypto
      .createHmac('sha256', expectedSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== computedSignature) {
      log('Invalid webhook signature', 'error');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Process and broadcast the update
    try {
      log('Received Finnhub webhook data', 'webhook');
      broadcastStockUpdate(req.body);
      res.status(200).json({ message: 'Update processed' });
    } catch (error) {
      log(`Error processing webhook: ${error}`, 'error');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Storage routes...
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

  return httpServer;
}