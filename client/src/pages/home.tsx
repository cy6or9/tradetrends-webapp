import { useState } from "react";
import { StockList } from "@/components/stock-list";
import { StockFilters } from "@/components/stock-filters";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWebSocket } from "@/hooks/useWebSocket";
import { SlidingMenu } from "@/components/sliding-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Separate component for WebSocket status to isolate potential errors
function WebSocketStatus({ stockCount }: { stockCount: number }) {
  const { isConnected } = useWebSocket();

  if (import.meta.env.PROD) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant={isConnected ? "success" : "destructive"}>
        {isConnected ? "Live" : "Connecting..."}
      </Badge>
      <span className="text-sm text-muted-foreground">
        {stockCount} stocks tracked
      </span>
    </div>
  );
}

export default function Home() {
  const [filters, setFilters] = useState({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("stocks");

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile menu toggle */}
      <Button
        variant="outline"
        size="default"
        className="fixed top-4 left-4 z-50 lg:hidden flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        <Menu className="h-4 w-4" />
        <ChevronRight className={`h-4 w-4 transition-transform ${isMenuOpen ? "rotate-180" : ""}`} />
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
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-4xl font-bold">Stock Market Analysis</CardTitle>
                  <p className="text-muted-foreground mt-2">
                    Track stocks with high analyst ratings and market momentum
                  </p>
                </div>
                <ErrorBoundary fallback={null}>
                  <WebSocketStatus stockCount={50} />
                </ErrorBoundary>
              </div>
            </CardHeader>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="stocks">Hot Stocks</TabsTrigger>
              <TabsTrigger value="ipo">IPO Calendar</TabsTrigger>
              <TabsTrigger value="spacs">SPACs</TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "stocks" && <StockList filters={filters} />}
          {activeTab === "ipo" && <div>IPO Calendar content coming soon...</div>}
          {activeTab === "spacs" && <div>SPACs content coming soon...</div>}
        </div>
      </div>
    </div>
  );
}