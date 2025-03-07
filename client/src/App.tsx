import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { MarketTabs } from "./components/MarketTabs";
import { StockFilters, type FilterOptions } from "./components/StockFilters";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { Stock } from "./lib/finnhub";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // Data considered fresh for 30 seconds
      refetchInterval: 30000, // Refetch every 30 seconds
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
    },
  },
});

function StockApp() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    query: '',
    exchange: '',
    sort: 'symbol:asc'
  });

  const { isConnected, lastMessage } = useWebSocket();
  const { permissionGranted, sendNotification } = useNotifications();

  // Fetch filtered stocks
  const { data: stocksData, isLoading, error, refetch } = useQuery({
    queryKey: ['stocks', filters],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(filters)) {
          if (value) params.append(key, value.toString());
        }
        const response = await fetch(`/api/stocks/search?${params}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch stocks');
        }
        const data = await response.json();
        console.log(`Fetched ${data.length} stocks`);
        return data;
      } catch (error) {
        console.error('Error fetching stocks:', error);
        return stocks; // Return current stocks if API fails
      }
    },
  });

  // Update local state when query data changes
  useEffect(() => {
    if (stocksData) {
      const sortedStocks = [...stocksData].sort((a, b) => {
        const [field, order] = filters.sort.split(':');
        let aVal = a[field as keyof Stock];
        let bVal = b[field as keyof Stock];

        // Handle string comparisons
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
          return order === 'desc' ?
            bVal.localeCompare(aVal) :
            aVal.localeCompare(bVal);
        }

        // Handle numeric comparisons
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;

        // Special handling for certain fields
        if (field === 'changePercent' || field === 'volume' || field === 'marketCap') {
          // Sort by absolute value for percentage changes
          if (field === 'changePercent' && order === 'desc') {
            return Math.abs(bVal) - Math.abs(aVal);
          }
          // Regular numeric sort for other fields
          return order === 'desc' ? bVal - aVal : aVal - bVal;
        }

        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });

      setStocks(sortedStocks);
      console.log(`Displaying ${sortedStocks.length} stocks`);
    }
  }, [stocksData, filters.sort]);

  // Handle real-time updates
  useEffect(() => {
    if (!lastMessage?.data) return;

    setStocks(prevStocks => {
      const newStocks = [...prevStocks];
      const stockIndex = newStocks.findIndex(s => s.symbol === lastMessage.data.symbol);

      if (stockIndex === -1) return prevStocks;

      const stock = newStocks[stockIndex];
      const changePercent = ((lastMessage.data.price - stock.price) / stock.price) * 100;

      // Send notification if needed
      if (permissionGranted && stock.isFavorite && Math.abs(changePercent) >= 1) {
        sendNotification(
          `${stock.symbol} Alert!`,
          {
            body: `Price ${changePercent > 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}% to $${lastMessage.data.price.toFixed(2)}`,
            icon: '/favicon.ico'
          }
        );
      }

      // Update stock data
      newStocks[stockIndex] = {
        ...stock,
        price: lastMessage.data.price,
        change: lastMessage.data.change,
        changePercent,
        lastUpdate: lastMessage.data.timestamp
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground">
                Trade<span className="text-primary">Trends</span>
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Advanced stock market analysis filtering & trending trade data tracker for better investing
              </p>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px]">
                <SheetHeader>
                  <SheetTitle>Filter & Sort</SheetTitle>
                  <SheetDescription>
                    Apply filters and sorting to the stock list
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4">
                  <ErrorBoundary>
                    <StockFilters onFilterChange={setFilters} />
                  </ErrorBoundary>
                </div>
              </SheetContent>
            </Sheet>
          </div>
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
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="flex items-center gap-2">
                {error instanceof Error ? error.message : 'Failed to load stocks'}
                <button
                  onClick={() => refetch()}
                  className="ml-2 text-sm underline hover:no-underline"
                >
                  Try again
                </button>
              </AlertDescription>
            </Alert>
          )}

          {/* Stock List Section */}
          <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Live Stock Updates</h2>
            {isLoading ? (
              <div className="text-center py-8">
                <ReloadIcon className="animate-spin h-8 w-8 mx-auto text-primary mb-4" />
                <p className="text-muted-foreground">Loading stock data...</p>
              </div>
            ) : stocks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No stocks found matching your filters.</p>
                <button
                  onClick={() => setFilters({ query: '', exchange: '', sort: 'symbol:asc' })}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {stocks.map(stock => (
                  <div key={stock.symbol} className="p-2 border border-border/40 rounded-md hover:bg-accent/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-1">
                            <h3 className="font-medium">{stock.symbol}</h3>
                            <button
                              className="hover:bg-accent/50 p-0.5 rounded-full transition-colors"
                              onClick={() => toggleFavorite(stock.id)}
                              title={stock.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <span className={`text-sm ${stock.isFavorite ? 'text-primary' : 'text-muted-foreground'}`}>
                                {stock.isFavorite ? '★' : '☆'}
                              </span>
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground">{stock.name}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground ml-4">
                          <span>Vol: {(stock.volume / 1e6).toFixed(1)}M</span>
                          <span>Cap: ${(stock.marketCap / 1e9).toFixed(2)}B</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">${stock.price.toFixed(2)}</p>
                        <p className={`text-xs ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {stock.changePercent >= 0 ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Market Data Section */}
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