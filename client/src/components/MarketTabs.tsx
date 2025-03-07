import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  getCryptoQuote, 
  getIpoCalendar, 
  getSpacList,
  type IpoEvent,
  type CryptoQuote,
  type Spac 
} from '@/lib/finnhub';

// Crypto symbols to track
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL'];

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
  const [activeTab, setActiveTab] = useState<'crypto' | 'ipo' | 'spac'>('crypto');

  // Fetch quotes for each crypto symbol
  const cryptoQueries = CRYPTO_SYMBOLS.map(symbol => ({
    queryKey: ['crypto', symbol],
    queryFn: () => getCryptoQuote(symbol),
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
    refetchInterval: 10000 // Refresh every 10 seconds
  }));

  const cryptoResults = cryptoQueries.map(query => useQuery(query));

  const { data: ipoEvents = [], isLoading: iposLoading } = useQuery<IpoEvent[]>({
    queryKey: ['ipos'],
    queryFn: getIpoCalendar,
    refetchInterval: 60000 * 5 // Refresh every 5 minutes
  });

  const { data: spacs = [], isLoading: spacsLoading } = useQuery<Spac[]>({
    queryKey: ['spacs'],
    queryFn: getSpacList,
    refetchInterval: 60000 * 5
  });

  // Function to format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-1 rounded-lg bg-muted/50">
        <TabButton 
          active={activeTab === 'crypto'} 
          onClick={() => setActiveTab('crypto')}
        >
          Crypto
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
        {activeTab === 'crypto' && (
          <div className="grid gap-4">
            {CRYPTO_SYMBOLS.map((symbol, index) => {
              const { data: quote, isLoading, error } = cryptoResults[index];
              return (
                <div key={symbol} className="p-4 border border-border/40 rounded-lg">
                  {isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-6 w-24 bg-muted rounded mb-2"></div>
                      <div className="h-4 w-32 bg-muted/50 rounded"></div>
                    </div>
                  ) : error ? (
                    <div className="text-destructive">
                      <p className="font-medium">{symbol}</p>
                      <p className="text-sm">Error loading data - retrying...</p>
                    </div>
                  ) : quote ? (
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold">{symbol}/USDT</h3>
                        <p className="text-sm text-muted-foreground">
                          24h Range: ${quote.l.toLocaleString()} - ${quote.h.toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">${quote.c.toLocaleString()}</p>
                        <p className={quote.c > quote.o ? 'text-green-500' : 'text-red-500'}>
                          {((quote.c - quote.o) / quote.o * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-destructive">
                      <p className="font-medium">{symbol}</p>
                      <p className="text-sm">No data available</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'ipo' && (
          <div className="space-y-4">
            {iposLoading ? (
              <div className="text-center text-muted-foreground">Loading IPO calendar...</div>
            ) : ipoEvents.length === 0 ? (
              <div className="text-center text-muted-foreground">No upcoming IPOs found</div>
            ) : (
              ipoEvents.map(ipo => (
                <div key={ipo.symbol} className="p-4 border border-border/40 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{ipo.name} ({ipo.symbol})</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(ipo.date).toLocaleDateString()}
                      </p>
                      {ipo.shares && (
                        <p className="text-sm text-muted-foreground">
                          Shares: {formatNumber(ipo.shares)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                        {ipo.exchange}
                      </span>
                      {ipo.price && (
                        <p className="mt-1 font-medium">
                          ${ipo.price.toFixed(2)}
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
            {spacsLoading ? (
              <div className="text-center text-muted-foreground">Loading SPACs...</div>
            ) : spacs.length === 0 ? (
              <div className="text-center text-muted-foreground">No active SPACs found</div>
            ) : (
              spacs.map(spac => (
                <div key={spac.symbol} className="p-4 border border-border/40 rounded-lg">
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