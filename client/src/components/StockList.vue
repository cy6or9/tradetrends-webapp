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
            <th>Sector</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading">
            <td colspan="7" class="text-center py-4">
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
              <td>{{ (stock.volume / 1000000).toFixed(1) }}M</td>
              <td>{{ stock.sector }}</td>
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
import type { Stock } from '@shared/schema';

const props = defineProps<{
  filters: {
    minPrice?: string;
    maxPrice?: string;
    minAnalystRating?: string;
    sectors?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }
}>();

const { data: stocks, isLoading } = useQuery<Stock[]>({
  queryKey: ['stocks'],
  queryFn: async () => {
    const response = await fetch('/api/stocks');
    if (!response.ok) throw new Error('Failed to fetch stocks');
    return response.json();
  }
});

const filteredStocks = computed(() => {
  if (!stocks.value) return [];

  let filtered = stocks.value.filter(stock => {
    if (props.filters.minPrice && stock.price < parseFloat(props.filters.minPrice)) return false;
    if (props.filters.maxPrice && stock.price > parseFloat(props.filters.maxPrice)) return false;
    if (props.filters.minAnalystRating && stock.analystRating < parseFloat(props.filters.minAnalystRating)) return false;
    if (props.filters.sectors && stock.sector !== props.filters.sectors) return false;
    return true;
  });

  if (props.filters.sortBy) {
    filtered.sort((a, b) => {
      const aVal = a[props.filters.sortBy as keyof Stock];
      const bVal = b[props.filters.sortBy as keyof Stock];
      return props.filters.sortDir === 'asc' ? 
        (aVal > bVal ? 1 : -1) : 
        (aVal < bVal ? 1 : -1);
    });
  }

  return filtered;
});
</script>

<style scoped>
.bi {
  font-size: 0.875rem;
}
</style>
