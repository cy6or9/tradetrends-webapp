import { WebSocket } from "ws";
import { finnhubClient } from "../finnhub";
import { analystRatingService } from "../services/analystRatings";

interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  lastUpdate: string;
}

export async function handleStockUpdate(ws: WebSocket, symbol: string) {
  try {
    // Get real-time quote
    const quote = await finnhubClient.quote(symbol);
    
    // Get analyst rating
    const analystRating = await analystRatingService.getRating(symbol);

    const stockData: StockData = {
      symbol,
      price: quote.c,
      change: quote.d,
      changePercent: quote.dp,
      volume: quote.v,
      lastUpdate: new Date().toISOString(),
    };

    // Send update to client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'stock_update',
        data: {
          ...stockData,
          analystRating
        }
      }));
    }

  } catch (error) {
    console.error(`Error updating stock ${symbol}:`, error);
  }
}

export function startStockUpdates(symbols: string[]) {
  // Start periodic analyst ratings updates
  analystRatingService.startPeriodicUpdates(symbols);
}
