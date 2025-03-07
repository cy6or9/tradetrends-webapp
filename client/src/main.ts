import { createApp } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import 'bootstrap/dist/css/bootstrap.min.css';
import './assets/main.css';

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');

console.log('Vue app mounted successfully');