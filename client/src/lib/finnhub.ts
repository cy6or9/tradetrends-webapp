import { z } from "zod";

export interface CachedStock {
  symbol: string;
  lastPrice: number;
  lastUpdate: string;
  data: Stock;
}

class StockCache {
  private cache: Map<string, CachedStock> = new Map();
  private static instance: StockCache;

  private constructor() {}

  static getInstance(): StockCache {
    if (!StockCache.instance) {
      StockCache.instance = new StockCache();
    }
    return StockCache.instance;
  }

  updateStock(symbol: string, stockData: Stock) {
    const existingData = this.cache.get(symbol);

    const mergedData: Stock = {
      ...stockData,
      // Keep historical data if current data is missing
      price: (stockData.price && stockData.price > 0) ? stockData.price : (existingData?.data.price || 0),
      marketCap: stockData.marketCap || existingData?.data.marketCap || 0,
      high52Week: stockData.high52Week || existingData?.data.high52Week || 0,
      low52Week: stockData.low52Week || existingData?.data.low52Week || 0,
      beta: stockData.beta || existingData?.data.beta || 0,
      volume: stockData.volume || existingData?.data.volume || 0,
      change: stockData.change || 0,
      changePercent: stockData.changePercent || 0,
      isFavorite: existingData?.data.isFavorite || false,
      lastUpdate: new Date().toISOString()
    };

    this.cache.set(symbol, {
      symbol,
      lastPrice: (stockData.price && stockData.price > 0) ? stockData.price : (existingData?.lastPrice || 0),
      lastUpdate: new Date().toISOString(),
      data: mergedData
    });
  }

  getStock(symbol: string): Stock | null {
    const cached = this.cache.get(symbol);
    return cached ? cached.data : null;
  }

  getAllStocks(): Stock[] {
    return Array.from(this.cache.values())
      .map(cached => cached.data)
      .filter(stock => stock !== null);
  }

  clear() {
    this.cache.clear();
  }
}

export const stockCache = StockCache.getInstance();

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
}

// Constants for batch processing
const US_EXCHANGE_SYMBOLS = ['NYSE', 'NASDAQ'];
const BATCH_SIZE = 50; // Process in smaller batches
const RATE_LIMIT_DELAY = 500; // Increase delay between batches

// API Functions
export async function getAllUsStocks(): Promise<Stock[]> {
  try {
    console.log('Fetching US stocks...');
    const response = await fetch('/api/stocks/search');
    if (!response.ok) {
      console.error(`Failed to fetch stocks: ${response.status}`);
      return stockCache.getAllStocks();
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} stocks`);

    // Update cache with new data
    data.forEach((stock: Stock) => {
      stockCache.updateStock(stock.symbol, stock);
    });

    return data;
  } catch (error) {
    console.error('Error fetching US stocks:', error);
    // Return cached stocks if API fails
    return stockCache.getAllStocks();
  }
}

export async function getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  try {
    console.log(`Fetching crypto quote for ${symbol}...`);
    const response = await fetch(`/api/finnhub/crypto/candle?symbol=BINANCE:${symbol}USDT`);
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

export type CryptoQuote = {
  c: number; // Current price
  h: number; // High price
  l: number; // Low price
  o: number; // Open price
  pc: number; // Previous close price
  t: number; // Timestamp
};

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

export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;


export type IpoEvent = {
  symbol: string;
  name: string;
  date: string;
  price?: number;
  shares?: number;
  exchange: string;
  status: string;
};

export type Spac = {
  symbol: string;
  name: string;
  status: string;
  targetCompany?: string;
  trustValue: number;
  deadline?: string;
  exchange: string;
};

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