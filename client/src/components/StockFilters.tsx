import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const SORT_OPTIONS = [
  { value: 'symbol:asc', label: 'Symbol: A to Z' },
  { value: 'symbol:desc', label: 'Symbol: Z to A' },
  { value: 'price:asc', label: 'Price: Low to High' },
  { value: 'price:desc', label: 'Price: High to Low' },
  { value: 'changePercent:desc', label: 'Biggest Gainers' },
  { value: 'changePercent:asc', label: 'Biggest Losers' },
  { value: 'marketCap:desc', label: 'Market Cap: Highest' },
  { value: 'marketCap:asc', label: 'Market Cap: Lowest' },
  { value: 'volume:desc', label: 'Volume: Highest' },
  { value: 'volume:asc', label: 'Volume: Lowest' },
  { value: 'high52Week:desc', label: '52-Week High: Highest' },
  { value: 'low52Week:asc', label: '52-Week Low: Lowest' },
  { value: 'beta:desc', label: 'Volatility (Beta): Highest' },
  { value: 'beta:asc', label: 'Volatility (Beta): Lowest' },
];

const EXCHANGES = ['NYSE', 'NASDAQ'];

export interface FilterOptions {
  query: string;
  exchange: string;
  sort: string;
  minPrice?: number;
  maxPrice?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
}

interface StockFiltersProps {
  onFilterChange: (filters: FilterOptions) => void;
}

export function StockFilters({ onFilterChange }: StockFiltersProps) {
  const [filters, setFilters] = useState<FilterOptions>({
    query: '',
    exchange: '',
    sort: 'marketCap:desc' // Default sort by market cap
  });

  const handleFilterChange = (name: keyof FilterOptions, value: string | number) => {
    const newFilters = { ...filters, [name]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filter Stocks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Input
              placeholder="Search by symbol or name..."
              value={filters.query}
              onChange={(e) => handleFilterChange('query', e.target.value)}
              className="w-full"
            />
          </div>

          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Exchange
              </label>
              <select
                value={filters.exchange}
                onChange={(e) => handleFilterChange('exchange', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="">All Exchanges</option>
                {EXCHANGES.map((exchange) => (
                  <option key={exchange} value={exchange}>
                    {exchange}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Sort By
              </label>
              <select
                value={filters.sort}
                onChange={(e) => handleFilterChange('sort', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Min Price ($)
              </label>
              <Input
                type="number"
                min={0}
                value={filters.minPrice || ''}
                onChange={(e) => handleFilterChange('minPrice', e.target.valueAsNumber)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Max Price ($)
              </label>
              <Input
                type="number"
                min={0}
                value={filters.maxPrice || ''}
                onChange={(e) => handleFilterChange('maxPrice', e.target.valueAsNumber)}
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              const defaultFilters = {
                query: '',
                exchange: '',
                sort: 'marketCap:desc',
              };
              setFilters(defaultFilters);
              onFilterChange(defaultFilters);
            }}
            className="w-full"
          >
            Reset Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}