import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error || 'Unknown render error') };
  }

  componentDidCatch() {
    // Intentionally keep console output minimal in production UI.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-xl border border-rose-300/40 bg-rose-500/15 p-4 text-sm text-rose-100">
          UI rendering failed safely. Refresh the page. Details: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
