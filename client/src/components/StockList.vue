<template>
  <div class="card">
    <div class="table-responsive">
      <table class="table table-hover mb-0">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Price</th>
            <th>Change %</th>
            <th>Analyst Rating</th>
            <th>Volume</th>
            <th>Market Cap</th>
            <th>Sector</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading">
            <td colspan="9" class="text-center py-4">
              Loading stocks...
            </td>
          </tr>
          <template v-else>
            <tr v-for="stock in filteredStocks" :key="stock.id">
              <td>
                <router-link 
                  :to="{ name: 'stock', params: { symbol: stock.symbol }}"
                  class="text-decoration-none"
                >
                  {{ stock.symbol }}
                </router-link>
              </td>
              <td>{{ stock.name }}</td>
              <td>${{ stock.price.toFixed(2) }}</td>
              <td :class="stock.changePercent > 0 ? 'text-success' : 'text-danger'">
                <i class="bi" :class="stock.changePercent > 0 ? 'bi-arrow-up' : 'bi-arrow-down'"></i>
                {{ stock.changePercent.toFixed(2) }}%
              </td>
              <td>
                <span 
                  class="badge"
                  :class="stock.analystRating >= 90 ? 'bg-success' : 'bg-secondary'"
                >
                  {{ stock.analystRating }}%
                </span>
              </td>
              <td>{{ (stock.volume / 1e6).toFixed(1) }}M</td>
              <td>${{ (stock.marketCap / 1e9).toFixed(2) }}B</td>
              <td>{{ stock.sector }}</td>
              <td>
                <button 
                  class="btn btn-sm btn-outline-primary"
                  @click="toggleFavorite(stock)"
                  :title="stock.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
                >
                  <i class="bi" :class="stock.isFavorite ? 'bi-star-fill' : 'bi-star'"></i>
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useStocksStore } from '@/stores/stocks';
import type { Stock } from '@/lib/types';

const store = useStocksStore();

const { data: stocks, isLoading } = useQuery<Stock[]>({
  queryKey: ['stocks'],
  queryFn: async () => {
    const response = await fetch('/api/stocks');
    if (!response.ok) throw new Error('Failed to fetch stocks');
    return response.json();
  },
  refetchInterval: 30000 // Refresh every 30 seconds
});

const filteredStocks = computed(() => {
  if (!stocks.value) return [];
  return store.filteredStocks;
});

async function toggleFavorite(stock: Stock) {
  try {
    await store.toggleFavorite(stock);
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
  }
}
</script>

<style scoped>
.table th {
  font-weight: 600;
  white-space: nowrap;
}

.badge {
  font-size: 0.875rem;
  padding: 0.35em 0.65em;
}

.bi {
  font-size: 0.875rem;
}
</style>