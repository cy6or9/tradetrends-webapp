<template>
  <div class="card mb-4">
    <div class="card-body">
      <form @submit.prevent class="row g-3">
        <!-- Price Range -->
        <div class="col-md-3">
          <label class="form-label">Price Range</label>
          <div class="input-group">
            <input 
              type="number" 
              class="form-control" 
              v-model="filters.minPrice" 
              placeholder="Min"
            >
            <input 
              type="number" 
              class="form-control" 
              v-model="filters.maxPrice" 
              placeholder="Max"
            >
          </div>
        </div>

        <!-- Analyst Rating -->
        <div class="col-md-3">
          <label class="form-label">Min Analyst Rating</label>
          <input 
            type="number" 
            class="form-control" 
            v-model="filters.minAnalystRating" 
            placeholder="75"
          >
        </div>

        <!-- Sector -->
        <div class="col-md-3">
          <label class="form-label">Sector</label>
          <select class="form-select" v-model="filters.sectors">
            <option value="">All Sectors</option>
            <option v-for="sector in sectors" :key="sector" :value="sector">
              {{ sector }}
            </option>
          </select>
        </div>

        <!-- Sort -->
        <div class="col-md-3">
          <label class="form-label">Sort By</label>
          <select class="form-select" v-model="filters.sortBy">
            <option value="price">Price</option>
            <option value="changePercent">Change %</option>
            <option value="analystRating">Analyst Rating</option>
            <option value="volume">Volume</option>
          </select>
        </div>

        <!-- Sort Direction -->
        <div class="col-md-3">
          <label class="form-label">Sort Direction</label>
          <select class="form-select" v-model="filters.sortDir">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <!-- Reset Button -->
        <div class="col-12">
          <button 
            type="button" 
            class="btn btn-outline-secondary" 
            @click="resetFilters"
          >
            Reset Filters
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';

const emit = defineEmits(['filter-change']);

const sectors = [
  'Technology',
  'Healthcare',
  'Finance',
  'Consumer Discretionary',
  'Energy',
  'Materials',
  'Industrials',
  'Utilities',
  'Real Estate'
];

const filters = reactive({
  minPrice: '',
  maxPrice: '',
  minAnalystRating: '75',
  sectors: '',
  sortBy: 'analystRating',
  sortDir: 'desc'
});

watch(filters, (newFilters) => {
  emit('filter-change', newFilters);
}, { deep: true });

function resetFilters() {
  Object.assign(filters, {
    minPrice: '',
    maxPrice: '',
    minAnalystRating: '75',
    sectors: '',
    sortBy: 'analystRating',
    sortDir: 'desc'
  });
}
</script>
