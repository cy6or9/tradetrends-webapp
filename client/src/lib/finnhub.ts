import { z } from "zod";

// Schema definitions
const stockQuoteSchema = z.object({
  c: z.number(), // Current price
  d: z.number(), // Change
  dp: z.number(), // Percent change
  h: z.number(), // High price of the day
  l: z.number(), // Low price of the day
  o: z.number(), // Open price of the day
  pc: z.number(), // Previous close price
  t: z.number(), // Timestamp
  v: z.number() //volume
});

const companyProfileSchema = z.object({
  marketCapitalization: z.number(),
  shareOutstanding: z.number(),
  beta: z.number().optional(),
  weekHigh52: z.number().optional(),
  weekLow52: z.number().optional(),
  weekHighDate52: z.string().optional(),
  weekLowDate52: z.string().optional(),
  industry: z.string().optional(),
  exchange: z.string(),
  companyName: z.string(),
  ticker: z.string(),
});

// Cache manager
class StockCacheManager {
  private data = new Map<string, Stock>();
  private static instance: StockCacheManager;

  private constructor() {}

  static getInstance(): StockCacheManager {
    if (!StockCacheManager.instance) {
      StockCacheManager.instance = new StockCacheManager();
    }
    return StockCacheManager.instance;
  }

  updateStock(symbol: string, updates: Partial<Stock>) {
    const existing = this.data.get(symbol);
    if (existing) {
      // Keep last known price if new price is 0 or undefined
      const price = updates.price || existing.price;
      this.data.set(symbol, { 
        ...existing, 
        ...updates,
        price,
        lastUpdate: new Date().toISOString() 
      });
    } else {
      this.data.set(symbol, { 
        ...updates as Stock, 
        lastUpdate: new Date().toISOString() 
      });
    }
  }

  getStock(symbol: string): Stock | null {
    return this.data.get(symbol) || null;
  }

  getAllStocks(): Stock[] {
    return Array.from(this.data.values())
      .sort((a, b) => {
        // Sort by last known price if currently not trading
        const aPrice = a.price || 0;
        const bPrice = b.price || 0;
        return bPrice - aPrice;
      });
  }
}

export const stockCache = StockCacheManager.getInstance();

// Types
export interface Stock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  high52Week: number;
  low52Week: number;
  beta: number;
  exchange: string;
  industry: string;
  isFavorite?: boolean;
  lastUpdate?: string;
  isActive?: boolean;
}

export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

// Constants for batch processing
const US_EXCHANGE_SYMBOLS = ['NYSE', 'NASDAQ'];
const BATCH_SIZE = 50; // Increased batch size
const RATE_LIMIT_DELAY = 250; // ms between batches

