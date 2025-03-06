import { users, stocks, favorites, type User, type Stock, type Favorite, type InsertUser, type InsertStock, type InsertFavorite } from "@shared/schema";

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

  // Favorites
  getFavorites(userId: number): Promise<Favorite[]>;
  addFavorite(favorite: InsertFavorite): Promise<Favorite>;
  removeFavorite(userId: number, stockId: number): Promise<void>;
  updateFavoriteNotifications(userId: number, stockId: number, notify: boolean): Promise<Favorite>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private stocks: Map<number, Stock>;
  private favorites: Map<number, Favorite>;
  private currentIds: { [key: string]: number };

  constructor() {
    this.users = new Map();
    this.stocks = new Map();
    this.favorites = new Map();
    this.currentIds = { users: 1, stocks: 1, favorites: 1 };
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getStocks(): Promise<Stock[]> {
    return Array.from(this.stocks.values());
  }

  async getStock(id: number): Promise<Stock | undefined> {
    return this.stocks.get(id);
  }

  async getStockBySymbol(symbol: string): Promise<Stock | undefined> {
    return Array.from(this.stocks.values()).find(
      (stock) => stock.symbol === symbol,
    );
  }

  async upsertStock(insertStock: InsertStock): Promise<Stock> {
    const existing = await this.getStockBySymbol(insertStock.symbol);
    if (existing) {
      const updated = { ...existing, ...insertStock };
      this.stocks.set(existing.id, updated);
      return updated;
    }
    
    const id = this.currentIds.stocks++;
    const stock = { ...insertStock, id };
    this.stocks.set(id, stock);
    return stock;
  }

  async updateStockPrice(id: number, price: number, changePercent: number): Promise<Stock> {
    const stock = await this.getStock(id);
    if (!stock) throw new Error(`Stock ${id} not found`);
    
    const updated = { 
      ...stock, 
      price, 
      changePercent,
      lastUpdated: new Date()
    };
    this.stocks.set(id, updated);
    return updated;
  }

  async getFavorites(userId: number): Promise<Favorite[]> {
    return Array.from(this.favorites.values()).filter(
      (fav) => fav.userId === userId,
    );
  }

  async addFavorite(insertFavorite: InsertFavorite): Promise<Favorite> {
    const id = this.currentIds.favorites++;
    const favorite = { ...insertFavorite, id };
    this.favorites.set(id, favorite);
    return favorite;
  }

  async removeFavorite(userId: number, stockId: number): Promise<void> {
    const favorite = Array.from(this.favorites.values()).find(
      (fav) => fav.userId === userId && fav.stockId === stockId,
    );
    if (favorite) {
      this.favorites.delete(favorite.id);
    }
  }

  async updateFavoriteNotifications(userId: number, stockId: number, notify: boolean): Promise<Favorite> {
    const favorite = Array.from(this.favorites.values()).find(
      (fav) => fav.userId === userId && fav.stockId === stockId,
    );
    if (!favorite) throw new Error("Favorite not found");
    
    const updated = { ...favorite, notifyOnRating: notify };
    this.favorites.set(favorite.id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
