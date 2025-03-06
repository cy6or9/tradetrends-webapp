<template>
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h5 class="card-title mb-0">Price Chart</h5>
      <div class="btn-group">
        <button 
          v-for="interval in intervals"
          :key="interval"
          class="btn btn-sm"
          :class="selectedInterval === interval ? 'btn-primary' : 'btn-outline-primary'"
          @click="changeInterval(interval)"
        >
          {{ interval }}
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="chart-container" style="height: 400px">
        <canvas ref="chartRef"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import Chart from 'chart.js/auto';
import type { Chart as ChartType } from 'chart.js';
import type { StockQuote } from '@/lib/finnhub';

const props = defineProps<{
  symbol: string
}>();

const chartRef = ref<HTMLCanvasElement | null>(null);
const chart = ref<ChartType | null>(null);
const priceData = ref<{ time: string; price: number }[]>([]);
const intervals = ['1D', '1W', '1M', '3M', '1Y'];
const selectedInterval = ref('1D');

// Real-time quote updates
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

    // Keep last 30 data points for real-time view
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

function changeInterval(interval: string) {
  selectedInterval.value = interval;
  // Here you would fetch historical data based on the interval
  // and update the chart accordingly
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
        backgroundColor: 'rgba(13, 110, 253, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: (value) => `$${value}`
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => `$${context.parsed.y.toFixed(2)}`
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
});

onUnmounted(() => {
  if (chart.value) {
    chart.value.destroy();
  }
});
</script>