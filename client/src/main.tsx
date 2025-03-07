import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

// Error handling
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global error:', { message, source, lineno, colno, error });
};

window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Create query client with reasonable defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Failed to find root element");
  }

  // Create root and render
  const root = createRoot(rootElement);

  // Load the full app
  const renderApp = async () => {
    try {
      const { default: App } = await import('./App');
      root.render(
        <React.StrictMode>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </React.StrictMode>
      );
    } catch (error) {
      console.error('Failed to load App:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      document.body.innerHTML = `
        <div style="padding: 20px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
          <h1 style="color: #ef4444; font-size: 24px; margin-bottom: 16px;">Application Error</h1>
          <p style="color: #666;">${message}</p>
        </div>
      `;
    }
  };

  renderApp();

} catch (error) {
  console.error("Failed to render app:", error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  document.body.innerHTML = `
    <div style="padding: 20px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="color: #ef4444; font-size: 24px; margin-bottom: 16px;">Application Error</h1>
      <p style="color: #666;">${message}</p>
    </div>
  `;
}