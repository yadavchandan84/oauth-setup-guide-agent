import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="mx-auto max-w-xl rounded-2xl border border-rose-400/20 bg-white/[0.04] p-6 text-center"
          >
            <h2 className="text-lg font-semibold text-slate-100">Something broke</h2>
            <p className="mt-1 text-sm text-slate-400">
              This part of the page failed to render. Try reloading.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
