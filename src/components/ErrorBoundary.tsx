import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../lib/logger";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.critical(`Application Crash: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReset = () => {
    (this as any).setState({ hasError: false, error: undefined });
    window.location.href = "/";
  };

  public render() {
    if ((this as any).state.hasError) {
      if ((this as any).props.fallback) {
        return (this as any).props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-8">
              An unexpected error occurred and the application crashed. Our technical team has been notified.
            </p>

            <div className="space-y-3">
              <button 
                onClick={this.handleReset}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-4 rounded-lg transition-all flex items-center justify-center"
                id="error-boundary-reset-button"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reload Application
              </button>
              
              <p className="text-xs text-gray-400">
                Error ID: {Math.random().toString(36).substring(2, 10).toUpperCase()}
              </p>
            </div>

            {process.env.NODE_ENV === 'development' && (this as any).state.error && (
              <div className="mt-8 text-left p-4 bg-gray-900 rounded-lg overflow-auto max-h-48">
                <pre className="text-xs text-green-400 font-mono italic">
                  {(this as any).state.error.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;
