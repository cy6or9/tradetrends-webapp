import { z } from "zod";

export interface CachedStock {
  symbol: string;
  lastPrice: number;
  lastUpdate: string;
  analystRating: number | null;
}

const stockCacheSchema = z.object({
  symbol: z.string(),
  lastPrice: z.number(),
  lastUpdate: z.string(),
  analystRating: z.number().nullable()
});

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

  updateStock(symbol: string, price: number, analystRating?: number | null) {
    const existingData = this.cache.get(symbol);
    this.cache.set(symbol, {
      symbol,
      lastPrice: price,
      lastUpdate: new Date().toISOString(),
      analystRating: analystRating ?? existingData?.analystRating ?? null
    });
  }

  getStock(symbol: string): CachedStock | null {
    return this.cache.get(symbol) || null;
  }

  getAllStocks(): CachedStock[] {
    return Array.from(this.cache.values())
      .sort((a, b) => {
        // Sort by analyst rating (null values at the end)
        if (a.analystRating === null) return 1;
        if (b.analystRating === null) return -1;
        return b.analystRating - a.analystRating;
      });
  }
}

export const stockCache = StockCache.getInstance();
