import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error);
    console.error('Error info:', errorInfo);
    this.setState({ errorInfo });
  }

  private retryApp = () => {
    // Clear the error state and retry rendering the app
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    // Reload the page if needed
    if (this.state.error?.message?.includes('WebSocket')) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="w-full max-w-md p-6 border border-destructive/50 rounded-lg bg-destructive/10">
            <h2 className="text-xl font-semibold text-destructive mb-3">
              Something went wrong
            </h2>
            <div className="space-y-4">
              {/* Display the error message */}
              <p className="text-sm text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>

              {/* If we have error info, show the component stack */}
              {this.state.errorInfo && (
                <div className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-32">
                  <pre className="whitespace-pre-wrap font-mono">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              {/* Retry button */}
              <button
                onClick={this.retryApp}
                className="w-full mt-4 px-4 py-2 text-sm font-medium bg-background hover:bg-accent rounded-md transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}