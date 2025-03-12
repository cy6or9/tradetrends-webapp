import { useCallback, useEffect, useRef, useState } from "react";
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

const LoadingSpinner = () => (
  <div className="p-8 text-center text-muted-foreground">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
    <p>Loading stocks...</p>
    <p className="text-sm text-muted-foreground mt-2">
      This may take a moment as we gather real-time market data
    </p>
  </div>
);

const RatingInfoTooltip = () => (
  <TooltipContent className="w-[350px] p-3 text-xs z-[9999] relative bg-popover/95 shadow-lg backdrop-blur-sm border-border/50">
    <p className="font-semibold mb-2">How the analyst rating calculation works:</p>
    <div className="space-y-2">
      <div>
        <p className="font-medium">Base Rating (0-100):</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Strong Buy: 125% weight (enables ratings above 100% for strong conviction)</li>
          <li>Buy: 100% weight</li>
          <li>Hold: 50% weight</li>
          <li>Sell: 0% weight</li>
          <li>Strong Sell: -25% weight (penalty)</li>
        </ul>
      </div>
      <div>
        <p className="font-medium">Quality Factors:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Analyst Coverage: Score reduced if less than 20 analysts</li>
          <li>Price Target Impact: 30% of final score</li>
          <li>No artificial cap - enables exceptional ratings</li>
        </ul>
      </div>
      <div>
        <p className="font-medium">Updates:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Ratings update every 6 hours</li>
          <li>Price targets factored when available</li>
          <li>Historical data preserved</li>
        </ul>
      </div>
    </div>
  </TooltipContent>
);

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
  const [sort, setSort] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  }>({ key: 'analystRating', direction: 'desc' });
  const [isTabActive, setIsTabActive] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const favoriteStocks = await stockCache.getFavorites();
        setFavorites(new Set(favoriteStocks.map(stock => stock.symbol)));
      } catch (error) {
        console.error('Failed to load favorites:', error);
        setFavorites(new Set());
      }
    };

    loadFavorites();

    // Refresh favorites every 30 seconds
    const interval = setInterval(loadFavorites, 30000);
    return () => clearInterval(interval);
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
    if (filters.isFavorite) {
      try {
        const favoriteStocks = await stockCache.getFavorites();
        return {
          stocks: favoriteStocks,
          hasMore: false,
          total: favoriteStocks.length
        };
      } catch (error) {
        console.error('Failed to fetch favorites:', error);
        return {
          stocks: [],
          hasMore: false,
          total: 0
        };
      }
    }

    if (filters.isHotStock) {
      try {
        const cachedStocks = await stockCache.getAllStocks();
        const hotStocks = cachedStocks.filter(stock => stock.price >= 0.03)
          .filter(stock =>
            (Math.abs(stock.changePercent) * 4) +
            ((stock.volume > 1000000 ? 100 : (stock.volume / 10000)) * 0.25) +
            (stock.analystRating * 0.15) +
            (stock.beta > 1 ? 10 : 0) +
            (stock.marketCap > 1000000000 ? 10 : 0) > 50
          )
          .sort((a, b) => {
            const aScore = (Math.abs(a.changePercent) * 4) +
              ((a.volume > 1000000 ? 100 : (a.volume / 10000)) * 0.25) +
              (a.analystRating * 0.15);
            const bScore = (Math.abs(b.changePercent) * 4) +
              ((b.volume > 1000000 ? 100 : (b.volume / 10000)) * 0.25) +
              (b.analystRating * 0.15);
            return bScore - aScore;
          });

        return {
          stocks: hotStocks,
          hasMore: false,
          total: hotStocks.length
        };
      } catch (error) {
        console.error('Failed to fetch hot stocks:', error);
        return {
          stocks: [],
          hasMore: false,
          total: 0
        };
      }
    }

    const searchParams = new URLSearchParams({
      page: pageParam.toString(),
      limit: '50',
    });

    if (filters.search) {
      searchParams.append('search', filters.search.toUpperCase());
    } else {
      if (filters.tradingApp && filters.tradingApp !== 'Any') {
        searchParams.append('tradingApp', filters.tradingApp);
      }
      if (filters.industry && filters.industry !== 'Any') {
        searchParams.append('industry', filters.industry);
      }
      if (filters.exchange && filters.exchange !== 'Any') {
        searchParams.append('exchange', filters.exchange);
      }
    }

    try {
      const response = await fetch(`/api/stocks/search?${searchParams}`);
      if (!response.ok) throw new Error('Failed to fetch stocks');
      const data = await response.json();

      if (data.stocks?.length > 0) {
        await stockCache.updateStocks(data.stocks);
      }

      return data;
    } catch (error) {
      console.error('Error fetching stocks:', error);
      const cachedStocks = await stockCache.getAllStocks();
      return {
        stocks: cachedStocks,
        hasMore: false,
        total: cachedStocks.length
      };
    }
  };

  const handleToggleFavorite = useCallback(async (symbol: string) => {
    try {
      // Store current favorites view state
      const wasShowingFavorites = filters.isFavorite;

      // Update local state immediately
      const newFavorites = new Set(favorites);
      const isCurrentlyFavorited = newFavorites.has(symbol);

      if (isCurrentlyFavorited) {
        newFavorites.delete(symbol);
      } else {
        newFavorites.add(symbol);
      }
      setFavorites(newFavorites);

      // Persist the change
      await stockCache.toggleFavorite(symbol);

      // Invalidate and refetch while preserving favorites view state
      await queryClient.invalidateQueries({ queryKey: ["/api/stocks"] });

      // If we were showing favorites, trigger a refresh
      if (wasShowingFavorites) {
        setForceUpdate(prev => prev + 1);
      }

    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      // Revert UI state on error
      setFavorites(prev => {
        const revertedFavorites = new Set(prev);
        if (revertedFavorites.has(symbol)) {
          revertedFavorites.delete(symbol);
        } else {
          revertedFavorites.add(symbol);
        }
        return revertedFavorites;
      });
    }
  }, [filters.isFavorite, favorites, queryClient]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["/api/stocks", filters, forceUpdate],
    queryFn: fetchStocks,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.total > (lastPage.stocks?.length || 0) ? Math.ceil(lastPage.stocks.length / 50) + 1 : undefined;
    },
    staleTime: 30000,
    initialPageParam: 1,
  });

  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allStocks = data?.pages.reduce((acc, page) => {
    const seenSymbols = new Set(acc.map(s => s.symbol));
    const newStocks = page.stocks.filter(s => !seenSymbols.has(s.symbol));
    return [...acc, ...newStocks];
  }, [] as any[]) ?? [];

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
        {filters.isFavorite ? "No favorite stocks yet." : "No stocks found matching your criteria."}
      </div>
    );
  }

  const handleSort = (key: string) => {
    setSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <TooltipProvider>
      <Card>
        {!isTabActive && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
            <p className="text-sm text-muted-foreground">Tab inactive - Resume viewing to update</p>
          </div>
        )}
        <div className="h-[600px] overflow-hidden relative">
          <div className="absolute inset-0 overflow-auto">
            <div className="min-w-[800px]">
              {/* Fixed header */}
              <div className="sticky top-0 z-50">
                <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/95 border-b border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="sticky left-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/95 border-r border-border w-[120px]"
                        >
                          <Button variant="ghost" onClick={() => handleSort('symbol')} className="h-12 text-left font-medium w-full justify-between">
                            Symbol <ArrowUpDown className="h-4 w-4" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[300px]">
                          <Button variant="ghost" onClick={() => handleSort('name')} className="h-12 text-left font-medium w-full justify-between">
                            Name <ArrowUpDown className="h-4 w-4" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-[100px]">
                          <div className="text-right">
                            <Button variant="ghost" onClick={() => handleSort('price')} className="h-12 font-medium px-0">
                              Price <ArrowUpDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableHead>
                        <TableHead className="w-[110px]">
                          <div className="text-right">
                            <Button variant="ghost" onClick={() => handleSort('changePercent')} className="h-12 font-medium px-0">
                              Change <ArrowUpDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableHead>
                        <TableHead className="w-[120px]">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" onClick={() => handleSort('analystRating')} className="h-12 font-medium px-0">
                              Rate <ArrowUpDown className="h-4 w-4" />
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-transparent">
                                  <Info className="h-4 w-4 text-muted-foreground hover:text-cyan-500" />
                                </Button>
                              </TooltipTrigger>
                              <RatingInfoTooltip />
                            </Tooltip>
                          </div>
                        </TableHead>
                        <TableHead className="w-[100px]">
                          <div className="text-right">
                            <Button variant="ghost" onClick={() => handleSort('volume')} className="h-12 font-medium px-0">
                              Vol <ArrowUpDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                  </Table>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="relative">
                <Table>
                  <TableBody>
                    {sortedStocks.map((stock) => (
                      <TableRow
                        key={stock.symbol}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => window.open(`/stock/${stock.symbol}`, '_blank')}
                      >
                        <TableCell
                          className="sticky left-0 z-40 bg-background border-r border-border w-[120px]"
                        >
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
                        <TableCell className="w-[300px]">{stock.name}</TableCell>
                        <TableCell className="w-[100px] text-right">${stock.price.toFixed(2)}</TableCell>
                        <TableCell className="w-[110px] text-right">
                          <div className="flex items-center justify-end gap-1">
                            {stock.changePercent > 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            <span
                              className={
                                stock.changePercent > 0 ? "text-green-500" : "text-red-500"
                              }
                            >
                              {stock.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="w-[120px] text-right">
                          <Badge
                            variant={stock.analystRating >= 85 ? "default" : "secondary"}
                          >
                            {stock.analystRating}%
                          </Badge>
                        </TableCell>
                        <TableCell className="w-[100px] text-right">
                          {stock.volume.toLocaleString()}
                        </TableCell>
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
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}