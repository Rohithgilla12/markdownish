import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface to the Tauri devtools console as well as the UI.
    console.error("Markdownish render error", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid h-full w-full place-items-center p-10">
        <div className="max-w-xl text-left">
          <div className="text-eyebrow mb-3 text-[color:var(--color-foil)]">
            Something went sideways
          </div>
          <h1 className="font-display text-3xl italic text-foreground">
            The preview crashed.
          </h1>
          <p className="text-marginalia mt-2">
            This is a Markdownish bug. The error has been logged to the devtools console.
          </p>

          <pre className="mt-6 max-h-[40vh] overflow-auto rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/60 p-4 text-xs leading-relaxed text-[color:var(--color-fg-2)]">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>

          <button
            onClick={this.reset}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-foil)]/50 bg-[color:var(--color-foil)]/10 px-5 py-2 font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/20"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
