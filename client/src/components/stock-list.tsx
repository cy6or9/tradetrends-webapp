import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, TrendingDown, ArrowUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Stock } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { stockCache } from "@/lib/stockCache";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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
    industries?: string[];
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

  const handleSort = (key: keyof Stock) => {
    setSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

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
    if (pageParam === 1) {
      const cachedStocks = stockCache.getAllStocks();
      if (cachedStocks.length > 0) {
        if (filters.isHotStock) {
          const hotStocks = cachedStocks.filter(stock =>
            stock.analystRating >= 80 &&
            Math.abs(stock.changePercent) >= 2
          );
          return {
            stocks: hotStocks,
            hasMore: false,
            total: hotStocks.length
          };
        }
        return {
          stocks: cachedStocks,
          hasMore: false,
          total: cachedStocks.length
        };
      }
    }

    const searchParams = new URLSearchParams({
      page: pageParam.toString(),
      limit: '50',
      ...(filters.search && { search: filters.search }),
      ...(filters.tradingApp && filters.tradingApp !== 'Any' && { tradingApp: filters.tradingApp }),
      ...(filters.industry && filters.industry !== 'Any' && { industry: filters.industry }),
      ...(filters.exchange && filters.exchange !== 'Any' && { exchange: filters.exchange }),
      ...(filters.isFavorite && { isFavorite: 'true' }),
      ...(filters.afterHoursOnly && { afterHoursOnly: 'true' })
    });

    const response = await fetch(`/api/stocks/search?${searchParams}`);
    if (!response.ok) throw new Error('Failed to fetch stocks');
    const data = await response.json();

    stockCache.updateStocks(data.stocks);

    if (filters.isHotStock) {
      data.stocks = data.stocks.filter(stock =>
        stock.analystRating >= 80 &&
        Math.abs(stock.changePercent) >= 2
      );
      data.total = data.stocks.length;
      data.hasMore = false;
    }

    return data;
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

  const [columnSizes, setColumnSizes] = useState({
    symbol: 15,
    name: 25,
    price: 15,
    change: 15,
    rating: 15,
    volume: 15,
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
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Tab inactive - Resume viewing to update</p>
          </div>
        </div>
      )}
      <div className="w-full">
        <div className="flex flex-col">
          <ResizablePanelGroup direction="horizontal" className="min-h-0">
            <ResizablePanel defaultSize={columnSizes.symbol} minSize={10}>
              <div className="h-10 flex items-center px-2">
                <Button variant="ghost" onClick={() => handleSort('symbol')} className="w-full justify-between">
                  Symbol <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={columnSizes.name} minSize={15}>
              <div className="h-10 flex items-center px-2">
                <Button variant="ghost" onClick={() => handleSort('name')} className="w-full justify-between">
                  Name <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={columnSizes.price} minSize={10}>
              <div className="h-10 flex items-center px-2">
                <Button variant="ghost" onClick={() => handleSort('price')} className="w-full justify-between">
                  Price <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={columnSizes.change} minSize={10}>
              <div className="h-10 flex items-center px-2">
                <Button variant="ghost" onClick={() => handleSort('changePercent')} className="w-full justify-between">
                  Change % <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={columnSizes.rating} minSize={10}>
              <div className="h-10 flex items-center px-2">
                <Button variant="ghost" onClick={() => handleSort('analystRating')} className="w-full justify-between">
                  Rating <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={columnSizes.volume} minSize={10}>
              <div className="h-10 flex items-center px-2">
                <Button variant="ghost" onClick={() => handleSort('volume')} className="w-full justify-between">
                  Volume <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableBody>
                {sortedStocks.map((stock) => (
                  <TableRow
                    key={stock.symbol}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => window.open(`/stock/${stock.symbol}`, '_blank')}
                  >
                    <TableCell>
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
          </div>
        </div>

        {/* Loading indicator */}
        <div ref={loadMoreRef} className="py-4 text-center">
          {isFetchingNextPage && (
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          )}
        </div>
      </div>
    </Card>
  );
}