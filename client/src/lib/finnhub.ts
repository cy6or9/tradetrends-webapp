import { z } from "zod";

// Define schemas without immediate API key check
const stockQuoteSchema = z.object({
  c: z.number(), // Current price
  d: z.number(), // Change
  dp: z.number(), // Percent change
  h: z.number(), // High price of the day
  l: z.number(), // Low price of the day
  o: z.number(), // Open price of the day
  pc: z.number(), // Previous close price
  t: z.number(), // Timestamp
});

const stockNewsSchema = z.object({
  category: z.string(),
  datetime: z.number(),
  headline: z.string(),
  id: z.number(),
  image: z.string(),
  related: z.string(),
  source: z.string(),
  summary: z.string(),
  url: z.string(),
});

export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type StockNews = z.infer<typeof stockNewsSchema>;

// Utility function to get API key with error handling
function getFinnhubApiKey(): string {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found. Some features may not work.');
    return '';
  }
  return apiKey;
}

export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch quote for ${symbol}`);
    }

    const data = await response.json();
    return stockQuoteSchema.parse(data);
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    return null;
  }
}

export async function getStockNews(symbol: string): Promise<StockNews[]> {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return [];

  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);

    const response = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}` +
      `&from=${from.toISOString().split('T')[0]}` +
      `&to=${to.toISOString().split('T')[0]}` +
      `&token=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch news for ${symbol}`);
    }

    const data = await response.json();
    return z.array(stockNewsSchema).parse(data);
  } catch (error) {
    console.error('Error fetching stock news:', error);
    return [];
  }
}