import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-rose-500 font-mono flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Something went wrong.</h1>
          <p className="whitespace-pre-wrap">{this.state.error?.toString()}</p>
          <pre className="text-xs bg-black/50 p-4 rounded overflow-auto">
            {this.state.errorInfo?.componentStack}
          </pre>
          <button 
            className="px-4 py-2 bg-rose-500 text-white rounded w-max"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
