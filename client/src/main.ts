import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import router from './router';

// Import Bootstrap and CSS
import 'bootstrap/dist/css/bootstrap.min.css';
import './assets/main.css';

// Create Vue app
const app = createApp(App);

// Install plugins
app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin);

// Mount app
app.mount('#app');