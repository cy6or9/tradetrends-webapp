import { useState } from "react";
import { StockList } from "@/components/stock-list";
import { StockFilters } from "@/components/stock-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function Home() {
  const [filters, setFilters] = useState({});
  const { isConnected } = useWebSocket();

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-4xl font-bold">Stock Market Analysis</CardTitle>
          <p className="text-muted-foreground">
            Track stocks with high analyst ratings and market momentum
          </p>
          {!import.meta.env.PROD && (
            <div className="text-sm text-muted-foreground">
              WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <StockFilters onFilterChange={setFilters} />
          <div className="mt-6">
            <StockList filters={filters} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}