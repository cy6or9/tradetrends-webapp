import type { Express } from "express";
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
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || process.env.VITE_FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 250; // ms between requests

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
        console.error(`Failed to send update to client: ${error}`);
        clients.delete(client);
      }
    } else if (client.readyState !== WebSocket.CONNECTING) {
      clients.delete(client);
    }
  }
}

// Proxy middleware for Finnhub API requests
async function proxyFinnhubRequest(endpoint: string, req: express.Request, res: express.Response) {
  if (!FINNHUB_API_KEY) {
    console.error('Finnhub API key not configured');
    return res.status(500).json({ error: 'Finnhub API key not configured' });
  }

  try {
    const url = `${FINNHUB_API_URL}${endpoint}`;
    const fullUrl = url.includes('?') ? `${url}&token=${FINNHUB_API_KEY}` : `${url}?token=${FINNHUB_API_KEY}`;

    console.log(`Proxying request to: ${endpoint}`);

    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Finnhub-Token': FINNHUB_API_KEY
      }
    });

    console.log(`Finnhub response status: ${response.status}`);

    if (response.status === 429) {
      console.log('Rate limit hit, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      return proxyFinnhubRequest(endpoint, req, res);
    }

    if (!response.ok) {
      throw new Error(`Finnhub API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Successfully received data for ${endpoint}`);
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
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
    console.log('Client connected to WebSocket');
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
      console.error('WebSocket error:', error);
      clearInterval(heartbeatInterval);
      clients.delete(ws);
    });

    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
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

  // Finnhub Webhook endpoint
  app.post("/webhook", express.json(), (req, res) => {
    const signature = req.headers['x-finnhub-webhook-signature'];
    const expectedSecret = process.env.EXPECTED_WEBHOOK_SECRET;

    if (!signature || !expectedSecret) {
      console.error('Missing webhook signature or secret');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Verify webhook signature
    const computedSignature = crypto
      .createHmac('sha256', expectedSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== computedSignature) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Process and broadcast the update
    try {
      console.log('Received Finnhub webhook:', req.body);
      broadcastStockUpdate(req.body);
      res.status(200).json({ message: 'Update processed' });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

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