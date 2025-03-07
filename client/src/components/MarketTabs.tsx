import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  getIpoCalendar, 
  getCryptoQuote, 
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

  const { data: ipoEvents = [] } = useQuery<IpoEvent[]>({
    queryKey: ['ipos'],
    queryFn: getIpoCalendar,
    refetchInterval: 60000 * 5 // Refresh every 5 minutes
  });

  const { data: spacs = [] } = useQuery<Spac[]>({
    queryKey: ['spacs'],
    queryFn: getSpacList,
    refetchInterval: 60000 * 5
  });

  // Fetch quotes for each crypto symbol
  const cryptoQueries = CRYPTO_SYMBOLS.map(symbol => ({
    queryKey: ['crypto', symbol],
    queryFn: () => getCryptoQuote(symbol),
    refetchInterval: 10000 // Refresh every 10 seconds
  }));

  const cryptoResults = cryptoQueries.map(query => useQuery(query));

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
              const { data: quote, isLoading } = cryptoResults[index];
              return (
                <div key={symbol} className="p-4 border border-border/40 rounded-lg">
                  {isLoading ? (
                    <div className="animate-pulse">Loading {symbol}...</div>
                  ) : quote ? (
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold">{symbol}/USDT</h3>
                        <p className="text-sm text-muted-foreground">
                          24h Volume: {((quote.h - quote.l) * quote.c).toLocaleString()} USDT
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">${quote.c.toLocaleString()}</p>
                        <p className={quote.c > quote.pc ? 'text-green-500' : 'text-red-500'}>
                          {((quote.c - quote.pc) / quote.pc * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-destructive">Failed to load {symbol}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'ipo' && (
          ipoEvents.length === 0 ? (
            <p className="text-center text-muted-foreground">No upcoming IPOs found</p>
          ) : (
            ipoEvents.map(ipo => (
              <div key={ipo.symbol} className="p-4 border border-border/40 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{ipo.name} ({ipo.symbol})</h3>
                    <p className="text-sm text-muted-foreground">
                      {new Date(ipo.date).toLocaleDateString()}
                    </p>
                    <p className="text-sm">
                      {ipo.numberOfShares.toLocaleString()} shares at {ipo.price}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                      {ipo.exchange}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )
        )}

        {activeTab === 'spac' && (
          spacs.map(spac => (
            <div key={spac.symbol} className="p-4 border border-border/40 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{spac.name} ({spac.symbol})</h3>
                  <p className="text-sm text-muted-foreground">Status: {spac.status}</p>
                  {spac.targetCompany && (
                    <p className="text-sm">Target: {spac.targetCompany}</p>
                  )}
                  {spac.estimatedDealClose && (
                    <p className="text-sm">
                      Est. Close: {new Date(spac.estimatedDealClose).toLocaleDateString()}
                    </p>
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
    </div>
  );
}