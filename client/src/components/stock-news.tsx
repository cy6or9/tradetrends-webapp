import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface NewsItem {
  id: string;
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
}

interface StockNewsProps {
  symbol: string;
}

export function StockNews({ symbol }: StockNewsProps) {
  const { data: news, isLoading } = useQuery<NewsItem[]>({
    queryKey: [`/api/stocks/${symbol}/news`],
  });

  if (isLoading) {
    return <div>Loading news...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest News</CardTitle>
        <CardDescription>Recent news and updates about {symbol}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-4">
            {news?.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:opacity-80"
                  >
                    <h3 className="font-semibold mb-2">{item.headline}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {item.summary}
                    </p>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.source}</span>
                      <span>
                        {new Date(item.datetime * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}