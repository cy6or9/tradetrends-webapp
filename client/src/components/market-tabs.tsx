import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

interface MarketTabsProps {
  trackedStocks: {
    ipo: number;
    spacs: number;
    hotStocks: number;
  };
}

export function MarketTabs({ trackedStocks }: MarketTabsProps) {
  const [location] = useLocation();

  const tabs = [
    { name: "IPO Calendar", href: "/ipo", count: trackedStocks.ipo },
    { name: "SPACs", href: "/spacs", count: trackedStocks.spacs },
    { name: "Hot Stocks", href: "/hot-stocks", count: trackedStocks.hotStocks }
  ];

  // Find the active tab
  const activeTab = tabs.find(tab => location === tab.href) || tabs[0];

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
          {activeTab.count} stocks tracked
        </Badge>
      </div>
    </div>
  );
}