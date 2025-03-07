import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  getIpoCalendar, 
  getSpacList,
  type IpoEvent,
  type Spac,
  type Stock 
} from '@/lib/finnhub';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium transition-colors
      ${active 
        ? 'bg-primary text-primary-foreground' 
        : 'hover:bg-primary/10 text-muted-foreground'
      } rounded-md`}
  >
    {children}
  </button>
);

export function MarketTabs() {
  const [activeTab, setActiveTab] = useState<'hot' | 'ipo' | 'spac'>('hot');

  // Fetch stock data for hot stocks section
  const { data: hotStocks = [], isLoading: stocksLoading } = useQuery<Stock[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      const response = await fetch('/api/stocks/search');
      if (!response.ok) throw new Error('Failed to fetch stocks');
      const data = await response.json();
      return data.sort((a: Stock, b: Stock) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 5); // Show top 5 movers
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch IPO calendar data
  const { data: ipoEvents = [], isLoading: iposLoading, error: ipoError } = useQuery<IpoEvent[]>({
    queryKey: ['ipos'],
    queryFn: getIpoCalendar,
    refetchInterval: 60000 * 5, // Refresh every 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000)
  });

  // Fetch SPAC data
  const { data: spacs = [], isLoading: spacsLoading, error: spacError } = useQuery<Spac[]>({
    queryKey: ['spacs'],
    queryFn: getSpacList,
    refetchInterval: 60000 * 5,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000)
  });

  // Function to format large numbers
  const formatNumber = (num: number | undefined) => {
    if (!num) return '0';
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-1 rounded-lg bg-muted/50">
        <TabButton 
          active={activeTab === 'hot'} 
          onClick={() => setActiveTab('hot')}
        >
          Hot Stocks
        </TabButton>
        <TabButton 
          active={activeTab === 'ipo'} 
          onClick={() => setActiveTab('ipo')}
        >
          IPO Calendar
        </TabButton>
        <TabButton 
          active={activeTab === 'spac'} 
          onClick={() => setActiveTab('spac')}
        >
          SPACs
        </TabButton>
      </div>

      <div className="space-y-4">
        {activeTab === 'hot' && (
          <div className="grid gap-4">
            {stocksLoading ? (
              <div className="text-center text-muted-foreground">Loading hot stocks...</div>
            ) : hotStocks.length === 0 ? (
              <div className="text-center text-muted-foreground">No stock data available</div>
            ) : (
              hotStocks.map((stock) => (
                <div key={stock.symbol} className="p-4 border border-border/40 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold">{stock.symbol}</h3>
                      <p className="text-sm text-muted-foreground">{stock.name}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span>Vol: {formatNumber(stock.volume)}</span>
                        <span>Cap: ${formatNumber(stock.marketCap)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">${stock.price.toFixed(2)}</p>
                      <p className={`text-sm ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stock.changePercent >= 0 ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'ipo' && (
          <div className="space-y-4">
            {ipoError ? (
              <div className="text-center text-destructive">
                <p>Error loading IPO calendar</p>
                <p className="text-sm">Please try again later</p>
              </div>
            ) : iposLoading ? (
              <div className="text-center text-muted-foreground">Loading IPO calendar...</div>
            ) : !Array.isArray(ipoEvents) || ipoEvents.length === 0 ? (
              <div className="text-center text-muted-foreground">No upcoming IPOs found</div>
            ) : (
              ipoEvents.map((ipo, index) => (
                <div key={`${ipo.symbol}-${index}`} className="p-4 border border-border/40 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{ipo.name} ({ipo.symbol})</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(ipo.date).toLocaleDateString()}
                      </p>
                      <div className="flex flex-col gap-1 mt-2">
                        {typeof ipo.shares === 'number' && (
                          <p className="text-sm text-muted-foreground">
                            Shares offered: {formatNumber(ipo.shares)}
                          </p>
                        )}
                        {typeof ipo.price === 'number' && (
                          <p className="text-sm text-muted-foreground">
                            Total value: ${formatNumber(ipo.shares * ipo.price)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                        {ipo.exchange}
                      </span>
                      {typeof ipo.price === 'number' && (
                        <p className="mt-2 font-medium">
                          ${ipo.price.toFixed(2)} per share
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'spac' && (
          <div className="space-y-4">
            {spacError ? (
              <div className="text-center text-destructive">
                <p>Error loading SPACs</p>
                <p className="text-sm">Please try again later</p>
              </div>
            ) : spacsLoading ? (
              <div className="text-center text-muted-foreground">Loading SPACs...</div>
            ) : !Array.isArray(spacs) || spacs.length === 0 ? (
              <div className="text-center text-muted-foreground">No active SPACs found</div>
            ) : (
              spacs.map((spac, index) => (
                <div key={`${spac.symbol}-${index}`} className="p-4 border border-border/40 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{spac.name} ({spac.symbol})</h3>
                      <p className="text-sm text-muted-foreground">Status: {spac.status}</p>
                      {spac.targetCompany && (
                        <p className="text-sm">Target: {spac.targetCompany}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        Trust: ${(spac.trustValue / 1e6).toFixed(1)}M
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}