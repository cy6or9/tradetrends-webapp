<template>
  <div class="app">
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container">
        <router-link class="navbar-brand" to="/">Stock Market Analysis</router-link>
      </div>
    </nav>

    <div class="container py-4">
      <h1>Welcome to Stock Market Analysis</h1>
      <p>Loading components...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Minimal setup to verify Vue 3 is working
console.log('App component loaded');
</script>

<style>
.app {
  min-height: 100vh;
  background-color: #f8f9fa;
}
</style>