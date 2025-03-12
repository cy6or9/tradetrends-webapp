import { Route, Switch } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/home";
import StockPage from "./pages/stock";

// Simplified App component without duplicate QueryClient
export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/stock/:symbol" component={StockPage} />
          <Route>
            <div className="container mx-auto p-4">
              <h1 className="text-2xl font-bold">404 - Not Found</h1>
            </div>
          </Route>
        </Switch>
      </div>
    </ErrorBoundary>
  );
}