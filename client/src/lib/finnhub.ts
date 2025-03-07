import { z } from "zod";

// Stock quote schema (existing)
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

// SPAC schema
const spacSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  targetCompany: z.string().optional(),
  status: z.string(),
  estimatedDealClose: z.string().optional(),
  trustValue: z.number()
});

export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type StockNews = z.infer<typeof stockNewsSchema>;
export type IpoEvent = z.infer<typeof ipoEventSchema>;
export type CryptoQuote = z.infer<typeof cryptoQuoteSchema>;
export type Spac = z.infer<typeof spacSchema>;

// Stock news schema (existing)
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

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return [];

  try {
    // Get IPO calendar for next 30 days
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);

    const response = await fetch(
      `https://finnhub.io/api/v1/calendar/ipo?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&token=${apiKey}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch IPO calendar');
    }

    const data = await response.json();
    return z.array(ipoEventSchema).parse(data.ipoCalendar);
  } catch (error) {
    console.error('Error fetching IPO calendar:', error);
    return [];
  }
}

export async function getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${Math.floor(Date.now()/1000 - 86400)}&to=${Math.floor(Date.now()/1000)}&token=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto quote for ${symbol}`);
    }

    const data = await response.json();
    return cryptoQuoteSchema.parse({
      c: data.c[data.c.length - 1],
      h: data.h[data.h.length - 1],
      l: data.l[data.l.length - 1],
      o: data.o[data.o.length - 1],
      pc: data.o[0],
      t: data.t[data.t.length - 1]
    });
  } catch (error) {
    console.error('Error fetching crypto quote:', error);
    return null;
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