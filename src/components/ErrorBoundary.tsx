import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let parsedError = null;
      try {
        if (this.state.error?.message) {
          parsedError = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-[100dvh] bg-obsidian flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-graphite/40 border border-red-500/20 p-8 rounded-sm space-y-6">
            <div className="flex items-center gap-4 text-red-500">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm">
                <AlertTriangle size={24} />
              </div>
              <h2 className="text-2xl font-serif tracking-tight text-ivory">System Interruption</h2>
            </div>
            
            <div className="space-y-4">
              <p className="text-stone text-sm leading-relaxed">
                An unexpected error occurred in the application. The system has halted to preserve data integrity.
              </p>
              
              {parsedError ? (
                <div className="bg-obsidian/60 border border-red-500/10 p-4 rounded-sm space-y-2">
                  <p className="text-xs font-mono text-red-400 uppercase tracking-widest">Firestore Permission Error</p>
                  <p className="text-xs text-stone font-mono">Operation: {parsedError.operationType}</p>
                  <p className="text-xs text-stone font-mono">Path: {parsedError.path}</p>
                  <p className="text-xs text-stone font-mono mt-2 opacity-80">{parsedError.error}</p>
                </div>
              ) : (
                <div className="bg-obsidian/60 border border-titanium/10 p-4 rounded-sm overflow-auto max-h-40">
                  <p className="text-xs font-mono text-red-400">{this.state.error?.toString()}</p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-titanium/10">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-6 py-3 bg-titanium/10 hover:bg-titanium/20 border border-titanium/20 text-ivory text-xs uppercase tracking-widest transition-all w-full justify-center"
              >
                <RefreshCw size={14} />
                Restart Session
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
