import { z } from "zod";

// Schema definitions
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

const cryptoCandleSchema = z.object({
  c: z.array(z.number()),
  h: z.array(z.number()),
  l: z.array(z.number()),
  o: z.array(z.number()),
  t: z.array(z.number()),
  s: z.string()
});

const stockSymbolSchema = z.object({
  currency: z.string(),
  description: z.string(),
  displaySymbol: z.string(),
  figi: z.string().optional(),
  isin: z.string().optional(),
  mic: z.string(),
  symbol: z.string(),
  type: z.string(),
  exchange: z.string(),
});

const recommendationSchema = z.object({
  buy: z.number(),
  hold: z.number(),
  period: z.string(),
  sell: z.number(),
  strongBuy: z.number(),
  strongSell: z.number(),
  symbol: z.string(),
});

// Cache manager
class StockCacheManager {
  private data = new Map<string, { lastPrice: number; analystRating: number; lastUpdate: string }>();

  getStock(symbol: string) {
    return this.data.get(symbol);
  }

  updateStock(symbol: string, price: number, analystRating?: number) {
    const existing = this.data.get(symbol);
    this.data.set(symbol, {
      lastPrice: price,
      analystRating: analystRating ?? existing?.analystRating ?? 0,
      lastUpdate: new Date().toISOString()
    });
  }
}

export const stockCache = new StockCacheManager();

// Types
export interface Stock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  analystRating: number;
  exchange: string;
  isFavorite?: boolean;
  lastUpdate?: string;
}

export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type CryptoQuote = {
  c: number; // Current price
  h: number; // High price
  l: number; // Low price
  o: number; // Open price
  pc: number; // Previous close price
  t: number; // Timestamp
};

const US_EXCHANGE_SYMBOLS = ['NYSE', 'NASDAQ'];
const BATCH_SIZE = 5; // Process 5 stocks at a time
const RATE_LIMIT_DELAY = 250; // ms between batches

// API Functions
export async function getAllUsStocks(): Promise<Stock[]> {
  try {
    console.log('Fetching US stocks...');
    const symbols = await fetch('/api/finnhub/stock/symbol').then(res => res.json());

    const activeStocks = symbols
      .filter((stock: any) => 
        US_EXCHANGE_SYMBOLS.includes(stock.exchange) && 
        stock.type === 'Common Stock'
      )
      .slice(0, 200); // Top 200 stocks

    console.log(`Processing ${activeStocks.length} stocks...`);
    const stocks: Stock[] = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < activeStocks.length; i += BATCH_SIZE) {
      const batch = activeStocks.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (stock: any) => {
        try {
          // Get cached data if available
          const cached = stockCache.getStock(stock.symbol);

          // Fetch current quote
          let quote;
          try {
            quote = await fetch(`/api/finnhub/quote?symbol=${stock.symbol}`).then(res => res.json());
          } catch (error) {
            console.warn(`Failed to fetch quote for ${stock.symbol}, using cached data`);
            quote = null;
          }

          // Get price from quote or cache
          const price = quote?.c || cached?.lastPrice || 0;

          // Fetch analyst recommendations
          let analystRating = cached?.analystRating ?? 0;
          try {
            const recommendations = await fetch(`/api/finnhub/stock/recommendation?symbol=${stock.symbol}`).then(res => res.json());
            if (recommendations && recommendations.length > 0) {
              const latest = recommendations[0];
              const totalRecs = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
              if (totalRecs > 0) {
                analystRating = ((latest.strongBuy + latest.buy) / totalRecs) * 100;
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch recommendations for ${stock.symbol}, using cached rating`);
          }

          // Update cache
          stockCache.updateStock(stock.symbol, price, analystRating);

          return {
            id: stock.symbol,
            symbol: stock.symbol,
            name: stock.description,
            price,
            change: quote?.d || 0,
            changePercent: quote?.dp || 0,
            volume: 0,
            marketCap: 0,
            analystRating,
            exchange: stock.exchange,
            isFavorite: false,
            lastUpdate: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Error processing ${stock.symbol}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      stocks.push(...batchResults.filter((s): s is Stock => s !== null));

      // Rate limiting delay between batches
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    console.log(`Successfully processed ${stocks.length} stocks`);
    return stocks.sort((a, b) => b.analystRating - a.analystRating);
  } catch (error) {
    console.error('Error fetching US stocks:', error);
    return [];
  }
}

export async function getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  try {
    console.log(`Fetching crypto quote for ${symbol}...`);
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const response = await fetch(
      `/api/finnhub/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${oneDayAgo}&to=${now}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.s === 'no_data' || !Array.isArray(data.c)) {
      throw new Error(`No data available for ${symbol}`);
    }

    return {
      c: data.c[data.c.length - 1], // Current price
      h: Math.max(...data.h), // High price
      l: Math.min(...data.l), // Low price
      o: data.o[0], // Open price
      pc: data.o[0], // Previous close price
      t: data.t[data.t.length - 1] // Latest timestamp
    };
  } catch (error) {
    console.error(`Error fetching crypto quote for ${symbol}:`, error);
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

function getFinnhubApiKey(): string {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('Finnhub API key not found. Some features may not work.');
    return '';
  }
  return apiKey;
}


const ipoEventSchema = z.object({});
const stockNewsSchema = z.object({});
const spacSchema = z.object({});

export type StockNews = z.infer<typeof stockNewsSchema>;
export type IpoEvent = z.infer<typeof ipoEventSchema>;
export type Spac = z.infer<typeof spacSchema>;

// Mock data for features not yet implemented
export async function getSpacList(): Promise<Spac[]> {
  return [];
}

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  return [];
}

const API_BASE_URL = 'https://finnhub.io/api/v1';