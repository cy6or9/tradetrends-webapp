import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { MarketTabs } from "./components/MarketTabs";
import { getAllUsStocks, type Stock, stockCache } from "./lib/finnhub";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // Data considered fresh for 1 minute
      refetchInterval: 60000, // Refetch every minute
      retry: 2, // Retry failed requests twice
    },
  },
});

function StockApp() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const { isConnected, lastMessage } = useWebSocket();
  const { permissionGranted, sendNotification } = useNotifications();

  // Fetch all US stocks
  const { data: stocksData, isLoading, error } = useQuery({
    queryKey: ['stocks'],
    queryFn: getAllUsStocks,
  });

  // Update local state when query data changes
  useEffect(() => {
    if (stocksData) {
      setStocks(stocksData);
    }
  }, [stocksData]);

  // Memoize notification handling
  const handlePriceAlert = useCallback((stock: Stock, price: number, changePercent: number) => {
    if (permissionGranted && stock.isFavorite && Math.abs(changePercent) >= 1) {
      sendNotification(
        `${stock.symbol} Alert!`,
        {
          body: `Price ${changePercent > 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}% to $${price.toFixed(2)}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: stock.symbol
        }
      );
    }
  }, [permissionGranted, sendNotification]);

  // Handle real-time updates
  useEffect(() => {
    if (!lastMessage?.data) return;
    if (lastMessage.type !== 'stockUpdate') return;

    const update = lastMessage.data;

    setStocks(prevStocks => {
      const newStocks = [...prevStocks];
      const stockIndex = newStocks.findIndex(s => s.symbol === update.symbol);

      if (stockIndex === -1) return prevStocks;

      const stock = newStocks[stockIndex];
      const changePercent = ((update.price - stock.price) / stock.price) * 100;

      // Update cache
      stockCache.updateStock(update.symbol, update.price);

      // Send notification if needed
      handlePriceAlert(stock, update.price, changePercent);

      // Update stock data
      newStocks[stockIndex] = {
        ...stock,
        price: update.price,
        change: update.change,
        changePercent,
        lastUpdate: update.timestamp
      };

      return newStocks;
    });
  }, [lastMessage, handlePriceAlert]); // Only depend on lastMessage and memoized handler

  const toggleFavorite = useCallback(async (stockId: string) => {
    if (!permissionGranted) {
      const confirmed = window.confirm(
        "To receive alerts when your favorite stocks have significant price changes, we need your permission to send notifications. Would you like to enable notifications?"
      );
      if (confirmed) {
        const granted = await requestPermission();
        if (!granted) {
          alert('Please enable notifications in your browser settings to receive stock alerts');
          return;
        }
      }
    }

    setStocks(prevStocks =>
      prevStocks.map(stock =>
        stock.id === stockId
          ? { ...stock, isFavorite: !stock.isFavorite }
          : stock
      )
    );
  }, [permissionGranted]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-4xl font-bold text-foreground">
            Stock Market <span className="text-primary">Analysis</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-2">
            Track US stocks ranked by analyst recommendations
          </p>
          <div className="mt-2 flex items-center gap-4">
            <span className={`inline-flex items-center text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
              ● {isConnected ? 'Live Updates' : 'Connecting...'}
            </span>
            <span className="text-sm text-muted-foreground">
              {stocks.length} stocks tracked
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Top Rated US Stocks</h2>
            {isLoading ? (
              <div className="text-center text-muted-foreground">
                <div className="animate-pulse text-primary">Loading stock data...</div>
              </div>
            ) : error ? (
              <div className="text-center text-destructive">
                <p>Failed to load stocks. Please try again later.</p>
              </div>
            ) : stocks.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <p>No stocks found. Please check your API configuration.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stocks.map(stock => (
                  <div key={stock.symbol} className="flex items-center justify-between p-4 border border-border/40 rounded-md">
                    <div>
                      <h3 className="font-semibold">{stock.symbol}</h3>
                      <p className="text-sm text-muted-foreground">{stock.name}</p>
                      <p className="text-xs text-muted-foreground">{stock.exchange}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-medium">${stock.price.toFixed(2)}</p>
                        <p className={`text-sm ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {stock.changePercent >= 0 ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Buy Rating</p>
                        <p className="text-sm text-primary">{stock.analystRating.toFixed(0)}%</p>
                      </div>
                      <button
                        className="hover:bg-accent/50 p-2 rounded-full transition-colors"
                        onClick={() => toggleFavorite(stock.id)}
                        title={stock.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <span className={`text-xl ${stock.isFavorite ? 'text-primary' : 'text-muted-foreground'}`}>
                          {stock.isFavorite ? '★' : '☆'}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Market Data</h2>
            <MarketTabs />
          </div>
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