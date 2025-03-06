import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Stock, StockFilters } from '@/lib/types';
import { getStockQuote, getStockNews } from '@/lib/finnhub';

export const useStocksStore = defineStore('stocks', () => {
  const stocks = ref<Stock[]>([]);
  const filters = ref<StockFilters>({
    minAnalystRating: '75',
    sortBy: 'analystRating',
    sortDir: 'desc'
  });

  // Computed property for filtered stocks
  const filteredStocks = computed(() => {
    let filtered = stocks.value.filter(stock => {
      if (filters.value.minPrice && stock.price < parseFloat(filters.value.minPrice)) return false;
      if (filters.value.maxPrice && stock.price > parseFloat(filters.value.maxPrice)) return false;
      if (filters.value.minAnalystRating && stock.analystRating < parseFloat(filters.value.minAnalystRating)) return false;
      if (filters.value.sectors && stock.sector !== filters.value.sectors) return false;
      return true;
    });

    if (filters.value.sortBy) {
      filtered.sort((a, b) => {
        const aVal = a[filters.value.sortBy as keyof Stock];
        const bVal = b[filters.value.sortBy as keyof Stock];
        return filters.value.sortDir === 'asc' ? 
          (aVal > bVal ? 1 : -1) : 
          (aVal < bVal ? 1 : -1);
      });
    }

    return filtered;
  });

  // Actions
  function setFilters(newFilters: Partial<StockFilters>) {
    filters.value = { ...filters.value, ...newFilters };
  }

  async function updateStockQuotes() {
    for (const stock of stocks.value) {
      const quote = await getStockQuote(stock.symbol);
      if (quote) {
        stock.price = quote.c;
        stock.changePercent = quote.dp;
      }
    }
  }

  // Initialize with some test data
  function initializeTestData() {
    stocks.value = [
      {
        id: 1,
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 175.0,
        changePercent: 1.2,
        analystRating: 92,
        volume: 55000000,
        marketCap: 2800000000000,
        sector: 'Technology',
        earningsDate: '2024-04-15'
      },
      // Add more test stocks here
    ];
  }

  return {
    stocks,
    filters,
    filteredStocks,
    setFilters,
    updateStockQuotes,
    initializeTestData
  };
});
