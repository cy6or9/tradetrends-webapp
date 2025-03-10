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
  priceTargets?: {
    targetHigh: number;
    targetLow: number;
    targetMean: number;
    targetMedian: number;
    lastUpdated: Date;
  };
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

  // Calculate analyst rating based on multiple factors
  private async calculateRating(rating: AnalystRating, currentPrice?: number): Promise<number> {
    try {
      const total = rating.strongBuy + rating.buy + rating.hold + rating.sell + rating.strongSell;
      if (total === 0) return 0;

      // Base rating calculation from recommendations (0-100)
      // Strong Buy/Sell have highest weight to reflect strong conviction
      const recommendationScore = (
        (rating.strongBuy * 125) +   // 125% weight for strong conviction buys
        (rating.buy * 100) +         // 100% weight for regular buys
        (rating.hold * 50) +         // 50% weight for holds
        (rating.sell * 0) +          // 0% weight for sells
        (rating.strongSell * -25)    // -25% penalty for strong sells
      ) / (total * 1.25);            // Normalize to 0-100 scale

      // Get price targets if available and not already cached
      if (!rating.priceTargets && currentPrice) {
        try {
          const priceTargets = await finnhubClient.priceTarget(rating.symbol);
          if (priceTargets) {
            rating.priceTargets = {
              targetHigh: priceTargets.targetHigh,
              targetLow: priceTargets.targetLow,
              targetMean: priceTargets.targetMean,
              targetMedian: priceTargets.targetMedian,
              lastUpdated: new Date()
            };
          }
        } catch (error) {
          console.error(`Error fetching price targets for ${rating.symbol}:`, error);
        }
      }

      // Factor in price targets if available
      let finalScore = recommendationScore;
      if (rating.priceTargets && currentPrice) {
        const priceTargetScore = ((rating.priceTargets.targetMean / currentPrice) - 1) * 100;
        // Weight price targets at 30% of the final score
        finalScore = (recommendationScore * 0.7) + (Math.min(Math.max(priceTargetScore, 0), 100) * 0.3);
      }

      // Quality factors
      const analystCoverageScore = Math.min(total / 20, 1); // Max score at 20+ analysts
      finalScore *= analystCoverageScore; // Reduce score if low analyst coverage

      // Ensure the final score is between 0 and 100
      return Math.round(Math.max(Math.min(finalScore, 100), 0));
    } catch (error) {
      console.error(`Error calculating rating for ${rating.symbol}:`, error);
      return 0;
    }
  }

  async updateRating(symbol: string, currentPrice?: number): Promise<number> {
    try {
      const response = await finnhubClient.recommendationTrends(symbol);
      if (!response || !response[0]) {
        console.log(`No analyst ratings found for ${symbol}`);
        return 0;
      }

      // Get the most recent recommendation
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

      const normalizedRating = await this.calculateRating(rating, currentPrice);
      this.ratingsCache.set(symbol, rating);

      console.log(`Updated analyst rating for ${symbol}: ${normalizedRating}%`);
      return normalizedRating;
    } catch (error) {
      console.error(`Error fetching analyst rating for ${symbol}:`, error);
      return 0;
    }
  }

  async getRating(symbol: string, currentPrice?: number): Promise<number> {
    const cached = this.ratingsCache.get(symbol);

    // If no cached data or data is older than 6 hours, fetch new data
    if (!cached || Date.now() - cached.lastUpdated.getTime() > 6 * 60 * 60 * 1000) {
      return this.updateRating(symbol, currentPrice);
    }

    return this.calculateRating(cached, currentPrice);
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