import { Stock } from "@shared/schema";
import { finnhubClient } from "../finnhub";

interface HotScore {
  symbol: string;
  score: number;
  metrics: {
    priceChangeScore: number;
    volumeScore: number;
    analystScore: number;
    newsScore: number;
    socialScore: number;
  };
}

class HotStockService {
  private static instance: HotStockService;
  private cachedScores: Map<string, HotScore>;
  private lastUpdate: Date;

  private constructor() {
    this.cachedScores = new Map();
    this.lastUpdate = new Date(0);
  }

  static getInstance(): HotStockService {
    if (!HotStockService.instance) {
      HotStockService.instance = new HotStockService();
    }
    return HotStockService.instance;
  }

  private async calculatePriceChangeScore(stock: Stock): Promise<number> {
    const changePercent = Math.abs(stock.changePercent);
    // Normalize to 0-100 scale, with higher changes getting higher scores
    return Math.min(Math.abs(changePercent * 5), 100);
  }

  private async calculateVolumeScore(stock: Stock): Promise<number> {
    try {
      // Get average volume for last 7 days
      const stockCandles = await finnhubClient.stockCandles(stock.symbol, 'D', 
        Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000), 
        Math.floor(Date.now() / 1000));
      
      if (stockCandles.v && stockCandles.v.length > 0) {
        const avgVolume = stockCandles.v.reduce((a, b) => a + b, 0) / stockCandles.v.length;
        const volumeIncrease = ((stock.volume - avgVolume) / avgVolume) * 100;
        return Math.min(Math.max(volumeIncrease, 0), 100);
      }
    } catch (error) {
      console.error(`Error calculating volume score for ${stock.symbol}:`, error);
    }
    return 0;
  }

  private async calculateAnalystScore(stock: Stock): Promise<number> {
    return stock.analystRating || 0;
  }

  private async calculateNewsScore(stock: Stock): Promise<number> {
    try {
      const news = await finnhubClient.companyNews(stock.symbol, 
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]);
      
      if (!news.length) return 0;

      // Calculate sentiment based on news volume and any available sentiment data
      const newsScore = Math.min(news.length * 10, 100); // 10 or more news items = max score
      return newsScore;
    } catch (error) {
      console.error(`Error calculating news score for ${stock.symbol}:`, error);
      return 0;
    }
  }

  private calculateSocialScore(): number {
    // Placeholder for social media sentiment
    // To be implemented when social media API integration is added
    return 0;
  }

  async calculateHotScore(stock: Stock): Promise<HotScore> {
    // Check cache first
    const cached = this.cachedScores.get(stock.symbol);
    if (cached && Date.now() - this.lastUpdate.getTime() < 5 * 60 * 1000) { // 5 minute cache
      return cached;
    }

    // Skip penny stocks and stocks with very low volume
    if (stock.price < 1 || stock.volume < 10000) {
      return {
        symbol: stock.symbol,
        score: 0,
        metrics: {
          priceChangeScore: 0,
          volumeScore: 0,
          analystScore: 0,
          newsScore: 0,
          socialScore: 0
        }
      };
    }

    const [priceChangeScore, volumeScore, analystScore, newsScore, socialScore] = await Promise.all([
      this.calculatePriceChangeScore(stock),
      this.calculateVolumeScore(stock),
      this.calculateAnalystScore(stock),
      this.calculateNewsScore(stock),
      this.calculateSocialScore()
    ]);

    const hotScore: HotScore = {
      symbol: stock.symbol,
      score: (
        priceChangeScore * 0.4 +
        volumeScore * 0.25 +
        analystScore * 0.15 +
        newsScore * 0.15 +
        socialScore * 0.05
      ),
      metrics: {
        priceChangeScore,
        volumeScore,
        analystScore,
        newsScore,
        socialScore
      }
    };

    // Cache the result
    this.cachedScores.set(stock.symbol, hotScore);
    this.lastUpdate = new Date();

    return hotScore;
  }

  // Get hot stocks from a list of stocks
  async getHotStocks(stocks: Stock[]): Promise<Stock[]> {
    const scores = await Promise.all(
      stocks.map(async (stock) => ({
        stock,
        hotScore: await this.calculateHotScore(stock)
      }))
    );

    // Sort by hot score and return top stocks
    return scores
      .sort((a, b) => b.hotScore.score - a.hotScore.score)
      .filter(item => item.hotScore.score > 50) // Only truly "hot" stocks
      .map(item => item.stock);
  }
}

export const hotStockService = HotStockService.getInstance();
