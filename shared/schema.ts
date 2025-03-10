import { pgTable, text, serial, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

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
  shortInterest: real("short_interest"),
  dividendYield: real("dividend_yield"),
  earningsDate: timestamp("earnings_date"),
  lastUpdate: timestamp("last_update").notNull().defaultNow(),
  nextUpdate: timestamp("next_update").notNull(),
});

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  notifyOnRating: boolean("notify_on_rating").default(false),
});

export const insertUserSchema = createInsertSchema(users);
export const insertStockSchema = createInsertSchema(stocks);
export const insertFavoriteSchema = createInsertSchema(favorites);

export type User = typeof users.$inferSelect;
export type Stock = typeof stocks.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertStock = z.infer<typeof insertStockSchema>;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;