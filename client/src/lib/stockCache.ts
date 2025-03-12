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
    this.version(4).stores({
      stocks: 'symbol,isFavorite'  // Keep schema simple, just index what we need
    });
  }
}

class StockCache {
  private readonly FAVORITES_KEY = 'tradetrends_favorites';
  private readonly db: StockDatabase;
  private static instance: StockCache;

  private constructor() {
    this.db = new StockDatabase();
    this.loadFavoritesFromStorage();
  }

  static getInstance(): StockCache {
    if (!StockCache.instance) {
      StockCache.instance = new StockCache();
    }
    return StockCache.instance;
  }

  private async loadFavoritesFromStorage(): Promise<void> {
    try {
      const favorites = localStorage.getItem(this.FAVORITES_KEY);
      if (favorites) {
        const favoriteSymbols = JSON.parse(favorites) as string[];
        // Update isFavorite flag in IndexedDB
        await Promise.all(
          favoriteSymbols.map(async (symbol) => {
            const stock = await this.db.stocks.get(symbol);
            if (stock) {
              await this.db.stocks.update(symbol, { ...stock, isFavorite: true });
            }
          })
        );
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  }

  private saveFavoritesToStorage(favorites: string[]): void {
    try {
      localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  }

  async updateStock(stock: CachedStock): Promise<void> {
    try {
      const validatedData = stockCacheSchema.parse(stock);
      const existingStock = await this.db.stocks.get(stock.symbol);

      // Merge with existing data, preserving favorite status
      const updatedStock = {
        ...validatedData,
        isFavorite: existingStock?.isFavorite || false
      };

      await this.db.stocks.put(updatedStock);
    } catch (error) {
      console.error(`Failed to update stock ${stock.symbol}:`, error);
    }
  }

  async updateStocks(stocks: CachedStock[]): Promise<void> {
    try {
      const existingStocks = await this.db.stocks.bulkGet(stocks.map(s => s.symbol));
      const validatedStocks = stocks.map((stock, index) => {
        const existingStock = existingStocks[index];
        const validatedData = stockCacheSchema.parse(stock);
        return {
          ...validatedData,
          isFavorite: existingStock?.isFavorite || false
        };
      });
      await this.db.stocks.bulkPut(validatedStocks);
    } catch (error) {
      console.error('Failed to update stocks:', error);
    }
  }

  async getStock(symbol: string): Promise<CachedStock | null> {
    try {
      const stock = await this.db.stocks.get(symbol);
      return stock || null;
    } catch (error) {
      console.error(`Failed to get stock ${symbol}:`, error);
      return null;
    }
  }

  async getAllStocks(): Promise<CachedStock[]> {
    try {
      return await this.db.stocks.toArray();
    } catch (error) {
      console.error('Failed to get all stocks:', error);
      return [];
    }
  }

  async getFavorites(): Promise<CachedStock[]> {
    try {
      const favorites = await this.db.stocks.where('isFavorite').equals(true).toArray();
      console.log('Retrieved favorites:', favorites.length, 'stocks');
      return favorites;
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

      const newFavoriteStatus = !stock.isFavorite;

      // Update the stock with new favorite status
      await this.db.stocks.update(symbol, {
        ...stock,
        isFavorite: newFavoriteStatus
      });

      console.log(`Toggled favorite for ${symbol} to ${newFavoriteStatus}`);

      // Update localStorage favorites
      const favorites = await this.getFavorites();
      const favoriteSymbols = favorites.map(s => s.symbol);
      this.saveFavoritesToStorage(favoriteSymbols);

      return newFavoriteStatus;
    } catch (error) {
      console.error(`Failed to toggle favorite for ${symbol}:`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      // Save favorites before clearing
      const favorites = await this.getFavorites();

      // Clear all stocks
      await this.db.stocks.clear();

      // Restore favorites
      await this.updateStocks(favorites);

      // Update localStorage
      const favoriteSymbols = favorites.map(s => s.symbol);
      this.saveFavoritesToStorage(favoriteSymbols);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  async removeExpired(): Promise<void> {
    try {
      const now = new Date();
      const stocks = await this.getAllStocks();
      const expiredStocks = stocks.filter(stock => 
        new Date(stock.nextUpdate) < now && !stock.isFavorite
      );

      if (expiredStocks.length > 0) {
        await this.db.stocks.bulkDelete(expiredStocks.map(s => s.symbol));
      }
    } catch (error) {
      console.error('Failed to remove expired stocks:', error);
    }
  }
}

export const stockCache = StockCache.getInstance();