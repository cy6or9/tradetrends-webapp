import React, { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
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
import { Star, TrendingUp, TrendingDown, ArrowUpDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stockCache } from "@/lib/stockCache";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface StockListProps {
  filters: {
    search?: string;
    tradingApp?: string;
    industry?: string;
    exchange?: string;
    isFavorite?: boolean;
    isHotStock?: boolean;
  };
  setStocks?: (stocks: any[]) => void;
}

export function StockList({ filters, setStocks }: StockListProps) {
  const queryClient = useQueryClient();
  const [sort, setSort] = useState({ key: 'analystRating', direction: 'desc' as 'asc' | 'desc' });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    async function loadFavorites() {
      try {
        const favoriteStocks = await stockCache.getFavorites();
        setFavorites(new Set(favoriteStocks.map(stock => stock.symbol)));
      } catch (error) {
        console.error('Failed to load favorites:', error);
      }
    }
    loadFavorites();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSort = useCallback((key: string) => {
    setSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["/api/stocks", filters],
    queryFn: async ({ pageParam = 1 }) => {
      console.log('Fetching stocks with params:', { pageParam, filters });

      if (filters.isFavorite) {
        const favoriteStocks = await stockCache.getFavorites();
        console.log('Fetched favorite stocks:', favoriteStocks.length);
        return {
          pages: [{
            stocks: favoriteStocks,
            hasMore: false,
            total: favoriteStocks.length
          }]
        };
      }

      const searchParams = new URLSearchParams({
        page: pageParam.toString(),
        limit: '50'
      });

      if (filters.search) {
        searchParams.append('search', filters.search.toUpperCase());
      }
      if (filters.industry && filters.industry !== 'Any') {
        searchParams.append('industry', filters.industry);
      }
      if (filters.exchange && filters.exchange !== 'Any') {
        searchParams.append('exchange', filters.exchange);
      }

      try {
        const response = await fetch(`/api/stocks/search?${searchParams}`);
        if (!response.ok) throw new Error('Failed to fetch stocks');
        const data = await response.json();
        console.log('API Response:', data);

        // Update cache with new stocks
        if (Array.isArray(data.stocks) && data.stocks.length > 0) {
          await stockCache.updateStocks(data.stocks);
        }

        return {
          pages: [{
            stocks: data.stocks || [],
            hasMore: data.hasMore || false,
            total: data.total || 0
          }]
        };
      } catch (error) {
        console.error('Error fetching stocks:', error);
        if (!isOnline) {
          const cachedStocks = await stockCache.getAllStocks();
          return {
            pages: [{
              stocks: cachedStocks,
              hasMore: false,
              total: cachedStocks.length
            }]
          };
        }
        throw error;
      }
    },
    getNextPageParam: (lastPage) => {
      const page = lastPage.pages?.[0];
      if (!page?.hasMore) return undefined;
      return page.total > (page.stocks?.length || 0) ? Math.ceil(page.stocks.length / 50) + 1 : undefined;
    },
    staleTime: 30000,
    initialPageParam: 1,
  });

  const allStocks = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.reduce((acc, page) => {
      if (!page.pages?.[0]?.stocks) return acc;
      const stocks = page.pages[0].stocks;
      const seenSymbols = new Set(acc.map(s => s.symbol));
      const newStocks = stocks.filter(s => !seenSymbols.has(s.symbol));
      return [...acc, ...newStocks];
    }, [] as any[]);
  }, [data?.pages]);

  const sortedStocks = React.useMemo(() => {
    return [...allStocks].sort((a, b) => {
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
  }, [allStocks, sort.key, sort.direction]);

  useEffect(() => {
    setStocks?.(sortedStocks);
  }, [sortedStocks, setStocks]);

  const handleToggleFavorite = useCallback(async (symbol: string) => {
    try {
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (prev.has(symbol)) {
          newFavorites.delete(symbol);
        } else {
          newFavorites.add(symbol);
        }
        return newFavorites;
      });

      await stockCache.toggleFavorite(symbol);

      if (filters.isFavorite) {
        const favoriteStocks = await stockCache.getFavorites();
        queryClient.setQueryData(
          ["/api/stocks", filters],
          { pages: [{ pages: [{ stocks: favoriteStocks, hasMore: false, total: favoriteStocks.length }] }] }
        );
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(symbol)) {
          newFavorites.delete(symbol);
        } else {
          newFavorites.add(symbol);
        }
        return newFavorites;
      });
    }
  }, [filters.isFavorite, queryClient]);

  if (isError) {
    return (
      <div className="p-8 text-center text-red-500">
        Error loading stocks. Please try again.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p>Loading stocks...</p>
      </div>
    );
  }

  if (!sortedStocks.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {filters.isFavorite ? "No favorite stocks yet." : "No stocks found matching your criteria."}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <div className="relative h-[600px]">
          <div className="absolute inset-0 overflow-auto">
            <div className="min-w-[800px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">
                      <Button variant="ghost" onClick={() => handleSort('symbol')} className="h-8 text-left font-medium w-full justify-between">
                        Symbol <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[200px]">
                      <Button variant="ghost" onClick={() => handleSort('name')} className="h-8 text-left font-medium w-full justify-between">
                        Name <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[100px]">
                      <Button variant="ghost" onClick={() => handleSort('price')} className="h-8 text-left font-medium w-full justify-between">
                        Price <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[110px]">
                      <Button variant="ghost" onClick={() => handleSort('changePercent')} className="h-8 text-left font-medium w-full justify-between">
                        Change <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[120px]">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" onClick={() => handleSort('analystRating')} className="h-8 text-left font-medium justify-between">
                          Rate <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <Info className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Analyst consensus rating
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="w-[100px]">
                      <Button variant="ghost" onClick={() => handleSort('volume')} className="h-8 text-left font-medium w-full justify-between">
                        Vol <ArrowUpDown className="ml-2 h-4 w-4" />
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(stock.symbol);
                            }}
                          >
                            <Star
                              className={cn(
                                "h-4 w-4",
                                favorites.has(stock.symbol) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
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
                        <Badge variant={stock.analystRating >= 85 ? "default" : "secondary"}>
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
        </div>
      </Card>
    </TooltipProvider>
  );
}