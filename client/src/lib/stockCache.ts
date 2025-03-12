import { z } from "zod";
import Dexie from 'dexie';

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

class StockDatabase extends Dexie {
  stocks!: Dexie.Table<CachedStock, string>;
  favorites!: Dexie.Table<{ symbol: string }, string>;

  constructor() {
    super('StockDatabase');
    this.version(1).stores({
      stocks: 'symbol',
      favorites: 'symbol'
    });
  }
}

class StockCache {
  private readonly db: StockDatabase;
  private static instance: StockCache;

  private constructor() {
    this.db = new StockDatabase();
  }

  static getInstance(): StockCache {
    if (!StockCache.instance) {
      StockCache.instance = new StockCache();
    }
    return StockCache.instance;
  }

  async updateStock(stock: CachedStock): Promise<void> {
    try {
      const isFavorite = await this.db.favorites.get(stock.symbol) !== undefined;
      const validatedData = stockCacheSchema.parse({
        ...stock,
        isFavorite
      });
      await this.db.stocks.put(validatedData);
    } catch (error) {
      console.error(`Failed to update stock ${stock.symbol}:`, error);
    }
  }

  async updateStocks(stocks: CachedStock[]): Promise<void> {
    try {
      const favorites = await this.db.favorites.toArray();
      const favoriteSet = new Set(favorites.map(f => f.symbol));

      const validatedStocks = stocks.map(stock => ({
        ...stock,
        isFavorite: favoriteSet.has(stock.symbol)
      }));

      await this.db.stocks.bulkPut(validatedStocks);
    } catch (error) {
      console.error('Failed to update stocks:', error);
    }
  }

  async getStock(symbol: string): Promise<CachedStock | null> {
    try {
      const stock = await this.db.stocks.get(symbol);
      if (stock) {
        const isFavorite = await this.db.favorites.get(symbol) !== undefined;
        return { ...stock, isFavorite };
      }
      return null;
    } catch (error) {
      console.error(`Failed to get stock ${symbol}:`, error);
      return null;
    }
  }

  async getAllStocks(): Promise<CachedStock[]> {
    try {
      const stocks = await this.db.stocks.toArray();
      const favorites = await this.db.favorites.toArray();
      const favoriteSet = new Set(favorites.map(f => f.symbol));

      return stocks.map(stock => ({
        ...stock,
        isFavorite: favoriteSet.has(stock.symbol)
      }));
    } catch (error) {
      console.error('Failed to get all stocks:', error);
      return [];
    }
  }

  async getFavorites(): Promise<CachedStock[]> {
    try {
      const favorites = await this.db.favorites.toArray();
      const favoriteSymbols = new Set(favorites.map(f => f.symbol));
      const stocks = await this.db.stocks.toArray();
      return stocks
        .filter(stock => favoriteSymbols.has(stock.symbol))
        .map(stock => ({ ...stock, isFavorite: true }));
    } catch (error) {
      console.error('Failed to get favorites:', error);
      return [];
    }
  }

  async toggleFavorite(symbol: string): Promise<boolean> {
    try {
      const stock = await this.db.stocks.get(symbol);
      if (!stock) {
        console.error(`Stock ${symbol} not found`);
        return false;
      }

      const existingFavorite = await this.db.favorites.get(symbol);
      if (existingFavorite) {
        await this.db.favorites.delete(symbol);
      } else {
        await this.db.favorites.put({ symbol });
      }

      const newStatus = !existingFavorite;
      await this.db.stocks.update(symbol, { isFavorite: newStatus });

      return newStatus;
    } catch (error) {
      console.error(`Failed to toggle favorite for ${symbol}:`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const favorites = await this.db.favorites.toArray();
      await this.db.stocks.clear();
      await this.db.favorites.clear();
      if (favorites.length > 0) {
        await this.db.favorites.bulkPut(favorites);
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

export const stockCache = StockCache.getInstance();