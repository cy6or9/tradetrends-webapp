import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { MarketTabs } from "./components/MarketTabs";
import { StockFilters, type FilterOptions } from "./components/StockFilters";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { Stock } from "./lib/finnhub";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // Data considered fresh for 1 minute
      refetchInterval: 60000, // Refetch every minute
      retry: 2,
    },
  },
});

function StockApp() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    query: '',
    exchange: '',
    sort: 'marketCap:desc' // Default sort by market cap
  });

  const { isConnected, lastMessage } = useWebSocket();
  const { permissionGranted, sendNotification } = useNotifications();

  // Fetch filtered stocks
  const { data: stocksData, isLoading, error } = useQuery({
    queryKey: ['stocks', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.append(key, value.toString());
      }
      const response = await fetch(`/api/stocks/search?${params}`);
      if (!response.ok) throw new Error('Failed to fetch stocks');
      return response.json();
    },
  });

  // Update local state when query data changes
  useEffect(() => {
    if (stocksData) {
      setStocks(stocksData);
    }
  }, [stocksData]);

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

      // Send notification if needed
      if (permissionGranted && stock.isFavorite && Math.abs(changePercent) >= 1) {
        sendNotification(
          `${stock.symbol} Alert!`,
          {
            body: `Price ${changePercent > 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}% to $${update.price.toFixed(2)}`,
            icon: '/favicon.ico'
          }
        );
      }

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
  }, [lastMessage, permissionGranted, sendNotification]);

  const toggleFavorite = useCallback(async (stockId: string) => {
    setStocks(prevStocks =>
      prevStocks.map(stock =>
        stock.id === stockId
          ? { ...stock, isFavorite: !stock.isFavorite }
          : stock
      )
    );
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-4xl font-bold text-foreground">
            Stock Market <span className="text-primary">Analysis</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-2">
            Track US stocks with real-time updates and advanced filtering
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
          <div className="grid gap-8 md:grid-cols-[300px,1fr]">
            <ErrorBoundary>
              <StockFilters onFilterChange={setFilters} />
            </ErrorBoundary>

            <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
              <h2 className="text-2xl font-semibold mb-4">Stock List</h2>
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
                  <p>No stocks found matching your filters.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {stocks.map(stock => (
                    <div key={stock.symbol} className="p-4 border border-border/40 rounded-md hover:bg-accent/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{stock.symbol}</h3>
                            <button
                              className="hover:bg-accent/50 p-1 rounded-full transition-colors"
                              onClick={() => toggleFavorite(stock.id)}
                              title={stock.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <span className={`text-xl ${stock.isFavorite ? 'text-primary' : 'text-muted-foreground'}`}>
                                {stock.isFavorite ? '★' : '☆'}
                              </span>
                            </button>
                          </div>
                          <p className="text-sm text-muted-foreground">{stock.name}</p>
                          <p className="text-xs text-muted-foreground">{stock.industry} | {stock.exchange}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-medium">${stock.price.toFixed(2)}</p>
                          <p className={`text-sm ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {stock.changePercent >= 0 ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Market Cap:</span>
                          <span className="ml-1">${(stock.marketCap / 1e9).toFixed(2)}B</span>
                        </div>
                        <div>
                          <span className="font-medium">Volume:</span>
                          <span className="ml-1">{(stock.volume / 1e6).toFixed(1)}M</span>
                        </div>
                        <div>
                          <span className="font-medium">Beta:</span>
                          <span className="ml-1">{stock.beta.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium">52W High:</span>
                          <span className="ml-1">${stock.high52Week.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium">52W Low:</span>
                          <span className="ml-1">${stock.low52Week.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Market Data</h2>
            <ErrorBoundary>
              <MarketTabs />
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <StockApp />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}