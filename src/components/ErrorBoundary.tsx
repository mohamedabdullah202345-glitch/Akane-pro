import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred in the UI.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      let friendlyDetail = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; path?: string };
        if (parsed.error) {
          friendlyDetail = parsed.path
            ? `${parsed.error} (path: ${parsed.path})`
            : parsed.error;
        }
      } catch {
        // Keep raw message if not JSON
      }

      return (
        <div className="min-h-screen w-screen bg-[#09070A] text-[#F8F5F2] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#160B11] border border-rose-500/35 p-6 shadow-2xl space-y-4">
            <h1 className="font-display text-lg font-semibold text-rose-100">
              Something interrupted Akane&apos;s stage
            </h1>
            <p className="text-xs text-rose-200/80 leading-relaxed break-words">
              {friendlyDetail}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-gradient-to-br from-rose-600 to-red-800 hover:from-rose-500 hover:to-red-700 text-xs font-semibold text-white"
            >
              Reload Akane Pro
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
