import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error || 'Unknown render error') };
  }

  componentDidCatch(error, errorInfo) {
    const panel = String(this.props.panel || 'unknown-panel');
    // Keep logs concise but panel-specific for faster triage.
    console.error('[ui-boundary]', {
      panel,
      message: String(error?.message || error || 'Unknown render error'),
      componentStack: String(errorInfo?.componentStack || '').slice(0, 800),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-xl border border-rose-300/40 bg-rose-500/15 p-4 text-sm text-rose-100">
          {String(this.props.fallbackTitle || 'Panel rendering failed safely.')}{' '}
          Refresh the page. Panel: {String(this.props.panel || 'unknown-panel')}. Details: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
