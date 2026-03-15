import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
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
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Erro capturado pelo ErrorBoundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCache = async () => {
    try {
      // Limpar cache do service worker
      if ("serviceWorker" in navigator && "caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      // Limpar localStorage
      localStorage.clear();
      // Recarregar
      window.location.reload();
    } catch (err) {
      console.error("Erro ao limpar cache:", err);
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-4 max-w-md w-full">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-destructive">Erro ao carregar o app</h1>
            <p className="text-sm text-muted-foreground">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            
            {this.state.error && (
              <details className="mt-4 text-left bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <summary className="text-sm font-medium text-destructive cursor-pointer">
                  Detalhes do erro
                </summary>
                <div className="mt-2 text-xs text-muted-foreground font-mono break-all">
                  <div className="mb-2">
                    <strong>Erro:</strong> {this.state.error.message}
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-[10px]">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-col gap-2 mt-6">
              <button
                onClick={this.handleReload}
                className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
              >
                Recarregar App
              </button>
              <button
                onClick={this.handleClearCache}
                className="w-full px-4 py-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 font-medium text-sm"
              >
                Limpar Cache e Recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
