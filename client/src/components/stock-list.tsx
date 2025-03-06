import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, TrendingDown } from "lucide-react";
import type { Stock } from "@shared/schema";

interface StockListProps {
  filters: {
    minPrice?: number;
    maxPrice?: number;
    minChangePercent?: number;
    maxChangePercent?: number;
    minAnalystRating?: number;
    sectors?: string[];
    sortBy?: string;
    sortDir?: "asc" | "desc";
  };
}

export function StockList({ filters }: StockListProps) {
  const { data: stocks, isLoading } = useQuery<Stock[]>({
    queryKey: ["/api/stocks"],
  });

  if (isLoading) {
    return <div>Loading stocks...</div>;
  }

  const filteredStocks = stocks?.filter((stock) => {
    if (filters.minPrice && stock.price < filters.minPrice) return false;
    if (filters.maxPrice && stock.price > filters.maxPrice) return false;
    if (filters.minChangePercent && stock.changePercent < filters.minChangePercent) return false;
    if (filters.maxChangePercent && stock.changePercent > filters.maxChangePercent) return false;
    if (filters.minAnalystRating && stock.analystRating < filters.minAnalystRating) return false;
    if (filters.sectors?.length && !filters.sectors.includes(stock.sector)) return false;
    return true;
  });

  if (filters.sortBy) {
    filteredStocks?.sort((a, b) => {
      const aVal = a[filters.sortBy as keyof Stock];
      const bVal = b[filters.sortBy as keyof Stock];
      return filters.sortDir === "asc" ? 
        (aVal > bVal ? 1 : -1) : 
        (aVal < bVal ? 1 : -1);
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Change %</TableHead>
              <TableHead>Analyst Rating</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Sector</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStocks?.map((stock) => (
              <TableRow key={stock.id}>
                <TableCell>
                  <Link href={`/stock/${stock.symbol}`}>
                    <a className="font-medium hover:underline">{stock.symbol}</a>
                  </Link>
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
                    {stock.changePercent.toFixed(2)}%
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={stock.analystRating >= 90 ? "default" : "secondary"}>
                    {stock.analystRating}%
                  </Badge>
                </TableCell>
                <TableCell>{(stock.volume / 1000000).toFixed(1)}M</TableCell>
                <TableCell>{stock.sector}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
