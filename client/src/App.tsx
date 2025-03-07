import { useState } from "react";

interface StockData {
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

export default function App() {
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-2">Stock Market Analysis</h1>
      <p className="text-muted-foreground mb-4">
        Track stocks with high analyst ratings and market momentum
      </p>

      <div className="p-4 border rounded-lg bg-card">
        {loading ? (
          <p>Loading stock data...</p>
        ) : (
          <div>Stock list will be implemented here</div>
        )}
      </div>
    </div>
  );
}