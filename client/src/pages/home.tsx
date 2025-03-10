import { useState, useEffect } from "react";
import { StockList } from "@/components/stock-list";
import { StockFilters } from "@/components/stock-filters";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWebSocket } from "@/hooks/useWebSocket";
import { SlidingMenu } from "@/components/sliding-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu, ChevronDown, ChevronRight, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IpoCalendar } from "@/components/ipo-calendar";
import { SpacList } from "@/components/spac-list";

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
  const [allStocksCount, setAllStocksCount] = useState(0);
  const [allStocksExpanded, setAllStocksExpanded] = useState(false);
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [favoriteStocksCount, setFavoriteStocksCount] = useState(0);

  // Hot stocks criteria - completely independent from filters
  const hotStocksFilter = {
    isHotStock: true // This is the only filter needed for hot stocks
  };

  // Update favorites expanded state based on count
  useEffect(() => {
    if (favoriteStocksCount > 3) {
      setFavoritesExpanded(false);
    }
  }, [favoriteStocksCount]);

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
      </Button>

      {/* Filters in sliding menu - only affects All Stocks section */}
      <SlidingMenu isOpen={isMenuOpen} onToggle={() => setIsMenuOpen(!isMenuOpen)}>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-cyan-500">Filters & Sorting</h2>
          <StockFilters onFilterChange={setFilters} />
        </div>
      </SlidingMenu>

      {/* Main content */}
      <div className={`transition-all duration-200 ${isMenuOpen ? "lg:ml-[350px]" : "lg:ml-[350px]"}`}>
        <div className="container mx-auto p-4 space-y-3 max-w-[100vw] overflow-x-hidden">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-4xl font-bold">Trade<span className="text-cyan-500">Trends</span></CardTitle>
                  <p className="text-cyan-500 mt-2">
                    Advanced stock market analysis filtering & trending trade data tracker for better investing
                  </p>
                </div>
                <ErrorBoundary fallback={null}>
                  <WebSocketStatus stockCount={allStocksCount} />
                </ErrorBoundary>
              </div>
            </CardHeader>
          </Card>

          {/* Market sections */}
          <div className="w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="ipo" className="text-cyan-500">IPO Calendar</TabsTrigger>
                <TabsTrigger value="spacs" className="text-cyan-500">SPACs</TabsTrigger>
                <TabsTrigger value="stocks" className="text-cyan-500">Hot Stocks</TabsTrigger>
              </TabsList>

              <div className="h-[min(400px,50vh)] overflow-hidden">
                <div className="h-full overflow-y-auto">
                  <TabsContent value="ipo" className="m-0">
                    <div className="mt-2">
                      <IpoCalendar />
                    </div>
                  </TabsContent>

                  <TabsContent value="spacs" className="m-0">
                    <div className="mt-2">
                      <SpacList />
                    </div>
                  </TabsContent>

                  <TabsContent value="stocks" className="m-0">
                    <div className="mt-2">
                      <p className="text-sm text-cyan-500 mb-2">
                        Trending stocks with high analyst ratings (90%+) and significant price movement today
                      </p>
                      <StockList filters={hotStocksFilter} />
                    </div>
                  </TabsContent>
                </div>
              </div>
            </Tabs>
          </div>

          {/* Favorites List - Collapsible */}
          <div className="mt-2">
            <Button
              variant="ghost"
              className="w-full flex justify-between items-center py-2 text-xl font-semibold text-cyan-500"
              onClick={() => setFavoritesExpanded(!favoritesExpanded)}
            >
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-current" />
                <span>Favorites</span>
                {favoriteStocksCount > 0 && (
                  <span className="text-sm text-muted-foreground">({favoriteStocksCount} stocks)</span>
                )}
              </div>
              {favoritesExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </Button>
            {favoritesExpanded && (
              <div className="mt-2">
                <StockList
                  filters={{ isFavorite: true }}
                  setStocks={(stocks) => setFavoriteStocksCount(stocks.length)}
                />
              </div>
            )}
          </div>

          {/* All Stocks - Collapsible */}
          <div className="mt-2">
            <Button
              variant="ghost"
              className="w-full flex justify-between items-center py-2 text-xl font-semibold text-cyan-500"
              onClick={() => setAllStocksExpanded(!allStocksExpanded)}
            >
              <div className="flex items-center gap-2">
                <span>All Stocks</span>
                <span className="text-sm text-muted-foreground">({allStocksCount} stocks)</span>
              </div>
              {allStocksExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </Button>
            {allStocksExpanded && (
              <div className="mt-2">
                <StockList filters={filters} setStocks={(stocks) => setAllStocksCount(stocks.length)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}