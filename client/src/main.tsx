import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // Data considered fresh for 30 seconds
      refetchInterval: 30000, // Refetch every 30 seconds
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
    },
  },
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find the root element");
}

// Create the root and render app
const root = createRoot(rootElement);

// Add error boundary to catch render errors
try {
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to render app:", error);
  root.render(
    <div style={{ padding: "20px", color: "red" }}>
      Failed to load application. Please check console for errors.
    </div>
  );
}