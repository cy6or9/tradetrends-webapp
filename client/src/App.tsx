import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
}

const queryClient = new QueryClient();

function StockApp() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-4xl font-bold text-foreground">Stock Market Analysis</h1>
          <p className="text-lg text-muted-foreground mt-2">
            Track stocks with high analyst ratings and market momentum
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="rounded-lg border bg-card p-6">
          {loading ? (
            <div className="text-center text-muted-foreground">
              Loading stock data...
            </div>
          ) : stocks.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No stocks found. Add some stocks to track.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stock list will be implemented here */}
              <p className="text-muted-foreground">Stock components coming soon...</p>
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