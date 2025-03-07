import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/home";
import StockPage from "./pages/stock";

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

// Create a separate error boundary for WebSocket-related content
function WebSocketFallback({ error }: { error?: Error }) {
  return (
    <div className="text-sm text-muted-foreground p-2">
      Real-time updates unavailable: {error?.message || "Connection failed"}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="min-h-screen bg-background">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/stock/:symbol" component={StockPage} />
            <Route>404 - Not Found</Route>
          </Switch>
        </div>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}