import { useState } from "react";
import { StockList } from "@/components/stock-list";
import { StockFilters } from "@/components/stock-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWebSocket } from "@/hooks/useWebSocket";

// Separate component for WebSocket status to isolate potential errors
function WebSocketStatus() {
  const { isConnected } = useWebSocket();

  if (import.meta.env.PROD) return null;

  return (
    <div className="text-sm text-muted-foreground">
      WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}

export default function Home() {
  const [filters, setFilters] = useState({});

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-4xl font-bold">Stock Market Analysis</CardTitle>
          <p className="text-muted-foreground">
            Track stocks with high analyst ratings and market momentum
          </p>
          <ErrorBoundary fallback={null}>
            <WebSocketStatus />
          </ErrorBoundary>
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