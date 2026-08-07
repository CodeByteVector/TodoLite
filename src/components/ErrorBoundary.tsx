import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: Error) {
    return { error: e?.message || String(e) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TodoLite render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-[15px] font-semibold">Something went wrong</p>
          <p className="max-w-sm text-[12.5px] text-[var(--text-secondary)]">
            An unexpected error occurred in this view. Try switching views or restart TodoLite.
          </p>
          <code className="rounded-lg bg-[var(--section-alt)] px-3 py-2 text-[11px] text-[var(--danger)]">
            {this.state.error}
          </code>
        </div>
      );
    }
    return this.props.children;
  }
}