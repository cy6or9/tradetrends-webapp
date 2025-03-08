import { useState, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
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
    sectors?: string[];
    industries?: string[];
    sortBy?: string;
    sortDir?: "asc" | "desc";
    search?: string;
    tradingApp?: string;
    industry?: string; // Added industry filter
    exchange?: string; // Added exchange filter
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
  const [sort, setSort] = useState<{sortBy: string, sortDir: "asc" | "desc"} | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const fetchStocks = async ({ pageParam = 1 }) => {
    const searchParams = new URLSearchParams({
      page: pageParam.toString(),
      limit: '50',
      ...(filters.search && { search: filters.search }),
      ...(filters.tradingApp && { tradingApp: filters.tradingApp }),
      ...(filters.industry && { industry: filters.industry }),
      ...(filters.exchange && { exchange: filters.exchange })
    });

    const response = await fetch(`/api/stocks/search?${searchParams}`);
    if (!response.ok) throw new Error('Failed to fetch stocks');
    return response.json();
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
    getNextPageParam: (lastPage, pages) => {
      return lastPage.hasMore ? pages.length + 1 : undefined;
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
    initialPageParam: 1,
  });

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleObserver]);

  const handleSort = (sortBy: string) => {
    if (sort && sort.sortBy === sortBy) {
      setSort({sortBy, sortDir: sort.sortDir === "asc" ? "desc" : "asc"});
    } else {
      setSort({sortBy, sortDir: "asc"});
    }
  };

  // Flatten and filter all stocks from all pages
  const filteredStocks = (data?.pages.flatMap(page => page.stocks) ?? [])
    .filter((stock) => {
      if (!stock) return false;
      if (filters.minPrice && stock.price < filters.minPrice) return false;
      if (filters.maxPrice && stock.price > filters.maxPrice) return false;
      if (filters.minChangePercent && stock.changePercent < filters.minChangePercent) return false;
      if (filters.maxChangePercent && stock.changePercent > filters.maxChangePercent) return false;
      if (filters.minAnalystRating && stock.analystRating < filters.minAnalystRating) return false;
      if (filters.minVolume && stock.volume < filters.minVolume * 1_000_000) return false;
      if (filters.maxVolume && stock.volume > filters.maxVolume * 1_000_000) return false;
      if (filters.minMarketCap && stock.marketCap < filters.minMarketCap * 1_000_000_000) return false;
      if (filters.maxMarketCap && stock.marketCap > filters.maxMarketCap * 1_000_000_000) return false;
      if (filters.minBeta && stock.beta < filters.minBeta) return false;
      if (filters.maxBeta && stock.beta > filters.maxBeta) return false;
      if (filters.industries?.length && !filters.industries.includes(stock.industry)) return false;
      return true;
    });

  // Update parent component with stock count
  useEffect(() => {
    if (filteredStocks.length) {
      setStocks?.(filteredStocks);
    }
  }, [filteredStocks, setStocks]);

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

  if (!filteredStocks.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No stocks found matching your criteria.
      </div>
    );
  }

  // Sort stocks if sorting is active
  if (sort && sort.sortBy) {
    filteredStocks.sort((a, b) => {
      const aVal = a[sort.sortBy as keyof Stock];
      const bVal = b[sort.sortBy as keyof Stock];
      const modifier = sort.sortDir === "asc" ? 1 : -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * modifier;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * modifier;
      }
      return 0;
    });
  }

  return (
    <Card>
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
                  Analyst Rating <ArrowUpDown className="ml-2 h-4 w-4" />
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
            {filteredStocks.map((stock) => (
              <TableRow
                key={stock.symbol}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/stock/${stock.symbol}`)}
              >
                <TableCell className="font-medium flex items-center gap-2">
                  {stock.symbol}
                  {stock.isFavorite && <Star className="w-4 h-4 text-yellow-500" />}
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

        {/* Loading indicator and intersection observer target */}
        <div ref={loadMoreRef} className="py-4 text-center">
          {isFetchingNextPage && (
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          )}
        </div>
      </div>
    </Card>
  );
}