<template>
  <div class="container py-4">
    <div class="mb-4">
      <h1 class="display-4">Stock Market Analysis</h1>
      <p class="lead text-muted">
        Track stocks with high analyst ratings and market momentum
      </p>
    </div>

    <stock-filters @filter-change="updateFilters" />
    <stock-list :filters="filters" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useStocksStore } from '@/stores/stocks';
import StockFilters from '@/components/StockFilters.vue';
import StockList from '@/components/StockList.vue';

const store = useStocksStore();

// Initialize test data when component mounts
onMounted(() => {
  store.initializeTestData();
});

function updateFilters(newFilters: any) {
  store.setFilters(newFilters);
}
</script>