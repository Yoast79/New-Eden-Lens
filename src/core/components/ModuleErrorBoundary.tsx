import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ModuleErrorBoundary extends React.Component<
  { moduleId: string; moduleName: string; children: React.ReactNode },
  State
> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Unknown module error' };
  }

  componentDidUpdate(prevProps: { moduleId: string }) {
    if (prevProps.moduleId !== this.props.moduleId && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="photon-panel max-w-md space-y-3 p-5 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-eve-danger" />
            <div className="text-sm font-semibold uppercase tracking-wider text-eve-text">
              Module Fault: {this.props.moduleName}
            </div>
            <p className="font-mono text-xs text-eve-muted">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="inline-flex items-center gap-1.5 border border-eve-accent/50 bg-eve-accent-muted px-3 py-1.5 text-xs font-medium text-eve-accent hover:bg-eve-accent/25"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload Module
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

