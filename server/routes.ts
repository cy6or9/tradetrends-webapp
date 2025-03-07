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

// Test stocks for real-time updates
const testStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Send ping to keep connection alive
function heartbeat(ws: WebSocket) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping();
  }
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
        console.error(`Failed to send update to client: ${error}`);
        clients.delete(client);
      }
    } else if (client.readyState !== WebSocket.CONNECTING) {
      clients.delete(client);
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Create WebSocket server with explicit port
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to WebSocket');
    clients.add(ws);

    // Set up heartbeat
    const heartbeatInterval = setInterval(() => heartbeat(ws), HEARTBEAT_INTERVAL);

    // Handle pong responses
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Send initial data immediately
    testStocks.forEach(symbol => {
      const basePrice = symbol === 'AAPL' ? 175 : 285;
      const initialUpdate = {
        type: 'stockUpdate',
        data: {
          symbol,
          price: basePrice,
          change: 0,
          timestamp: new Date().toISOString()
        }
      };
      ws.send(JSON.stringify(initialUpdate));
    });

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received:', data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
      clearInterval(heartbeatInterval);
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(heartbeatInterval);
      clients.delete(ws);
    });
  });

  // Cleanup inactive connections
  setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
    });
  }, HEARTBEAT_INTERVAL);

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

  // Rest of your routes...
  app.get("/api/stocks", async (req, res) => {
    const stocks = await storage.getStocks();
    res.json(stocks);
  });

  // Get specific stock
  app.get("/api/stocks/:symbol", async (req, res) => {
    const stock = await storage.getStockBySymbol(req.params.symbol);
    if (!stock) {
      res.status(404).json({ message: "Stock not found" });
      return;
    }
    res.json(stock);
  });

  // Update stock data
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

  // Get user's favorites
  app.get("/api/users/:userId/favorites", async (req, res) => {
    const userId = parseInt(req.params.userId);
    const favorites = await storage.getFavorites(userId);
    res.json(favorites);
  });

  // Add favorite
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

  // Remove favorite
  app.delete("/api/users/:userId/favorites/:stockId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    const stockId = parseInt(req.params.stockId);
    await storage.removeFavorite(userId, stockId);
    res.status(204).end();
  });

  // Update favorite notifications
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