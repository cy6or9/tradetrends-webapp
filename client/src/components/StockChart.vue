<template>
  <div class="card">
    <div class="card-header">
      <h5 class="card-title mb-0">Price Chart</h5>
    </div>
    <div class="card-body">
      <div style="height: 400px">
        <!-- Using Chart.js -->
        <canvas ref="chartRef"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import Chart from 'chart.js/auto';
import type { Chart as ChartType } from 'chart.js';
import type { StockQuote } from '../lib/finnhub';

const props = defineProps<{
  symbol: string
}>();

const chartRef = ref<HTMLCanvasElement | null>(null);
const chart = ref<ChartType | null>(null);
const priceData = ref<{ time: string; price: number }[]>([]);

const { data: quote } = useQuery<StockQuote>({
  queryKey: ['quote', props.symbol],
  queryFn: async () => {
    const response = await fetch(`/api/stocks/${props.symbol}/quote`);
    if (!response.ok) throw new Error('Failed to fetch quote');
    return response.json();
  },
  refetchInterval: 5000 // Refresh every 5 seconds
});

watch(quote, (newQuote) => {
  if (newQuote) {
    const time = new Date().toLocaleTimeString();
    priceData.value.push({ time, price: newQuote.c });
    if (priceData.value.length > 30) {
      priceData.value.shift();
    }
    updateChart();
  }
});

function updateChart() {
  if (!chart.value) return;

  chart.value.data.labels = priceData.value.map(d => d.time);
  chart.value.data.datasets[0].data = priceData.value.map(d => d.price);
  chart.value.update();
}

onMounted(() => {
  if (!chartRef.value) return;

  chart.value = new Chart(chartRef.value, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Price',
        data: [],
        borderColor: '#0d6efd',
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
});
</script>
