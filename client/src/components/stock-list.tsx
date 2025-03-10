import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Stock } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { stockCache } from "@/lib/stockCache";

interface StockListProps {
  filters: {
    minPrice?: number;
    maxPrice?: number;
    minChangePercent?: number;
    maxChangePercent?: number;
    minAnalystRating?: number;
    minVolume?: number;
    maxVolume?: number;
    minMarketCap?: number;
    maxMarketCap?: number;
    minBeta?: number;
    maxBeta?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    search?: string;
    tradingApp?: string;
    industry?: string;
    exchange?: string;
    isFavorite?: boolean;
    afterHoursOnly?: boolean;
    isHotStock?: boolean;
  };
  setStocks?: (stocks: Stock[]) => void;
}

const LoadingSpinner = () => (
  <div className="p-8 text-center text-muted-foreground">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
    <p>Loading stocks...</p>
    <p className="text-sm text-muted-foreground mt-2">
      This may take a moment as we gather real-time market data
    </p>
  </div>
);

export function StockList({ filters, setStocks }: StockListProps) {
  const [sort, setSort] = useState<{
    key: keyof Stock;
    direction: 'asc' | 'desc';
  }>({ key: 'analystRating', direction: 'desc' });
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isTabActive, setIsTabActive] = useState(true);

  const handleSort = useCallback((key: keyof Stock) => {
    setSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchStocks = async ({ pageParam = 1 }) => {
    // Hot Stocks section - only use cache and apply criteria
    if (filters.isHotStock) {
      const cachedStocks = stockCache.getAllStocks();
      const hotStocks = cachedStocks.filter(stock =>
        stock.analystRating >= 90 &&
        Math.abs(stock.changePercent) >= 2
      );
      return {
        stocks: hotStocks,
        hasMore: false,
        total: hotStocks.length
      };
    }

    // Favorites section - only use cache
    if (filters.isFavorite) {
      const cachedStocks = stockCache.getAllStocks();
      const favoriteStocks = cachedStocks.filter(stock => stock.isFavorite);
      return {
        stocks: favoriteStocks,
        hasMore: false,
        total: favoriteStocks.length
      };
    }

    // All Stocks section - handle search and filters
    const searchParams = new URLSearchParams({
      page: pageParam.toString(),
      limit: '50',
    });

    // If searching in All Stocks section, ignore other filters
    if (filters.search) {
      searchParams.append('search', filters.search.toUpperCase());
    } else {
      // Apply filters only when not searching
      if (filters.tradingApp && filters.tradingApp !== 'Any') {
        searchParams.append('tradingApp', filters.tradingApp);
      }
      if (filters.industry && filters.industry !== 'Any') {
        searchParams.append('industry', filters.industry);
      }
      if (filters.exchange && filters.exchange !== 'Any') {
        searchParams.append('exchange', filters.exchange);
      }
      if (filters.afterHoursOnly) {
        searchParams.append('afterHoursOnly', 'true');
      }
    }

    try {
      const response = await fetch(`/api/stocks/search?${searchParams}`);
      if (!response.ok) throw new Error('Failed to fetch stocks');
      const data = await response.json();

      // Update cache with new stocks
      if (data.stocks?.length > 0) {
        stockCache.updateStocks(data.stocks);
      }

      return data;
    } catch (error) {
      console.error('Error fetching stocks:', error);
      throw error;
    }
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["/api/stocks", filters],
    queryFn: fetchStocks,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.total > (lastPage.stocks?.length || 0) ? Math.ceil(lastPage.stocks.length / 50) + 1 : undefined;
    },
    staleTime: 30000,
    initialPageParam: 1,
  });

  const allStocks = data?.pages.reduce((acc, page) => {
    const seenSymbols = new Set(acc.map(s => s.symbol));
    const newStocks = page.stocks.filter(s => !seenSymbols.has(s.symbol));
    return [...acc, ...newStocks];
  }, [] as Stock[]) ?? [];

  const sortedStocks = [...allStocks].sort((a, b) => {
    const aVal = a[sort.key];
    const bVal = b[sort.key];
    const modifier = sort.direction === 'asc' ? 1 : -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * modifier;
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * modifier;
    }
    return 0;
  });

  useEffect(() => {
    setStocks?.(sortedStocks);
  }, [sortedStocks, setStocks]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (stockId: number) => {
      const response = await apiRequest(`/api/stocks/${stockId}/favorite`, {
        method: 'POST'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stocks'] });
    }
  });

  if (isError) {
    return (
      <div className="p-8 text-center text-red-500">
        Error loading stocks. Please try again.
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!sortedStocks.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {filters.isFavorite ? "No favorite stocks yet." :
          filters.isHotStock ? "No hot stocks matching criteria." :
            "No stocks found matching your criteria."}
      </div>
    );
  }

  return (
    <Card className="relative">
      {!isTabActive && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
          <p className="text-sm text-muted-foreground">Tab inactive - Resume viewing to update</p>
        </div>
      )}
      <div className="w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('symbol')} className="h-8 text-left font-medium">
                  Symbol <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('name')} className="h-8 text-left font-medium">
                  Name <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('price')} className="h-8 text-left font-medium">
                  Price <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('changePercent')} className="h-8 text-left font-medium">
                  Change % <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('analystRating')} className="h-8 text-left font-medium">
                  Rating <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('volume')} className="h-8 text-left font-medium">
                  Volume <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStocks.map((stock) => (
              <TableRow
                key={stock.symbol}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => window.open(`/stock/${stock.symbol}`, '_blank')}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteMutation.mutate(stock.id);
                      }}
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          stock.isFavorite ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
                        )}
                      />
                    </Button>
                    {stock.symbol}
                  </div>
                </TableCell>
                <TableCell>{stock.name}</TableCell>
                <TableCell>${stock.price.toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {stock.changePercent > 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                    <span className={stock.changePercent > 0 ? "text-green-500" : "text-red-500"}>
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={stock.analystRating >= 90 ? "default" : "secondary"}>
                    {stock.analystRating}%
                  </Badge>
                </TableCell>
                <TableCell>{stock.volume.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div ref={loadMoreRef} className="py-4 text-center">
          {isFetchingNextPage && (
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          )}
        </div>
      </div>
    </Card>
  );
}