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
const RATE_LIMIT_DELAY = 1000; // Increase base delay for rate limiting
const BATCH_SIZE = 3; // Process fewer stocks at once
const MAX_RETRIES = 5; // Increase max retries

// In-memory caches
const stockCache = new Map<string, any>();
const CACHE_TTL = 300000; // Increase cache TTL to 5 minutes

// Store connected clients
const clients = new Set<WebSocket>();

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

async function finnhubRequest(endpoint: string, retries = MAX_RETRIES): Promise<any> {
  const cacheKey = endpoint;
  const cached = stockCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Using cached data for ${endpoint}`, 'cache');
    return cached.data;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const url = `${FINNHUB_API_URL}${endpoint}`;
      const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

      log(`Request to Finnhub: ${endpoint} (attempt ${i + 1}/${retries})`, 'api');
      const response = await fetch(fullUrl);
      log(`Response status: ${response.status}`, 'api');

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
      log(`Got response: ${JSON.stringify(data).slice(0, 100)}...`, 'api');

      if (!data) {
        throw new Error('Empty response');
      }

      stockCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;

    } catch (error) {
      log(`Request failed: ${error}`, 'error');

      // On last retry, return cached data if available
      if (i === retries - 1 && cached) {
        log(`Using stale cache for ${endpoint} after ${retries} failed attempts`, 'cache');
        return cached.data;
      }

      const delay = RATE_LIMIT_DELAY * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed after ${retries} retries`);
}

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
    for (let i = 0; i < activeStocks.length; i += BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + BATCH_SIZE);
      log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(activeStocks.length/BATCH_SIZE)}`, 'search');

      const batchPromises = batch.map(async (stock) => {
        try {
          const [quote, profile] = await Promise.all([
            finnhubRequest(`/quote?symbol=${stock.symbol}`),
            finnhubRequest(`/stock/profile2?symbol=${stock.symbol}`)
          ]);

          if (!quote || !profile) {
            log(`Missing data for ${stock.symbol}`, 'error');
            return null;
          }

          // Construct stock data
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

          // Cache the stock data
          stockCache.set(`stock_${stock.symbol}`, {
            data: stockData,
            timestamp: Date.now()
          });

          // Broadcast update if we have valid price data
          if (quote.c > 0) {
            broadcastStockUpdate({
              symbol: stock.symbol,
              data: {
                price: quote.c,
                change: quote.d || 0,
                timestamp: new Date().toISOString()
              }
            });
          }

          return stockData;
        } catch (error) {
          log(`Error processing ${stock.symbol}: ${error}`, 'error');
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      stocks.push(...batchResults.filter(Boolean));

      // Add delay between batches
      if (i + BATCH_SIZE < activeStocks.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    // Sort if requested
    if (req.query.sort) {
      const [field, order] = req.query.sort.split(':');
      stocks.sort((a, b) => {
        if (typeof a[field] === 'string' && typeof b[field] === 'string') {
          return order === 'desc' 
            ? b[field].localeCompare(a[field])
            : a[field].localeCompare(b[field]);
        }
        const aVal = Number(a[field]) || 0;
        const bVal = Number(b[field]) || 0;
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });
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
        log('No IPO calendar data available', 'api');
        return res.json([]);
      }
      res.json(data.ipoCalendar);
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