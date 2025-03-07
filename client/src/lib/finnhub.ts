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

// Utility function for API requests
async function makeRequest(endpoint: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Requesting ${endpoint} (attempt ${i + 1}/${retries})`);
      const response = await fetch(endpoint);

      if (!response.ok) {
        console.error(`Request failed: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Got response for ${endpoint}`);
      return data;
    } catch (error) {
      console.error(`Request failed: ${error}`);
      if (i < retries - 1) {
        const delay = RETRY_DELAY * Math.pow(2, i);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

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

    // Cache successful responses
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

function getFinnhubApiKey(): string {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found. Some features may not work.');
    return '';
  }
  return apiKey;
}