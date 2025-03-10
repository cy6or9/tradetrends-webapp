import { z } from "zod";

export interface CachedStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  beta: number;
  exchange: string;
  industry: string;
  sector: string | null;
  dayHigh: number | null;
  dayLow: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  outstandingShares: number | null;
  float: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  afterHoursPrice: number | null;
  afterHoursChange: number | null;
  isAfterHoursTrading: boolean;
  industryRank: number | null;
  analystRating: number;
  lastUpdate: string;
  nextUpdate: string;
  isFavorite: boolean;
}

const stockCacheSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  marketCap: z.number(),
  beta: z.number(),
  exchange: z.string(),
  industry: z.string(),
  sector: z.string().nullable(),
  dayHigh: z.number().nullable(),
  dayLow: z.number().nullable(),
  weekHigh52: z.number().nullable(),
  weekLow52: z.number().nullable(),
  outstandingShares: z.number().nullable(),
  float: z.number().nullable(),
  peRatio: z.number().nullable(),
  dividendYield: z.number().nullable(),
  afterHoursPrice: z.number().nullable(),
  afterHoursChange: z.number().nullable(),
  isAfterHoursTrading: z.boolean(),
  industryRank: z.number().nullable(),
  analystRating: z.number(),
  lastUpdate: z.string(),
  nextUpdate: z.string(),
  isFavorite: z.boolean()
});

class StockCache {
  private readonly CACHE_KEY = 'tradetrends_stock_cache';
  private cache: Map<string, CachedStock>;
  private static instance: StockCache;

  private constructor() {
    this.cache = new Map();
    this.loadFromStorage();
  }

  static getInstance(): StockCache {
    if (!StockCache.instance) {
      StockCache.instance = new StockCache();
    }
    return StockCache.instance;
  }

  private loadFromStorage(): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        Object.entries(parsed).forEach(([symbol, data]) => {
          try {
            const validatedData = stockCacheSchema.parse(data);
            this.cache.set(symbol, validatedData);
          } catch (error) {
            console.warn(`Invalid cached data for ${symbol}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to load stock cache:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const cacheObj = Object.fromEntries(this.cache.entries());
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));
    } catch (error) {
      console.error('Failed to save stock cache:', error);
    }
  }

  updateStock(stock: CachedStock): void {
    this.cache.set(stock.symbol, stock);
    this.saveToStorage();
  }

  updateStocks(stocks: CachedStock[]): void {
    stocks.forEach(stock => this.cache.set(stock.symbol, stock));
    this.saveToStorage();
  }

  getStock(symbol: string): CachedStock | null {
    const stock = this.cache.get(symbol);
    if (!stock) return null;

    // Check if the data is stale
    if (new Date(stock.nextUpdate) <= new Date()) {
      return null;
    }

    return stock;
  }

  getAllStocks(): CachedStock[] {
    const now = new Date();
    return Array.from(this.cache.values())
      .filter(stock => new Date(stock.nextUpdate) > now)
      .sort((a, b) => {
        // Sort by analyst rating (null values at the end)
        if (a.analystRating === null) return 1;
        if (b.analystRating === null) return -1;
        return b.analystRating - a.analystRating;
      });
  }

  clearStaleData(): void {
    const now = new Date();
    for (const [symbol, stock] of this.cache.entries()) {
      if (new Date(stock.nextUpdate) <= now) {
        this.cache.delete(symbol);
      }
    }
    this.saveToStorage();
  }
}

export const stockCache = StockCache.getInstance();