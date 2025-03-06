<template>
  <div class="card">
    <div class="card-header">
      <h5 class="card-title mb-0">Latest News</h5>
      <p class="card-subtitle text-muted mb-0">
        Recent news and updates about {{ symbol }}
      </p>
    </div>
    <div class="card-body">
      <div v-if="isLoading" class="text-center py-4">
        Loading news...
      </div>
      <div v-else class="news-container">
        <div v-for="item in news" :key="item.id" class="card mb-3">
          <div class="card-body">
            <a 
              :href="item.url" 
              target="_blank" 
              rel="noopener noreferrer"
              class="text-decoration-none"
            >
              <h6 class="card-title">{{ item.headline }}</h6>
              <p class="card-text text-muted small mb-2">{{ item.summary }}</p>
              <div class="d-flex justify-content-between align-items-center text-muted small">
                <span>{{ item.source }}</span>
                <span>{{ new Date(item.datetime * 1000).toLocaleDateString() }}</span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import type { StockNews } from '@/lib/finnhub';

const props = defineProps<{
  symbol: string
}>();

const { data: news, isLoading } = useQuery<StockNews[]>({
  queryKey: ['news', props.symbol],
  queryFn: async () => {
    const response = await fetch(`/api/stocks/${props.symbol}/news`);
    if (!response.ok) throw new Error('Failed to fetch news');
    return response.json();
  }
});
</script>

<style scoped>
.news-container {
  max-height: 500px;
  overflow-y: auto;
}
</style>