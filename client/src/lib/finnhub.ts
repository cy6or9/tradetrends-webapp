import { z } from "zod";

// Cache manager for all API data
class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, any>;
  private readonly CACHE_TTL = 60000; // 1 minute TTL

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
    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }

  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      console.log(`Cache expired for ${key}`);
      return null;
    }
    return item.data;
  }

  getAll(): any[] {
    return Array.from(this.cache.values())
      .filter(item => Date.now() - item.timestamp <= this.CACHE_TTL)
      .map(item => item.data);
  }
}

const cacheManager = CacheManager.getInstance();

// API Functions
export async function getAllUsStocks(): Promise<Stock[]> {
  try {
    console.log('Fetching US stocks...');

    // Check cache first
    const cachedStocks = cacheManager.getAll();
    if (cachedStocks.length > 0) {
      console.log(`Using ${cachedStocks.length} cached stocks`);
      return cachedStocks;
    }

    const response = await fetch('/api/stocks/search');
    if (!response.ok) {
      throw new Error(`Failed to fetch stocks: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} stocks`);

    // Cache each stock individually
    data.forEach((stock: Stock) => {
      cacheManager.set(`stock_${stock.symbol}`, stock);
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
    const cachedQuote = cacheManager.get(`crypto_${symbol}`);
    if (cachedQuote) {
      console.log(`Using cached data for ${symbol}`);
      return cachedQuote;
    }

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const response = await fetch(
      `/api/finnhub/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${oneDayAgo}&to=${now}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.s === 'no_data' || !Array.isArray(data.c) || data.c.length === 0) {
      return null;
    }

    const quote: CryptoQuote = {
      c: data.c[data.c.length - 1],
      h: Math.max(...data.h),
      l: Math.min(...data.l),
      o: data.o[0],
      pc: data.o[0],
      t: data.t[data.t.length - 1]
    };

    cacheManager.set(`crypto_${symbol}`, quote);
    return quote;
  } catch (error) {
    console.error(`Error fetching crypto quote for ${symbol}:`, error);
    return cacheManager.get(`crypto_${symbol}`);
  }
}

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  try {
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
    const ipoEvents = data.ipoCalendar || [];

    cacheManager.set('ipo_calendar', ipoEvents);
    return ipoEvents;
  } catch (error) {
    console.error('Error fetching IPO calendar:', error);
    return cacheManager.get('ipo_calendar') || [];
  }
}

export async function getSpacList(): Promise<Spac[]> {
  try {
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
    const spacs = await Promise.all(
      symbols
        .filter((s: any) =>
          s.type === 'SPAC' ||
          s.description?.toLowerCase().includes('spac') ||
          s.description?.toLowerCase().includes('acquisition')
        )
        .map(async (spac: any) => {
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

    const validSpacs = spacs.filter((s): s is Spac => s !== null);
    cacheManager.set('spac_list', validSpacs);
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

// Schema definitions
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

const API_BASE_URL = 'https://finnhub.io/api/v1';

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