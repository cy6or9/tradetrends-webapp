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

  constructor() {
    super('StockDatabase');
    this.version(1).stores({
      stocks: 'symbol'
    });
  }
}

class StockCache {
  private readonly FAVORITES_KEY = 'tradetrends_favorites';
  private readonly db: StockDatabase;
  private static instance: StockCache;
  private favorites: Set<string>;

  private constructor() {
    this.db = new StockDatabase();
    this.favorites = new Set();
    this.loadFavoritesFromStorage();
  }

  static getInstance(): StockCache {
    if (!StockCache.instance) {
      StockCache.instance = new StockCache();
    }
    return StockCache.instance;
  }

  private loadFavoritesFromStorage(): void {
    try {
      const favorites = localStorage.getItem(this.FAVORITES_KEY);
      if (favorites) {
        this.favorites = new Set(JSON.parse(favorites));
      }
    } catch (error) {
      console.error('Failed to load favorites from storage:', error);
      this.favorites = new Set();
    }
  }

  private saveFavoritesToStorage(): void {
    try {
      localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(Array.from(this.favorites)));
    } catch (error) {
      console.error('Failed to save favorites to storage:', error);
    }
  }

  async updateStock(stock: CachedStock): Promise<void> {
    try {
      const validatedData = stockCacheSchema.parse({
        ...stock,
        isFavorite: this.favorites.has(stock.symbol)
      });
      await this.db.stocks.put(validatedData);
    } catch (error) {
      console.error(`Failed to update stock ${stock.symbol}:`, error);
    }
  }

  async updateStocks(stocks: CachedStock[]): Promise<void> {
    try {
      const validatedStocks = stocks.map(stock => ({
        ...stock,
        isFavorite: this.favorites.has(stock.symbol)
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
        stock.isFavorite = this.favorites.has(symbol);
      }
      return stock || null;
    } catch (error) {
      console.error(`Failed to get stock ${symbol}:`, error);
      return null;
    }
  }

  async getAllStocks(): Promise<CachedStock[]> {
    try {
      const stocks = await this.db.stocks.toArray();
      return stocks.map(stock => ({
        ...stock,
        isFavorite: this.favorites.has(stock.symbol)
      }));
    } catch (error) {
      console.error('Failed to get all stocks:', error);
      return [];
    }
  }

  async getFavorites(): Promise<CachedStock[]> {
    try {
      const stocks = await this.getAllStocks();
      return stocks
        .filter(stock => this.favorites.has(stock.symbol))
        .map(stock => ({
          ...stock,
          isFavorite: true
        }));
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

      if (this.favorites.has(symbol)) {
        this.favorites.delete(symbol);
      } else {
        this.favorites.add(symbol);
      }

      await this.db.stocks.put({
        ...stock,
        isFavorite: this.favorites.has(symbol)
      });

      this.saveFavoritesToStorage();
      return this.favorites.has(symbol);
    } catch (error) {
      console.error(`Failed to toggle favorite for ${symbol}:`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const favoriteStocks = await this.getFavorites();
      await this.db.stocks.clear();
      if (favoriteStocks.length > 0) {
        await this.updateStocks(favoriteStocks);
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

export const stockCache = StockCache.getInstance();