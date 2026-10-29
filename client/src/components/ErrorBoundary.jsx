import { Component } from "react";

/**
 * Without this, one component throwing takes the entire route with it — which
 * is why a single complaint with no coordinates blanked the officer's whole job
 * page rather than just the map on it.
 *
 * `resetKey` clears the error when the route changes, so navigating away
 * actually recovers instead of leaving a dead screen until reload.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    console.error("[boundary]", this.props.label || "", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.quiet) {
      return (
        <div
          className="card card--pad"
          style={{ textAlign: "center", color: "var(--muted)", fontSize: "var(--t-sm)" }}
        >
          {this.props.fallbackText || "This part could not be displayed."}
        </div>
      );
    }

    return (
      <div className="card card--pad" style={{ maxWidth: 560, margin: "var(--s-7) auto" }}>
        <h2 className="h h-lg">This page hit a problem</h2>
        <p className="prose" style={{ marginTop: "var(--s-2)" }}>
          The rest of the app is fine — you can go back and carry on. If it keeps happening on the
          same screen, the details are in the browser console.
        </p>
        <pre
          className="mono"
          style={{
            marginTop: "var(--s-4)", padding: "var(--s-3)", background: "var(--surface-2)",
            borderRadius: "var(--r)", fontSize: "var(--t-xs)", overflowX: "auto",
          }}
        >
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <div className="row" style={{ marginTop: "var(--s-5)", gap: "var(--s-3)" }}>
          <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn btn--secondary" onClick={() => window.history.back()}>Go back</button>
        </div>
      </div>
    );
  }
}
