import { useState } from "react";
import { StockList } from "@/components/stock-list";
import { StockFilters } from "@/components/stock-filters";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWebSocket } from "@/hooks/useWebSocket";
import { SlidingMenu } from "@/components/sliding-menu";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Filters in sliding menu */}
      <SlidingMenu isOpen={isMenuOpen} onToggle={() => setIsMenuOpen(!isMenuOpen)}>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Filters & Sorting</h2>
          <StockFilters onFilterChange={setFilters} />
        </div>
      </SlidingMenu>

      {/* Main content */}
      <div className={`transition-all duration-200 ${isMenuOpen ? "lg:ml-[350px]" : "lg:ml-[350px]"}`}>
        <div className="container p-4 space-y-6">
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
          </Card>

          <StockList filters={filters} />
        </div>
      </div>
    </div>
  );
}