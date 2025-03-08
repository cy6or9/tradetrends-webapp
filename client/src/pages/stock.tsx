import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { StockChart } from "@/components/stock-chart";
import { StockNews as StockNewsComponent } from "@/components/stock-news";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, TrendingDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Stock } from "@shared/schema";

export default function StockPage() {
  const { symbol } = useParams();

  // Fetch stock details
  const { data: stock, isLoading: isLoadingStock } = useQuery<Stock>({
    queryKey: [`/api/stocks/${symbol}`],
  });

  if (isLoadingStock) {
    return (
      <div className="container mx-auto p-4">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-muted rounded mb-4"></div>
          <div className="h-4 w-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Stock Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The stock symbol "{symbol}" could not be found. Please check the symbol and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold flex items-center gap-3">
                {stock.name} ({stock.symbol})
                <Badge variant={stock.analystRating >= 90 ? "default" : "secondary"}>
                  {stock.analystRating}% Buy
                </Badge>
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-semibold">
                  ${stock.price.toFixed(2)}
                </span>
                <div className="flex items-center gap-1">
                  {stock.changePercent > 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  )}
                  <span className={stock.changePercent > 0 ? "text-green-500" : "text-red-500"}>
                    {stock.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Market Cap</div>
              <div>${(stock.marketCap / 1e9).toFixed(2)}B</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Volume</div>
              <div>{stock.volume.toLocaleString()} shares</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Industry</div>
              <div>{stock.industry}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for future chart and news components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Price Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Chart coming soon...</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Latest News</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">News feed coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}