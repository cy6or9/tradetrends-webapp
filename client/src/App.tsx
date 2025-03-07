import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWebSocket } from "./hooks/useWebSocket";

interface Stock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  analystRating: number;
  lastUpdate?: string;
}

const queryClient = new QueryClient();

function StockApp() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const { isConnected, lastMessage } = useWebSocket();

  // Handle real-time updates
  useEffect(() => {
    if (lastMessage?.type === 'stockUpdate') {
      const update = lastMessage.data;
      setStocks(prevStocks => 
        prevStocks.map(stock => 
          stock.symbol === update.symbol
            ? { ...stock, price: update.price, change: update.change, lastUpdate: update.timestamp }
            : stock
        )
      );
    }
  }, [lastMessage]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-4xl font-bold text-foreground">
            Stock Market <span className="text-primary">Analysis</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-2">
            Track stocks with high analyst ratings and market momentum
          </p>
          <div className="mt-2">
            <span className={`inline-flex items-center text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
              ● {isConnected ? 'Live Updates' : 'Connecting...'}
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
          {loading ? (
            <div className="text-center text-muted-foreground">
              <div className="animate-pulse text-primary">Loading stock data...</div>
            </div>
          ) : stocks.length === 0 ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                No stocks found. Add some stocks to track.
              </p>
              <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md transition-colors">
                Add Stocks
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {stocks.map(stock => (
                <div key={stock.symbol} className="flex items-center justify-between p-4 border border-border/40 rounded-md">
                  <div>
                    <h3 className="font-semibold">{stock.symbol}</h3>
                    <p className="text-sm text-muted-foreground">{stock.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">${stock.price.toFixed(2)}</p>
                    <p className={`text-sm ${stock.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {stock.change >= 0 ? '↑' : '↓'} {Math.abs(stock.change)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StockApp />
    </QueryClientProvider>
  );
}