import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error, errorInfo);
    }

    // Update state with error details
    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Send error to monitoring service in production
    if (process.env.NODE_ENV === "production") {
      this.reportError(error, errorInfo);
    }
  }

  reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorData = {
        message: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };
      console.log("Error reported:", errorData);
    } catch (err) {
      console.error("Failed to report error:", err);
    }
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleNavigateHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg border border-red-200">
            <div className="bg-red-50 border-b border-red-200 p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-600" />
                <div>
                  <h2 className="text-xl font-bold text-red-900">Something went wrong</h2>
                  <p className="text-sm text-red-700 mt-1">
                    An unexpected error occurred. Please try again or contact support if the problem persists.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Error Details (Development Only) */}
              {process.env.NODE_ENV === "development" && this.state.error && (
                <div className="space-y-2">
                  <details className="text-sm">
                    <summary className="font-medium cursor-pointer text-gray-700 hover:text-gray-900">
                      Error Details (Development)
                    </summary>
                    <div className="mt-2 p-3 bg-gray-100 rounded-lg font-mono text-xs overflow-auto max-h-40">
                      <p className="text-red-700 font-semibold mb-2">{this.state.error.toString()}</p>
                      <pre className="text-gray-700 whitespace-pre-wrap break-words">
                        {this.state.error.stack}
                      </pre>
                      {this.state.errorInfo && (
                        <div className="mt-2 text-gray-600">
                          <p className="font-semibold mb-1">Component Stack:</p>
                          <pre className="whitespace-pre-wrap break-words">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {/* Error Statistics */}
              {this.state.errorCount > 1 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ This error has occurred {this.state.errorCount} times. If it persists, please reload the page or contact support.
                  </p>
                </div>
              )}

              {/* Recovery Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  onClick={this.handleReset}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-2 rounded-lg flex-1",
                    "border border-gray-300 hover:bg-gray-50"
                  )}
                >
                  <RotateCcw size={16} />
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-2 rounded-lg flex-1",
                    "border border-gray-300 hover:bg-gray-50"
                  )}
                >
                  <RotateCcw size={16} />
                  Reload Page
                </button>
                <button
                  onClick={this.handleNavigateHome}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-2 rounded-lg flex-1",
                    "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  <Home size={16} />
                  Go Home
                </button>
              </div>

              {/* Support Information */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p className="font-medium mb-1">Need help?</p>
                <p>
                  If this error continues, please contact our support team or check the{" "}
                  <a href="/debug" className="underline font-medium hover:text-blue-900">
                    debug dashboard
                  </a>{" "}
                  for more information.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
