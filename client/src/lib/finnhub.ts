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

const cryptoQuoteSchema = z.object({
  c: z.number(),
  h: z.number(),
  l: z.number(),
  o: z.number(),
  pc: z.number(),
  t: z.number(),
});

// API configuration
const API_BASE_URL = 'https://finnhub.io/api/v1';
const US_EXCHANGE_SYMBOLS = ['NYSE', 'NASDAQ'];
const RATE_LIMIT_DELAY = 250; // ms between requests
const BATCH_SIZE = 5; // Reduced batch size for better reliability

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

// API request handler with retries
async function fetchFinnhub(endpoint: string, retries = 3): Promise<any> {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('Finnhub API key not found');
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const fullUrl = url.includes('?') ? `${url}&token=${apiKey}` : `${url}?token=${apiKey}`;

  try {
    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Finnhub-Token': apiKey
      }
    });

    if (response.status === 429 && retries > 0) {
      console.log(`Rate limit hit, retrying in ${RATE_LIMIT_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      return fetchFinnhub(endpoint, retries - 1);
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error(`Finnhub API error (${endpoint}):`, error);
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      return fetchFinnhub(endpoint, retries - 1);
    }
    throw error;
  }
}

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

export async function getAllUsStocks(): Promise<Stock[]> {
  try {
    console.log('Fetching US stocks...');

    // Fetch all stock symbols
    const allSymbols = await fetchFinnhub('/stock/symbol?exchange=US');
    const activeStocks = allSymbols
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
            quote = await fetchFinnhub(`/quote?symbol=${stock.symbol}`);
          } catch (error) {
            console.warn(`Failed to fetch quote for ${stock.symbol}, using cached data`);
            quote = null;
          }

          // Get price from quote or cache
          const price = quote?.c || cached?.lastPrice || 0;

          // Fetch analyst recommendations
          let analystRating = cached?.analystRating ?? 0;
          try {
            const recommendations = await fetchFinnhub(`/stock/recommendation?symbol=${stock.symbol}`);
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
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY * BATCH_SIZE));
    }

    console.log(`Successfully processed ${stocks.length} stocks`);
    return stocks.sort((a, b) => b.analystRating - a.analystRating);
  } catch (error) {
    console.error('Error fetching US stocks:', error);
    return [];
  }
}

export async function getCryptoQuote(symbol: string): Promise<any> {
  try {
    console.log(`Fetching crypto quote for ${symbol}...`);
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const data = await fetchFinnhub(
      `/crypto/candle?symbol=BINANCE:${symbol}USDT&resolution=D&from=${oneDayAgo}&to=${now}`
    );

    if (!data || data.s === 'no_data') {
      throw new Error(`No data available for ${symbol}`);
    }

    // Extract the latest values
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

export type StockQuote = z.infer<typeof stockQuoteSchema>;
export type CryptoQuote = z.infer<typeof cryptoQuoteSchema>;
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

export type StockNews = z.infer<typeof stockNewsSchema>;
export type IpoEvent = z.infer<typeof ipoEventSchema>;
export type Spac = z.infer<typeof spacSchema>;

const spacSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  targetCompany: z.string().optional(),
  status: z.string(),
  estimatedDealClose: z.string().optional(),
  trustValue: z.number()
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

export async function getIpoCalendar(): Promise<IpoEvent[]> {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) return [];

  try {
    // Get IPO calendar for next 30 days
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);

    const url = `${API_BASE_URL}/calendar/ipo?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&token=${apiKey}`;
    const data = await fetchWithRetries(url);

    if (!data.ipoCalendar) return [];
    return z.array(ipoEventSchema).parse(data.ipoCalendar);
  } catch (error) {
    console.error('Error fetching IPO calendar:', error);
    return [];
  }
}

const ipoEventSchema = z.object({});

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

async function fetchWithRetries(url: string, retries = 3): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (retries > 0 && response.status === 429) {
        console.log(`Rate limit hit, retrying in ${RATE_LIMIT_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        return fetchWithRetries(url, retries - 1);
      }
      throw new Error(`API request failed: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      console.log(`Request failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      return fetchWithRetries(url, retries - 1);
    }
    throw error;
  }
}