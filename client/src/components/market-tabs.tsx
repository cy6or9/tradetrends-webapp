import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

interface MarketTabsProps {
  activeTab: string;
  trackedStocks: number;
}

export function MarketTabs({ activeTab, trackedStocks }: MarketTabsProps) {
  const [location] = useLocation();

  const tabs = [
    { name: "IPO Calendar", href: "/ipo" },
    { name: "SPACs", href: "/spacs" },
    { name: "Hot Stocks", href: "/hot-stocks" }
  ];

  return (
    <div className="border-b border-border">
      <div className="container flex items-center justify-between py-4">
        <nav className="flex items-center gap-4">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                location === tab.href
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              {tab.name}
            </Link>
          ))}
        </nav>

        <Badge variant="outline" className="bg-green-500/10 text-green-500">
          {trackedStocks} stocks tracked
        </Badge>
      </div>
    </div>
  );
}