import { z } from "zod";

// Constants
const CACHE_TTL = 60000; // 1 minute TTL
const RETRY_DELAY = 2000; // 2 seconds between retries

// Cache manager
class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, any>;

  private constructor() {
    this.cache = new Map();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  set(key: string, value: any) {
    console.log(`Caching data for ${key}`);
    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }

  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_TTL) {
      console.log(`Cache expired for ${key}`);
      return null;
    }
    console.log(`Cache hit for ${key}`);
    return item.data;
  }

  getAll(): any[] {
    return Array.from(this.cache.values())
      .filter(item => Date.now() - item.timestamp <= CACHE_TTL)
      .map(item => item.data);
  }
}

const cacheManager = CacheManager.getInstance();

// API Functions
export async function getAllUsStocks(): Promise<Stock[]> {
  try {
    console.log('Fetching US stocks...');
    const response = await fetch('/api/stocks/search');

    if (!response.ok) {
      console.error(`Failed to fetch stocks: ${response.status}`);
      const cachedStocks = cacheManager.getAll();
      if (cachedStocks.length > 0) {
        console.log(`Using ${cachedStocks.length} cached stocks`);
        return cachedStocks;
      }
      throw new Error(`Failed to fetch stocks: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} stocks`);

    if (!Array.isArray(data)) {
      console.error('Invalid response format');
      return [];
    }

    data.forEach((stock: Stock) => {
      if (stock && stock.symbol) {
        cacheManager.set(`stock_${stock.symbol}`, stock);
      }
    });

    return data;
  } catch (error) {
    console.error('Error fetching US stocks:', error);
    return cacheManager.getAll();
  }
}

export async function getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  try {
    console.log(`Fetching crypto quote for ${symbol}...`);

    // Check cache first
    const cacheKey = `crypto_${symbol}`;
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData) {
      console.log(`Using cached crypto data for ${symbol}`);
      return cachedData;
    }

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400; // 24 hours ago

    const response = await fetch(
      `/api/finnhub/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${oneDayAgo}&to=${now}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.s === 'no_data' || !Array.isArray(data.c) || data.c.length === 0) {
      console.warn(`No valid data available for ${symbol}`);
      return null;
    }

    const quote: CryptoQuote = {
      c: data.c[data.c.length - 1], // Current price
      h: Math.max(...data.h), // High price
      l: Math.min(...data.l), // Low price
      o: data.o[0], // Open price
      pc: data.o[0], // Previous close price
      t: data.t[data.t.length - 1], // Latest timestamp
      change: 0,
      changePercent: 0
    };

    // Calculate change and percent change
    quote.change = quote.c - quote.o;
    quote.changePercent = (quote.change / quote.o) * 100;

    // Cache the successful response
    cacheManager.set(cacheKey, quote);
    return quote;
  } catch (error) {
    console.error(`Error fetching crypto quote for ${symbol}:`, error);
    return cacheManager.get(`crypto_${symbol}`);
  }
}

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  try {
    console.log('Fetching IPO calendar...');
    const cachedData = cacheManager.get('ipo_calendar');
    if (cachedData) {
      console.log('Using cached IPO calendar');
      return cachedData;
    }

    const response = await fetch('/api/finnhub/calendar/ipo');
    if (!response.ok) {
      throw new Error('Failed to fetch IPO calendar');
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      console.warn('Invalid IPO calendar format');
      return [];
    }

    console.log(`Fetched ${data.length} IPO events`);
    cacheManager.set('ipo_calendar', data);
    return data;

  } catch (error) {
    console.error('Error fetching IPO calendar:', error);
    // Return empty array instead of null to prevent UI errors
    return [];
  }
}

export async function getSpacList(): Promise<Spac[]> {
  try {
    console.log('Fetching SPAC list...');
    const cachedData = cacheManager.get('spac_list');
    if (cachedData) {
      console.log('Using cached SPAC list');
      return cachedData;
    }

    const response = await fetch('/api/finnhub/stock/symbol?exchange=US');
    if (!response.ok) {
      throw new Error('Failed to fetch SPAC list');
    }

    const symbols = await response.json();
    if (!Array.isArray(symbols)) {
      throw new Error('Invalid symbols response format');
    }

    console.log(`Processing ${symbols.length} symbols for SPACs`);

    const spacs = await Promise.all(
      symbols
        .filter((s: any) =>
          s.type === 'SPAC' ||
          s.description?.toLowerCase().includes('spac') ||
          s.description?.toLowerCase().includes('acquisition')
        )
        .slice(0, 50) // Limit to 50 SPACs to avoid rate limits
        .map(async (spac: any) => {
          try {
            const response = await fetch(`/api/finnhub/stock/profile2?symbol=${spac.symbol}`);
            if (!response.ok) {
              throw new Error(`Failed to fetch SPAC profile: ${response.status}`);
            }
            const profile = await response.json();
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

    const validSpacs = spacs.filter((s): s is Spac => s !== null);
    console.log(`Found ${validSpacs.length} valid SPACs`);

    if (validSpacs.length > 0) {
      cacheManager.set('spac_list', validSpacs);
    }

    return validSpacs;
  } catch (error) {
    console.error('Error fetching SPAC list:', error);
    return cacheManager.get('spac_list') || [];
  }
}

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
  beta: number;
  exchange: string;
  industry: string;
  isFavorite?: boolean;
  lastUpdate?: string;
}

export type CryptoQuote = {
  c: number; // Current price
  h: number; // High price
  l: number; // Low price
  o: number; // Open price
  pc: number; // Previous close price
  t: number; // Timestamp
  change: number; // Price change
  changePercent: number; // Percentage change
};

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
  exchange: string;
};

// Schemas
const stockQuoteSchema = z.object({
  c: z.number(),
  d: z.number(),
  dp: z.number(),
  h: z.number(),
  l: z.number(),
  o: z.number(),
  pc: z.number(),
  t: z.number()
});

const cryptoCandleSchema = z.object({
  c: z.array(z.number()),
  h: z.array(z.number()),
  l: z.array(z.number()),
  o: z.array(z.number()),
  t: z.array(z.number()),
  s: z.string()
});

export type StockQuote = z.infer<typeof stockQuoteSchema>;

const stockNewsSchema = z.object({});

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

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export type StockNews = {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
};

function getFinnhubApiKey(): string {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found. Some features may not work.');
    return '';
  }
  return apiKey;
}
const API_BASE_URL = 'https://finnhub.io/api/v1';