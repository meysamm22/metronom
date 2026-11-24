import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../report';
import { SegnoMark } from './Brand';

interface State {
  failed: boolean;
}

/**
 * Last line of defence: if a screen crashes while rendering, show a way back
 * instead of a blank white screen. Songs live on the device, so a reload
 * loses nothing.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, 'ui.render', {
      // Component names only; no props or song data.
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 px-8 text-center">
        <SegnoMark className="w-14 h-14 mb-5 text-slate-700" />
        <p className="text-slate-200 font-semibold text-lg mb-1">Something went wrong</p>
        <p className="text-slate-500 text-sm mb-8">
          Your songs are safe on this device.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full max-w-xs py-4 rounded-2xl bg-indigo-600 active:bg-indigo-800 text-white font-bold text-lg"
        >
          Reload
        </button>
      </div>
    );
  }
}
