import { z } from "zod";

// Stock quote schema
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

// IPO Calendar schema
const ipoEventSchema = z.object({
  date: z.string(),
  exchange: z.string(),
  name: z.string(),
  numberOfShares: z.number(),
  price: z.string(), // Price range or fixed price
  status: z.string(),
  symbol: z.string(),
  totalSharesValue: z.number()
});

// Crypto schema
const cryptoQuoteSchema = z.object({
  c: z.number(), // Current price
  h: z.number(), // High price of the day
  l: z.number(), // Low price of the day
  o: z.number(), // Open price of the day
  pc: z.number(), // Previous close price
  t: z.number(), // Timestamp
});

const API_BASE_URL = 'https://finnhub.io/api/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<any> {
  try {
    const response = await fetch(url);

    if (response.status === 429) { // Rate limit exceeded
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, retries - 1);
      }
      throw new Error('Rate limit exceeded');
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Check for API-specific error responses
    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    if (retries > 0 && error instanceof Error && !error.message.includes('Rate limit')) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, retries - 1);
    }
    throw error;
  }
}

export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found');
    return null;
  }

  try {
    const url = `${API_BASE_URL}/quote?symbol=${symbol}&token=${apiKey}`;
    const data = await fetchWithRetry(url);
    return stockQuoteSchema.parse(data);
  } catch (error) {
    console.error(`Error fetching stock quote for ${symbol}:`, error);
    return null;
  }
}

export async function getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found');
    return null;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const url = `${API_BASE_URL}/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${oneDayAgo}&to=${now}&token=${apiKey}`;
    const data = await fetchWithRetry(url);

    if (!data || data.s === 'no_data') {
      throw new Error(`No data available for ${symbol}`);
    }

    if (!Array.isArray(data.c) || data.c.length === 0) {
      throw new Error(`Invalid data format for ${symbol}`);
    }

    return cryptoQuoteSchema.parse({
      c: data.c[data.c.length - 1], // Current price
      h: Math.max(...data.h), // High price
      l: Math.min(...data.l), // Low price
      o: data.o[0], // Open price
      pc: data.o[0], // Use open price as previous close
      t: data.t[data.t.length - 1] // Latest timestamp
    });
  } catch (error) {
    console.error(`Error fetching crypto quote for ${symbol}:`, error);
    return null;
  }
}

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) return [];

  try {
    // Get IPO calendar for next 30 days
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);

    const url = `${API_BASE_URL}/calendar/ipo?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&token=${apiKey}`;
    const data = await fetchWithRetry(url);

    if (!data.ipoCalendar) return [];
    return z.array(ipoEventSchema).parse(data.ipoCalendar);
  } catch (error) {
    console.error('Error fetching IPO calendar:', error);
    return [];
  }
}

// Mock SPAC data since Finnhub doesn't provide SPAC-specific endpoints
export async function getSpacList(): Promise<Spac[]> {
  return [
    {
      symbol: "SPAK",
      name: "Example SPAC 1",
      status: "Searching",
      trustValue: 200000000
    },
    {
      symbol: "SPAR",
      name: "Example SPAC 2",
      targetCompany: "TechCo",
      status: "Deal Announced",
      estimatedDealClose: "2024-06-30",
      trustValue: 350000000
    }
  ];
}

// Export types
export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type StockNews = z.infer<typeof stockNewsSchema>;
export type IpoEvent = z.infer<typeof ipoEventSchema>;
export type CryptoQuote = z.infer<typeof cryptoQuoteSchema>;
export type Spac = z.infer<typeof spacSchema>;

// SPAC schema
const spacSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  targetCompany: z.string().optional(),
  status: z.string(),
  estimatedDealClose: z.string().optional(),
  trustValue: z.number()
});

// Stock news schema
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

// Utility function to get API key with error handling
function getFinnhubApiKey(): string {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found. Some features may not work.');
    return '';
  }
  return apiKey;
}