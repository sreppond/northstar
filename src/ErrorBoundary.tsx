import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STORAGE_KEY } from './planner/store/planStore';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The plan store already guards against stale/malformed localStorage, but
 * that can't cover every future crash. Without this, a render-time throw
 * anywhere unmounts the whole tree and leaves a silent blank page — this is
 * the actual guarantee that never happens, with a way back in.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Northstar crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ns-crash">
          <h1>Something went wrong</h1>
          <p>Northstar hit an unexpected error and couldn't continue.</p>
          <pre>{this.state.error.message}</pre>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }}
          >
            Reset app data and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
