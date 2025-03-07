<template>
  <div class="container mx-auto py-4">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-bold">Stock Market Analysis</h1>
      <p class="text-gray-600 mt-2">Track stocks with high analyst ratings and market momentum</p>
    </header>

    <!-- Router View will be added here later -->
    <main>
      <p class="text-center text-gray-600">Loading stocks data...</p>
    </main>
  </div>
</template>

<script setup lang="ts">
// Basic setup to verify Vue is working
console.log('Vue App component mounted');
</script>

<style>
.container {
  min-height: 100vh;
  background-color: #f8f9fa;
}
</style>