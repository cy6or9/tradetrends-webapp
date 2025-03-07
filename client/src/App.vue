<template>
  <div class="app">
    <div class="container py-4">
      <h1 class="text-center mb-4">Stock Market Analysis</h1>
      <p class="text-center text-muted">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const message = ref('Vue 3 app loaded successfully!');
</script>

<style>
.app {
  min-height: 100vh;
  background-color: #f8f9fa;
}
</style>