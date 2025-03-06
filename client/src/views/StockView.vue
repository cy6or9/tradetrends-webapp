<template>
  <div class="container py-4" v-if="stock">
    <div class="row mb-4">
      <div class="col">
        <h1 class="mb-2">
          {{ stock.name }} ({{ stock.symbol }})
          <span 
            class="badge"
            :class="stock.analystRating >= 90 ? 'bg-success' : 'bg-secondary'"
          >
            {{ stock.analystRating }}% Buy
          </span>
        </h1>

        <div class="d-flex align-items-center gap-3">
          <h2 class="mb-0">${{ stock.price.toFixed(2) }}</h2>
          <span :class="stock.changePercent > 0 ? 'text-success' : 'text-danger'">
            <i class="bi" :class="stock.changePercent > 0 ? 'bi-arrow-up' : 'bi-arrow-down'"></i>
            {{ stock.changePercent.toFixed(2) }}%
          </span>
        </div>
      </div>

      <div class="col-auto">
        <button class="btn btn-outline-primary me-2" @click="toggleFavorite">
          <i class="bi bi-star-fill me-2"></i>
          Add to Favorites
        </button>
        <button class="btn btn-outline-secondary">
          <i class="bi bi-bell me-2"></i>
          Set Alert
        </button>
      </div>
    </div>

    <div class="row">
      <!-- Price Chart -->
      <div class="col-lg-8 mb-4">
        <stock-chart :symbol="stock.symbol" />
      </div>

      <!-- Stock Details -->
      <div class="col-lg-4 mb-4">
        <div class="card">
          <div class="card-header">
            <h5 class="card-title mb-0">Stock Details</h5>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-6">Market Cap</dt>
              <dd class="col-sm-6">${{ (stock.marketCap / 1e9).toFixed(2) }}B</dd>

              <dt class="col-sm-6">Volume</dt>
              <dd class="col-sm-6">{{ (stock.volume / 1e6).toFixed(1) }}M shares</dd>

              <dt class="col-sm-6">Sector</dt>
              <dd class="col-sm-6">{{ stock.sector }}</dd>

              <template v-if="stock.shortInterest">
                <dt class="col-sm-6">Short Interest</dt>
                <dd class="col-sm-6">{{ stock.shortInterest.toFixed(2) }}%</dd>
              </template>

              <template v-if="stock.dividendYield">
                <dt class="col-sm-6">Dividend Yield</dt>
                <dd class="col-sm-6">{{ stock.dividendYield.toFixed(2) }}%</dd>
              </template>

              <template v-if="stock.earningsDate">
                <dt class="col-sm-6">Next Earnings</dt>
                <dd class="col-sm-6">{{ new Date(stock.earningsDate).toLocaleDateString() }}</dd>
              </template>
            </dl>
          </div>
        </div>
      </div>

      <!-- AI Analysis -->
      <div class="col-12 mb-4" v-if="analysis">
        <div class="card">
          <div class="card-header">
            <h5 class="card-title mb-0">AI Analysis</h5>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <span 
                class="badge"
                :class="{
                  'bg-success': analysis.sentiment === 'bullish',
                  'bg-danger': analysis.sentiment === 'bearish',
                  'bg-secondary': analysis.sentiment === 'neutral'
                }"
              >
                {{ analysis.sentiment.toUpperCase() }}
              </span>
              <span class="ms-2 text-muted">
                Confidence: {{ (analysis.confidence * 100).toFixed(1) }}%
              </span>
            </div>
            <p class="mb-0">{{ analysis.analysis }}</p>
          </div>
        </div>
      </div>

      <!-- News -->
      <div class="col-12">
        <stock-news :symbol="stock.symbol" />
      </div>
    </div>
  </div>
  <div v-else class="container py-4">
    <div class="alert alert-warning">
      Stock not found
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import StockChart from '../components/StockChart.vue';
import StockNews from '../components/StockNews.vue';
import type { Stock } from '@/lib/types';
import type { StockAnalysis } from '@/lib/mistral';

const route = useRoute();
const symbol = route.params.symbol as string;

const { data: stock } = useQuery<Stock>({
  queryKey: ['stock', symbol],
  queryFn: async () => {
    const response = await fetch(`/api/stocks/${symbol}`);
    if (!response.ok) throw new Error('Failed to fetch stock');
    return response.json();
  }
});

const { data: analysis } = useQuery<StockAnalysis>({
  queryKey: ['analysis', symbol],
  queryFn: async () => {
    const response = await fetch(`/api/stocks/${symbol}/analysis`);
    if (!response.ok) throw new Error('Failed to fetch analysis');
    return response.json();
  }
});

async function toggleFavorite() {
  try {
    // In a real app, get userId from auth context
    const userId = 1;
    await fetch(`/api/users/${userId}/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stockId: stock.value!.id,
        notifyOnRating: true
      })
    });
    alert('Added to favorites!');
  } catch (error) {
    alert('Failed to add to favorites');
  }
}
</script>