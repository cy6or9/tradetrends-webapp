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
  isFavorite: z.boolean().default(false)
});

class StockCache {
  private readonly CACHE_KEY = 'tradetrends_stock_cache';
  private readonly FAVORITES_KEY = 'tradetrends_favorites';
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
      // Load main cache
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

      // Load favorites
      const favorites = localStorage.getItem(this.FAVORITES_KEY);
      if (favorites) {
        const favoriteSymbols = JSON.parse(favorites) as string[];
        favoriteSymbols.forEach(symbol => {
          const stock = this.cache.get(symbol);
          if (stock) {
            stock.isFavorite = true;
            this.cache.set(symbol, stock);
          }
        });
      }
    } catch (error) {
      console.error('Failed to load stock cache:', error);
    }
  }

  private saveToStorage(): void {
    try {
      // Save main cache
      const cacheObj = Object.fromEntries(this.cache.entries());
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));

      // Save favorites separately
      const favorites = Array.from(this.cache.values())
        .filter(stock => stock.isFavorite)
        .map(stock => stock.symbol);
      localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error('Failed to save stock cache:', error);
    }
  }

  updateStock(stock: CachedStock): void {
    const existingStock = this.cache.get(stock.symbol);
    if (existingStock) {
      // Preserve favorite status and merge with new data
      stock.isFavorite = existingStock.isFavorite;
    }
    this.cache.set(stock.symbol, stock);
    this.saveToStorage();
  }

  updateStocks(stocks: CachedStock[]): void {
    let updated = false;
    stocks.forEach(stock => {
      const existingStock = this.cache.get(stock.symbol);
      if (existingStock) {
        // Preserve favorite status and merge with new data
        stock.isFavorite = existingStock.isFavorite;
      }
      this.cache.set(stock.symbol, stock);
      updated = true;
    });
    if (updated) {
      this.saveToStorage();
    }
  }

  getStock(symbol: string): CachedStock | null {
    return this.cache.get(symbol) || null;
  }

  getAllStocks(): CachedStock[] {
    return Array.from(this.cache.values());
  }

  getFavorites(): CachedStock[] {
    return Array.from(this.cache.values()).filter(stock => stock.isFavorite);
  }

  toggleFavorite(symbol: string): boolean {
    const stock = this.cache.get(symbol);
    if (stock) {
      stock.isFavorite = !stock.isFavorite;
      this.cache.set(symbol, stock);
      this.saveToStorage();
      return stock.isFavorite;
    }
    return false;
  }

  clear(): void {
    // Save favorites before clearing
    const favorites = this.getFavorites();

    // Clear the cache
    this.cache.clear();

    // Restore favorites
    favorites.forEach(stock => {
      this.cache.set(stock.symbol, stock);
    });

    // Save the updated cache
    this.saveToStorage();
  }
}

export const stockCache = StockCache.getInstance();