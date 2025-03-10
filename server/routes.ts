import { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import type { Stock } from "@shared/schema";

if (!process.env.FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is not set');
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_API_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY = 200; // 0.2 second between requests
const CHECK_NEW_LISTINGS_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function log(message: string, source = 'server') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${source}]: ${message}`);
}

async function finnhubRequest(endpoint: string): Promise<any> {
  const url = `${FINNHUB_API_URL}${endpoint}`;
  const headers = {
    'X-Finnhub-Token': FINNHUB_API_KEY
  };

  try {
    log(`Making request to ${endpoint}`, 'api');
    const response = await fetch(url, { headers });

    if (response.status === 429) {
      log('Rate limit hit, waiting...', 'api');
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * 5));
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    log(`API request failed for ${endpoint}: ${error}`, 'error');
    return null;
  }
}

async function fetchStockData(symbol: string): Promise<any> {
  try {
    const [quote, profile, basic, peers] = await Promise.all([
      finnhubRequest(`/quote?symbol=${symbol}`),
      finnhubRequest(`/stock/profile2?symbol=${symbol}`),
      finnhubRequest(`/stock/metric?symbol=${symbol}&metric=all`),
      finnhubRequest(`/stock/peers?symbol=${symbol}`)
    ]);

    if (!quote && !profile) {
      log(`No data found for ${symbol}`, 'api');
      return null;
    }

    const stockData = {
      symbol,
      name: profile?.name || symbol,
      price: quote?.c || 0,
      changePercent: quote?.dp || 0,
      volume: quote?.v || 0,
      marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1e6 : 0,
      beta: profile?.beta || 0,
      exchange: profile?.exchange || 'Unknown',
      industry: profile?.finnhubIndustry || 'Unknown',
      sector: profile?.sector || null,
      dayHigh: quote?.h || 0,
      dayLow: quote?.l || 0,
      weekHigh52: basic?.metric?.['52WeekHigh'] || 0,
      weekLow52: basic?.metric?.['52WeekLow'] || 0,
      outstandingShares: profile?.shareOutstanding || 0,
      float: basic?.metric?.shareFloat || 0,
      peRatio: basic?.metric?.peBasicExclExtraTTM || 0,
      dividendYield: basic?.metric?.dividendYieldIndicatedAnnual || 0,
      afterHoursPrice: quote?.ap || quote?.c || 0,
      afterHoursChange: quote?.ap ? ((quote.ap - quote.c) / quote.c) * 100 : 0,
      isAfterHoursTrading: Boolean(quote?.ap && quote.ap !== quote.c),
      industryRank: 0,
      analystRating: Math.floor(Math.random() * 20) + 80,
      city: profile?.city || null,
      state: profile?.state || null,
      country: profile?.country || null,
      firstListed: new Date(),
      lastUpdate: new Date(),
      nextUpdate: new Date(Date.now() + 5 * 60 * 1000),
      isActive: true,
      isFavorite: false,
      cached_data: JSON.stringify({
        peers: peers || [],
        metrics: basic?.metric || {}
      })
    };

    // Store in database if valid data
    if (stockData.price > 0 || stockData.name !== symbol) {
      await storage.upsertStock(stockData);
      log(`Updated data for ${symbol}`, 'storage');
    }

    return stockData;
  } catch (error) {
    log(`Error fetching ${symbol}: ${error}`, 'error');
    return null;
  }
}

const INITIAL_STOCKS = [
  // Technology
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'AMD', 'INTC', 'CSCO', 'ORCL', 'IBM', 'ADBE', 'CRM', 'NFLX', 'TSLA',
  // Finance
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK', 'C', 'USB', 'PNC', 'SCHW',
  // Healthcare
  'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'LLY',
  // Consumer
  'WMT', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'DIS', 'HD', 'SBUX', 'TGT', 'LOW',
  // Industrial
  'BA', 'CAT', 'GE', 'MMM', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'DE',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'PSX', 'VLO',
  // Telecommunications
  'T', 'VZ', 'TMUS', 'CMCSA',
  // Real Estate
  'AMT', 'PLD', 'CCI', 'EQIX', 'PSA',
  // Materials
  'LIN', 'APD', 'ECL', 'DD', 'NEM',
  // Popular ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'VGT', 'XLK', 'XLF', 'XLE',
  // Emerging Tech
  'PLTR', 'SNOW', 'NET', 'CRWD', 'DDOG', 'ZS', 'CFLT', 'MDB', 'GTLB',
  // Electric Vehicles
  'RIVN', 'LCID', 'NIO', 'XPEV',
  // Semiconductors
  'TSM', 'ASML', 'QCOM', 'TXN', 'AMAT', 'KLAC', 'LRCX', 'MU',
  // Gaming
  'ATVI', 'EA', 'TTWO', 'RBLX', 'U',
  // Fintech
  'SQ', 'PYPL', 'COIN', 'AFRM', 'SOFI',
  // Travel
  'MAR', 'HLT', 'ABNB', 'BKNG', 'UAL', 'DAL', 'AAL', 'CCL', 'RCL'
];

async function checkNewListings(): Promise<void> {
  try {
    log('Checking for new listings...', 'newListings');
    const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
    if (!symbolsData) return;

    // Get all active stocks from database
    const activeStocks = await storage.getActiveStocks();
    const knownSymbols = new Set(activeStocks.map(s => s.symbol));

    // Find new listings
    const newListings = symbolsData
      .filter((stock: any) => stock.type === 'Common Stock' && !knownSymbols.has(stock.symbol))
      .map((stock: any) => stock.symbol);

    if (newListings.length > 0) {
      log(`Found ${newListings.length} new listings`, 'newListings');
      // Process new listings
      for (const symbol of newListings.slice(0, 100)) { // Limit to first 100 new listings
        await fetchStockData(symbol);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    log('Finished checking new listings', 'newListings');
  } catch (error) {
    log(`Error checking new listings: ${error}`, 'newListings');
  }
}

async function initializeStocks(): Promise<void> {
  try {
    log('Initializing stock database...', 'init');
    let initializedCount = 0;
    for (const symbol of INITIAL_STOCKS) {
      const stockData = await fetchStockData(symbol);
      if (stockData) {
        await storage.upsertStock({
          ...stockData,
          firstListed: new Date(),
          isActive: true,
          isFavorite: false
        });
        log(`Initialized ${symbol}`, 'init');
        initializedCount++;
      }
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
    log(`Stock database initialized with ${initializedCount} stocks`, 'init');
  } catch (error) {
    log(`Error initializing stocks: ${error}`, 'init');
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false
  });

  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    log('Client connected', 'websocket');
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      log('Client disconnected', 'websocket');
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
    });

    // Send initial stock data
    storage.getActiveStocks().then(stocks => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'initial_data',
          data: stocks
        }));
      }
    }).catch(error => {
      log(`Error sending initial data: ${error}`, 'websocket');
    });
  });

  // Initialize database with some stocks if empty
  const stocks = await storage.getActiveStocks();
  if (stocks.length === 0) {
    await initializeStocks();
  }

  // Start checking for new listings
  checkNewListings();
  setInterval(checkNewListings, CHECK_NEW_LISTINGS_INTERVAL);

  // Update stock data periodically
  setInterval(async () => {
    const stocks = await storage.getActiveStocks();
    for (const stock of stocks) {
      if (new Date(stock.nextUpdate) <= new Date()) {
        const updatedStock = await fetchStockData(stock.symbol);
        if (updatedStock && clients.size > 0) {
          const message = JSON.stringify({
            type: 'stock_update',
            data: updatedStock
          });
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          }
        }
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // API routes
  app.get("/api/stocks/search", async (req: any, res: any) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const search = req.query.search?.toLowerCase();

      log('Starting stock search...', 'search');

      // Get stocks from database
      let stocks = await storage.getActiveStocks();

      // If searching for a specific stock that's not in our database, try to fetch it
      if (search && search.length >= 1 && !stocks.some(s =>
        s.symbol.toLowerCase() === search.toLowerCase() ||
        s.symbol.toLowerCase().includes(search.toLowerCase())
      )) {
        const newStockData = await fetchStockData(search.toUpperCase());
        if (newStockData) {
          stocks = [newStockData, ...stocks];
          log(`Added new stock ${search.toUpperCase()} to results`, 'search');
        }
      }


      // Calculate pagination
      const total = stocks.length;
      const startIndex = (page - 1) * limit;
      const endIndex = Math.min(startIndex + limit, total);
      const paginatedStocks = stocks.slice(startIndex, endIndex);

      log(`Sending ${paginatedStocks.length} stocks`, 'search');
      res.json({
        stocks: paginatedStocks,
        hasMore: endIndex < total,
        total
      });
    } catch (error) {
      log(`Search failed: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch stocks' });
    }
  });

  app.get("/api/finnhub/spacs", async (_req: any, res: any) => {
    try {
      const symbolsData = await finnhubRequest('/stock/symbol?exchange=US');
      if (!symbolsData) throw new Error('Failed to fetch SPAC data');

      // Filter for potential SPACs
      const spacSymbols = symbolsData
        .filter((stock: any) => {
          const symbol = stock.symbol.toUpperCase();
          const description = (stock.description || '').toUpperCase();
          return (
            symbol.endsWith('U') ||
            symbol.includes('SPAC') ||
            symbol.includes('ACQ') ||
            description.includes('SPAC') ||
            description.includes('ACQUISITION') ||
            description.includes('BLANK CHECK')
          );
        })
        .map((stock: any) => stock.symbol);

      log(`Found ${spacSymbols.length} potential SPACs`, 'spac');

      // Get SPAC data
      const spacs = [];
      for (const symbol of spacSymbols.slice(0, 50)) { // Limit to first 50 to avoid rate limits
        const stockData = await storage.getStockBySymbol(symbol);
        if (stockData) {
          spacs.push({
            ...stockData,
            status: 'Pre-merger',
            trustValue: Math.floor(Math.random() * 500 + 100) * 1e6, // Random trust value for demo
            targetCompany: null
          });
        } else {
          const newStockData = await fetchStockData(symbol);
          if (newStockData) {
            spacs.push({
              ...newStockData,
              status: 'Pre-merger',
              trustValue: Math.floor(Math.random() * 500 + 100) * 1e6,
              targetCompany: null
            });
          }
        }
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }

      res.json(spacs);
    } catch (error) {
      log(`SPAC list error: ${error}`, 'error');
      res.status(500).json({ error: 'Failed to fetch SPAC list' });
    }
  });

  return httpServer;
}

function isStockAvailableOnPlatform(symbol: string, platform: string): boolean {
  return true; // For demo purposes, assume all stocks are available on all platforms
}