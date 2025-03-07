import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { StockChart } from "@/components/stock-chart";
import { StockNews as StockNewsComponent } from "@/components/stock-news";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, TrendingDown, BellPlus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getStockAnalysis } from "@/lib/mistral";
import { useToast } from "@/hooks/use-toast";
import type { Stock } from "@shared/schema";
import type { StockAnalysis } from "@/lib/mistral";
import type { NewsItem } from "@/lib/finnhub";

export default function StockPage() {
  const { symbol } = useParams();
  const { toast } = useToast();

  // Fetch stock details
  const { data: stock, isLoading: isLoadingStock } = useQuery<Stock>({
    queryKey: [`/api/stocks/${symbol}`],
  });

  // Fetch news for AI analysis
  const { data: news } = useQuery<NewsItem[]>({
    queryKey: [`/api/stocks/${symbol}/news`],
  });

  // Get AI analysis
  const { data: analysis, isLoading: isLoadingAnalysis } = useQuery<StockAnalysis>({
    queryKey: [`/api/stocks/${symbol}/analysis`],
    enabled: !!news && news.length > 0,
    queryFn: async () => {
      const summaries = news!.map(item => item.summary);
      return getStockAnalysis(symbol!, summaries);
    }
  });

  const toggleFavorite = async () => {
    try {
      // In a real app, you'd get the userId from auth context
      const userId = 1; // Placeholder
      await apiRequest('POST', `/api/users/${userId}/favorites`, {
        stockId: stock!.id,
        notifyOnRating: true
      });

      toast({
        title: "Added to Favorites",
        description: `You'll be notified when ${symbol} reaches high analyst ratings.`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add to favorites. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (isLoadingStock) {
    return <div className="container mx-auto p-4">Loading stock data...</div>;
  }

  if (!stock) {
    return <div className="container mx-auto p-4">Stock not found</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
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

        <div className="flex gap-2">
          <Button onClick={toggleFavorite} variant="outline">
            <Star className="w-4 h-4 mr-2" />
            Add to Favorites
          </Button>
          <Button variant="outline">
            <BellPlus className="w-4 h-4 mr-2" />
            Set Alert
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StockChart symbol={stock.symbol} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Stock Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Market Cap</div>
              <div>${(stock.marketCap / 1e9).toFixed(2)}B</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Volume</div>
              <div>{(stock.volume / 1e6).toFixed(1)}M shares</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Sector</div>
              <div>{stock.sector}</div>
            </div>
            {stock.shortInterest && (
              <div>
                <div className="text-sm text-muted-foreground">Short Interest</div>
                <div>{stock.shortInterest.toFixed(2)}%</div>
              </div>
            )}
            {stock.dividendYield && (
              <div>
                <div className="text-sm text-muted-foreground">Dividend Yield</div>
                <div>{stock.dividendYield.toFixed(2)}%</div>
              </div>
            )}
            {stock.earningsDate && (
              <div>
                <div className="text-sm text-muted-foreground">Next Earnings</div>
                <div>{new Date(stock.earningsDate).toLocaleDateString()}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {analysis && !isLoadingAnalysis && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Badge variant={analysis.sentiment === "bullish" ? "default" : analysis.sentiment === "bearish" ? "destructive" : "secondary"}>
                    {analysis.sentiment.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Confidence: {(analysis.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm">{analysis.analysis}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="lg:col-span-3">
          <StockNewsComponent symbol={stock.symbol} />
        </div>
      </div>
    </div>
  );
}