import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertStockSchema, insertFavoriteSchema } from "@shared/schema";
import { ZodError } from "zod";

// Store connected clients
const clients = new Set<WebSocket>();

// Test stocks for real-time updates
const testStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

// Mock function to simulate real-time stock updates
function startStockUpdates(wss: WebSocketServer) {
  setInterval(() => {
    testStocks.forEach(symbol => {
      // Base prices for test stocks
      const basePrices: { [key: string]: number } = {
        'AAPL': 175,
        'MSFT': 285,
        'GOOGL': 134,
        'AMZN': 175,
        'META': 485
      };

      const basePrice = basePrices[symbol] || 100;
      const change = (Math.random() * 2 - 1); // Random change between -1 and 1
      const price = basePrice + change;
      const changePercent = (change / basePrice) * 100;

      const mockUpdate = {
        type: 'stockUpdate',
        data: {
          symbol,
          price,
          change: changePercent,
          timestamp: new Date().toISOString()
        }
      };

      // Broadcast to all connected clients
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(mockUpdate));
          } catch (error) {
            console.error(`Failed to send update to client: ${error}`);
            clients.delete(client);
          }
        }
      });
    });
  }, 2000); // Update every 2 seconds
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    perMessageDeflate: false // Disable compression for better performance
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to WebSocket');
    clients.add(ws);

    // Send initial data immediately
    testStocks.forEach(symbol => {
      const initialUpdate = {
        type: 'stockUpdate',
        data: {
          symbol,
          price: 100,
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
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  // Start sending mock updates
  startStockUpdates(wss);

  // Get all stocks
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