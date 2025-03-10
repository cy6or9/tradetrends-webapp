import { pgTable, text, serial, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  price: real("price").notNull(),
  changePercent: real("change_percent").notNull(),
  analystRating: real("analyst_rating").notNull(),
  volume: integer("volume").notNull(),
  marketCap: real("market_cap").notNull(),
  beta: real("beta").notNull(),
  exchange: text("exchange").notNull(),
  industry: text("industry").notNull(),
  sector: text("sector"),
  // New fields for enhanced stock data
  dayHigh: real("day_high"),
  dayLow: real("day_low"),
  weekHigh52: real("week_high_52"),
  weekLow52: real("week_low_52"),
  outstandingShares: real("outstanding_shares"),
  float: real("float"),
  peRatio: real("pe_ratio"),
  dividendYield: real("dividend_yield"),
  afterHoursPrice: real("after_hours_price"),
  afterHoursChange: real("after_hours_change"),
  isAfterHoursTrading: boolean("is_after_hours_trading"),
  industryRank: integer("industry_rank"),
  earningsDate: timestamp("earnings_date"),
  lastUpdate: timestamp("last_update").notNull().defaultNow(),
  nextUpdate: timestamp("next_update").notNull(),
  firstListed: timestamp("first_listed").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  cached_data: text("cached_data"), // JSON string of additional data
});

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  notifyOnRating: boolean("notify_on_rating").default(false),
});

export const customLists = pgTable("custom_lists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const listStocks = pgTable("list_stocks", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => customLists.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertStockSchema = createInsertSchema(stocks);
export const insertFavoriteSchema = createInsertSchema(favorites);
export const insertUserSchema = createInsertSchema(users);
export const insertCustomListSchema = createInsertSchema(customLists);
export const insertListStockSchema = createInsertSchema(listStocks);

export type Stock = typeof stocks.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type User = typeof users.$inferSelect;
export type CustomList = typeof customLists.$inferSelect;
export type ListStock = typeof listStocks.$inferSelect;
export type InsertStock = z.infer<typeof insertStockSchema>;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCustomList = z.infer<typeof insertCustomListSchema>;
export type InsertListStock = z.infer<typeof insertListStockSchema>;