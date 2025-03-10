import { db } from "./db";
import { eq, and, gt, desc } from "drizzle-orm";
import { stocks, favorites, users, type Stock, type Favorite, type User, type InsertStock, type InsertFavorite, type InsertUser } from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Stocks
  getStocks(): Promise<Stock[]>;
  getStock(id: number): Promise<Stock | undefined>;
  getStockBySymbol(symbol: string): Promise<Stock | undefined>;
  upsertStock(stock: InsertStock): Promise<Stock>;
  updateStockPrice(id: number, price: number, changePercent: number): Promise<Stock>;
  getNewListings(since: Date): Promise<Stock[]>;
  getActiveStocks(): Promise<Stock[]>;

  // Favorites
  getFavorites(userId: number): Promise<Favorite[]>;
  addFavorite(favorite: InsertFavorite): Promise<Favorite>;
  removeFavorite(userId: number, stockId: number): Promise<void>;
  updateFavoriteNotifications(userId: number, stockId: number, notify: boolean): Promise<Favorite>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getStocks(): Promise<Stock[]> {
    return db.select().from(stocks).where(eq(stocks.isActive, true));
  }

  async getStock(id: number): Promise<Stock | undefined> {
    const [stock] = await db.select().from(stocks).where(eq(stocks.id, id));
    return stock;
  }

  async getStockBySymbol(symbol: string): Promise<Stock | undefined> {
    const [stock] = await db.select().from(stocks).where(eq(stocks.symbol, symbol));
    return stock;
  }

  async upsertStock(insertStock: InsertStock): Promise<Stock> {
    const existing = await this.getStockBySymbol(insertStock.symbol);

    if (existing) {
      const [updated] = await db
        .update(stocks)
        .set({
          ...insertStock,
          lastUpdate: new Date(),
          nextUpdate: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        })
        .where(eq(stocks.symbol, insertStock.symbol))
        .returning();
      return updated;
    }

    const [stock] = await db
      .insert(stocks)
      .values({
        ...insertStock,
        firstListed: new Date(),
        lastUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 5 * 60 * 1000),
        isActive: true,
      })
      .returning();
    return stock;
  }

  async updateStockPrice(id: number, price: number, changePercent: number): Promise<Stock> {
    const [updated] = await db
      .update(stocks)
      .set({
        price,
        changePercent,
        lastUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 5 * 60 * 1000),
      })
      .where(eq(stocks.id, id))
      .returning();
    return updated;
  }

  async getNewListings(since: Date): Promise<Stock[]> {
    return db
      .select()
      .from(stocks)
      .where(
        and(
          eq(stocks.isActive, true),
          gt(stocks.firstListed, since)
        )
      )
      .orderBy(desc(stocks.firstListed));
  }

  async getActiveStocks(): Promise<Stock[]> {
    return db
      .select()
      .from(stocks)
      .where(eq(stocks.isActive, true))
      .orderBy(desc(stocks.lastUpdate));
  }

  async getFavorites(userId: number): Promise<Favorite[]> {
    return db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, userId));
  }

  async addFavorite(insertFavorite: InsertFavorite): Promise<Favorite> {
    const [favorite] = await db
      .insert(favorites)
      .values(insertFavorite)
      .returning();
    return favorite;
  }

  async removeFavorite(userId: number, stockId: number): Promise<void> {
    await db
      .delete(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.stockId, stockId)
        )
      );
  }

  async updateFavoriteNotifications(userId: number, stockId: number, notify: boolean): Promise<Favorite> {
    const [updated] = await db
      .update(favorites)
      .set({ notifyOnRating: notify })
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.stockId, stockId)
        )
      )
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();