import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { MarketTabs } from "./components/MarketTabs";
import { getStockQuote } from "./lib/finnhub";

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
  isFavorite?: boolean;
}

const queryClient = new QueryClient();

// List of stocks to track
const TRACKED_STOCKS = [
  {
    id: "1",
    symbol: "AAPL",
    name: "Apple Inc.",
    volume: 55000000,
    marketCap: 2800000000000,
    analystRating: 92
  },
  {
    id: "2",
    symbol: "MSFT",
    name: "Microsoft Corporation",
    volume: 25000000,
    marketCap: 2100000000000,
    analystRating: 95
  },
  {
    id: "3",
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    volume: 20000000,
    marketCap: 1900000000000,
    analystRating: 90
  },
  {
    id: "4",
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    volume: 30000000,
    marketCap: 1800000000000,
    analystRating: 88
  },
  {
    id: "5",
    symbol: "META",
    name: "Meta Platforms Inc.",
    volume: 22000000,
    marketCap: 1200000000000,
    analystRating: 85
  }
];

function StockApp() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const { isConnected, lastMessage } = useWebSocket();
  const { permissionGranted, sendNotification } = useNotifications();

  // Fetch initial stock data
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const stocksWithQuotes = await Promise.all(
          TRACKED_STOCKS.map(async (stock) => {
            const quote = await getStockQuote(stock.symbol);
            return {
              ...stock,
              price: quote?.c || 0,
              change: quote?.d || 0,
              changePercent: quote?.dp || 0,
              isFavorite: false
            };
          })
        );
        setStocks(stocksWithQuotes);
      } catch (error) {
        console.error('Failed to fetch initial stock data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []); // Only run once on mount

  // Handle real-time updates
  useEffect(() => {
    if (!lastMessage?.data) return;
    if (lastMessage.type !== 'stockUpdate') return;

    const update = lastMessage.data;
    setStocks(prevStocks => 
      prevStocks.map(stock => {
        if (stock.symbol === update.symbol) {
          const changePercent = ((update.price - stock.price) / stock.price) * 100;

          // Send notification for favorite stocks with significant changes
          if (stock.isFavorite && Math.abs(changePercent) >= 1 && permissionGranted) {
            sendNotification(
              `${stock.symbol} Alert!`,
              {
                body: `Price ${changePercent > 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}% to $${update.price.toFixed(2)}`,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: stock.symbol
              }
            );
          }

          return {
            ...stock,
            price: update.price,
            change: update.change,
            changePercent,
            lastUpdate: update.timestamp
          };
        }
        return stock;
      })
    );
  }, [lastMessage]); // Only depend on lastMessage

  const toggleFavorite = async (stockId: string) => {
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
  };

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
          <div className="mt-2 flex items-center gap-4">
            <span className={`inline-flex items-center text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
              ● {isConnected ? 'Live Updates' : 'Connecting...'}
            </span>
            <span className={`inline-flex items-center text-sm ${permissionGranted ? 'text-green-500' : 'text-yellow-500'}`}>
              {permissionGranted ? '🔔 Notifications enabled' : '🔕 Notifications disabled'}
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="rounded-lg border border-border/40 bg-card p-6 shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Stocks</h2>
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
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-medium">${stock.price.toFixed(2)}</p>
                        <p className={`text-sm ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {stock.changePercent >= 0 ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                        </p>
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