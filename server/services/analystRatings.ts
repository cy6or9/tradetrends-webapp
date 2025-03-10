import { createServer } from "http";
import { WebSocket } from "ws";
import { finnhubClient } from "../finnhub";

interface AnalystRating {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
  lastUpdated: Date;
}

class AnalystRatingService {
  private static instance: AnalystRatingService;
  private ratingsCache: Map<string, AnalystRating>;
  private updateInterval: NodeJS.Timeout | null;

  private constructor() {
    this.ratingsCache = new Map();
    this.updateInterval = null;
  }

  static getInstance(): AnalystRatingService {
    if (!AnalystRatingService.instance) {
      AnalystRatingService.instance = new AnalystRatingService();
    }
    return AnalystRatingService.instance;
  }

  // Calculate normalized rating (0-100)
  private calculateRating(rating: AnalystRating): number {
    const total = rating.strongBuy + rating.buy + rating.hold + rating.sell + rating.strongSell;
    if (total === 0) return 0;

    // Weight the different ratings
    const weightedSum = (
      (rating.strongBuy * 100) +
      (rating.buy * 75) +
      (rating.hold * 50) +
      (rating.sell * 25) +
      (rating.strongSell * 0)
    );

    return Math.round((weightedSum / total));
  }

  async updateRating(symbol: string): Promise<number> {
    try {
      const response = await finnhubClient.recommendationTrends(symbol);
      if (!response || !response[0]) {
        console.log(`No analyst ratings found for ${symbol}`);
        return 0;
      }

      const latestRating = response[0];
      const rating: AnalystRating = {
        symbol,
        buy: latestRating.buy,
        hold: latestRating.hold,
        sell: latestRating.sell,
        strongBuy: latestRating.strongBuy,
        strongSell: latestRating.strongSell,
        period: latestRating.period,
        lastUpdated: new Date()
      };

      const normalizedRating = this.calculateRating(rating);
      this.ratingsCache.set(symbol, rating);
      
      console.log(`Updated analyst rating for ${symbol}: ${normalizedRating}%`);
      return normalizedRating;
    } catch (error) {
      console.error(`Error fetching analyst rating for ${symbol}:`, error);
      return 0;
    }
  }

  async getRating(symbol: string): Promise<number> {
    const cached = this.ratingsCache.get(symbol);
    
    // If no cached data or data is older than 6 hours, fetch new data
    if (!cached || Date.now() - cached.lastUpdated.getTime() > 6 * 60 * 60 * 1000) {
      return this.updateRating(symbol);
    }

    return this.calculateRating(cached);
  }

  startPeriodicUpdates(symbols: string[]) {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Update ratings every 6 hours
    this.updateInterval = setInterval(async () => {
      console.log('Starting periodic analyst ratings update...');
      for (const symbol of symbols) {
        await this.updateRating(symbol);
        // Add delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      console.log('Finished periodic analyst ratings update');
    }, 6 * 60 * 60 * 1000);
  }

  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

export const analystRatingService = AnalystRatingService.getInstance();