// API Functions
export async function getAllUsStocks(): Promise<Stock[]> {
  try {
    console.log('Fetching US stocks...');
    const symbols = await fetch('/api/finnhub/stock/symbol').then(res => res.json());

    const activeStocks = symbols
      .filter((stock: any) =>
        US_EXCHANGE_SYMBOLS.includes(stock.exchange) &&
        stock.type === 'Common Stock'
      );

    console.log(`Processing ${activeStocks.length} stocks...`);
    const stocks: Stock[] = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < activeStocks.length; i += BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (stock: any) => {
        try {
          // Check cache first
          const cachedStock = stockCache.getStock(stock.symbol);

          // Get quote and company profile in parallel
          const [quoteRes, profileRes] = await Promise.all([
            fetch(`/api/finnhub/quote?symbol=${stock.symbol}`),
            fetch(`/api/finnhub/stock/profile2?symbol=${stock.symbol}`)
          ]);

          const [quote, profile] = await Promise.all([
            quoteRes.json(),
            profileRes.json()
          ]);

          // Merge new data with cached data
          const stockData = {
            id: stock.symbol,
            symbol: stock.symbol,
            name: profile.companyName || stock.description,
            price: quote.c || cachedStock?.price || 0,
            change: quote.d || 0,
            changePercent: quote.dp || 0,
            volume: quote.v || 0,
            marketCap: profile.marketCapitalization * 1e6 || cachedStock?.marketCap || 0,
            high52Week: profile.weekHigh52 || cachedStock?.high52Week || 0,
            low52Week: profile.weekLow52 || cachedStock?.low52Week || 0,
            beta: profile.beta || cachedStock?.beta || 0,
            exchange: stock.exchange,
            industry: profile.industry || cachedStock?.industry || 'Unknown',
            isFavorite: cachedStock?.isFavorite || false,
            lastUpdate: new Date().toISOString(),
            isActive: Boolean(quote.c && quote.c > 0)
          };

          // Update cache
          stockCache.updateStock(stock.symbol, stockData);
          return stockData;

        } catch (error) {
          console.error(`Error processing ${stock.symbol}:`, error);
          // Return cached data if available, otherwise null
          return stockCache.getStock(stock.symbol);
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter((s): s is Stock => s !== null);
      stocks.push(...validResults);

      // Progress logging
      console.log(`Processed ${stocks.length}/${activeStocks.length} stocks`);

      // Rate limiting delay between batches
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    console.log(`Successfully processed ${stocks.length} stocks`);
    return stocks;
  } catch (error) {
    console.error('Error fetching US stocks:', error);
    // Return cached stocks if API fails
    return stockCache.getAllStocks();
  }
}

export async function getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  try {
    console.log(`Fetching crypto quote for ${symbol}...`);
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const response = await fetch(
      `/api/finnhub/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${oneDayAgo}&to=${now}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.s === 'no_data' || !Array.isArray(data.c)) {
      throw new Error(`No data available for ${symbol}`);
    }

    return {
      c: data.c[data.c.length - 1], // Current price
      h: Math.max(...data.h), // High price
      l: Math.min(...data.l), // Low price
      o: data.o[0], // Open price
      pc: data.o[0], // Previous close price
      t: data.t[data.t.length - 1] // Latest timestamp
    };
  } catch (error) {
    console.error(`Error fetching crypto quote for ${symbol}:`, error);
    return null;
  }
}

// Improved IPO and SPAC data schemas
const ipoEventSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  date: z.string(),
  price: z.number().optional(),
  shares: z.number().optional(),
  exchange: z.string(),
  status: z.string()
});

const spacSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  status: z.string(),
  targetCompany: z.string().optional(),
  trustValue: z.number(),
  deadline: z.string().optional(),
  exchange: z.string()
});

export type CryptoQuote = {
  c: number; // Current price
  h: number; // High price
  l: number; // Low price
  o: number; // Open price
  pc: number; // Previous close price
  t: number; // Timestamp
};

export type IpoEvent = z.infer<typeof ipoEventSchema>;
export type Spac = z.infer<typeof spacSchema>;

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  try {
    const response = await fetch('/api/finnhub/calendar/ipo');
    if (!response.ok) throw new Error('Failed to fetch IPO calendar');
    const data = await response.json();
    return data.ipoCalendar || [];
  } catch (error) {
    console.error('Error fetching IPO calendar:', error);
    return [];
  }
}

export async function getSpacList(): Promise<Spac[]> {
  try {
    const response = await fetch('/api/finnhub/stock/symbol?exchange=US');
    if (!response.ok) throw new Error('Failed to fetch SPAC list');

    const symbols = await response.json();
    const spacs = symbols.filter((s: any) =>
      s.type === 'SPAC' ||
      s.description?.toLowerCase().includes('spac') ||
      s.description?.toLowerCase().includes('acquisition')
    );

    const spacData = await Promise.all(
      spacs.map(async (spac: any) => {
        try {
          const profile = await fetch(`/api/finnhub/stock/profile2?symbol=${spac.symbol}`).then(res => res.json());
          return {
            symbol: spac.symbol,
            name: profile.name || spac.description,
            status: 'Active',
            trustValue: profile.marketCapitalization * 1e6 || 0,
            exchange: spac.exchange
          };
        } catch (error) {
          console.error(`Error fetching SPAC data for ${spac.symbol}:`, error);
          return null;
        }
      })
    );

    return spacData.filter((s): s is Spac => s !== null);
  } catch (error) {
    console.error('Error fetching SPAC list:', error);
    return [];
  }
}

const stockNewsSchema = z.object({});

export async function getStockNews(symbol: string): Promise<StockNews[]> {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return [];

  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);

    const response = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}` +
      `&from=${from.toISOString().split('T')[0]}` +
      `&to=${to.toISOString().split('T')[0]}` +
      `&token=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch news for ${symbol}`);
    }

    const data = await response.json();
    return z.array(stockNewsSchema).parse(data);
  } catch (error) {
    console.error('Error fetching stock news:', error);
    return [];
  }
}


function getFinnhubApiKey(): string {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found. Some features may not work.');
    return '';
  }
  return apiKey;
}

const cryptoCandleSchema = z.object({
  c: z.array(z.number()),
  h: z.array(z.number()),
  l: z.array(z.number()),
  o: z.array(z.number()),
  t: z.array(z.number()),
  s: z.string()
});

const stockSymbolSchema = z.object({
  currency: z.string(),
  description: z.string(),
  displaySymbol: z.string(),
  figi: z.string().optional(),
  isin: z.string().optional(),
  mic: z.string(),
  symbol: z.string(),
  type: z.string(),
  exchange: z.string(),
});

const recommendationSchema = z.object({
  buy: z.number(),
  hold: z.number(),
  period: z.string(),
  sell: z.number(),
  strongBuy: z.number(),
  strongSell: z.number(),
  symbol: z.string(),
});


export type StockNews = z.infer<typeof stockNewsSchema>;

const API_BASE_URL = 'https://finnhub.io/api/v1';