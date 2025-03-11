import { pgTable, text, serial, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Existing stock-related tables remain unchanged
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
  city: text("city"),
  state: text("state"),
  country: text("country"),
  lastUpdate: timestamp("last_update").notNull().defaultNow(),
  nextUpdate: timestamp("next_update").notNull(),
  firstListed: timestamp("first_listed").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  cached_data: text("cached_data"),
});

// Enhanced users table with OAuth and email verification support
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  password: text("password"), // Optional for OAuth users
  googleId: text("google_id").unique(), // For Google OAuth
  isEmailVerified: boolean("is_email_verified").default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
  profilePicture: text("profile_picture"),
  displayName: text("display_name"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
});

// User preferences for stock notifications and display settings
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  theme: text("theme").default("system"),
  defaultView: text("default_view").default("list"),
  priceAlertThreshold: real("price_alert_threshold"),
  ratingAlertThreshold: real("rating_alert_threshold"),
  emailNotifications: boolean("email_notifications").default(true),
  pushNotifications: boolean("push_notifications").default(true),
});

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  notifyOnRating: boolean("notify_on_rating").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const customLists = pgTable("custom_lists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isPublic: boolean("is_public").default(false),
});

export const listStocks = pgTable("list_stocks", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => customLists.id),
  stockId: integer("stock_id").notNull().references(() => stocks.id),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

// Zod schemas for input validation
export const insertStockSchema = createInsertSchema(stocks);
export const insertUserSchema = createInsertSchema(users);
export const insertFavoriteSchema = createInsertSchema(favorites);
export const insertCustomListSchema = createInsertSchema(customLists);
export const insertListStockSchema = createInsertSchema(listStocks);
export const insertUserPreferencesSchema = createInsertSchema(userPreferences);

// Type definitions
export type Stock = typeof stocks.$inferSelect;
export type User = typeof users.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type CustomList = typeof customLists.$inferSelect;
export type ListStock = typeof listStocks.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertStock = z.infer<typeof insertStockSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type InsertCustomList = z.infer<typeof insertCustomListSchema>;
export type InsertListStock = z.infer<typeof insertListStockSchema>;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;