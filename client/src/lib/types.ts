import { z } from "zod";

// Stock schema
export const stockSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  marketCap: z.number(),
  beta: z.number(),
  exchange: z.string(),
  industry: z.string(),
  sector: z.string(),
  analystRating: z.number(),
  isFavorite: z.boolean().optional(),
  lastUpdate: z.string().optional(),
});

export type Stock = z.infer<typeof stockSchema>;

// Filter schema
export const filterSchema = z.object({
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  minAnalystRating: z.string().optional(),
  sectors: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type StockFilters = z.infer<typeof filterSchema>;