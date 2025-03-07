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

// Minimal test component
const TestComponent = () => (
  <div className="min-h-screen bg-background text-foreground p-4">
    <h1 className="text-2xl font-bold mb-4">Testing React Setup</h1>
    <p>If you can see this message, React is working correctly.</p>
  </div>
);

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Failed to find root element");
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30000,
      },
    },
  });

  // Create root and render test component first
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    </React.StrictMode>
  );

  // If test component renders successfully, load the full app
  import('./App').then(({ default: App }) => {
    setTimeout(() => {
      root.render(
        <React.StrictMode>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </React.StrictMode>
      );
    }, 1000); // Give a second to see if test component renders
  }).catch(error => {
    console.error('Failed to load App:', error);
    throw error;
  });

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