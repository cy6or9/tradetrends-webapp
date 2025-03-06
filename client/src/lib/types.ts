import { z } from "zod";

// Stock schema
export const stockSchema = z.object({
  id: z.number(),
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  changePercent: z.number(),
  analystRating: z.number(),
  volume: z.number(),
  marketCap: z.number(),
  sector: z.string(),
  shortInterest: z.number().optional(),
  dividendYield: z.number().optional(),
  earningsDate: z.string().optional(),
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
