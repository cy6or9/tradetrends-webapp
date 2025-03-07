import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Basic error logging
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global error:', { message, source, lineno, colno, error });
};

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find the root element");
}

// Create a minimal test component
const TestComponent = () => (
  <div className="p-4">
    <h1 className="text-2xl">Loading Application...</h1>
  </div>
);

// Create the root and render test component first
const root = createRoot(rootElement);

try {
  root.render(
    <React.StrictMode>
      <TestComponent />
    </React.StrictMode>
  );

  // If basic rendering works, dynamically import the full app
  import('./App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }).catch(error => {
    console.error('Failed to load app:', error);
    root.render(
      <div className="p-4 text-red-500">
        Failed to load application. Please check console for errors.
      </div>
    );
  });
} catch (error) {
  console.error("Failed to render app:", error);
  document.body.innerHTML = '<div style="padding: 20px; color: red;">Failed to initialize application.</div>';
}