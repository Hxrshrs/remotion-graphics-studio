import React from 'react';
import {AbsoluteFill} from 'remotion';

type BoundaryProps = {
  children: React.ReactNode;
  onError: (message: string) => void;
};

/**
 * Model-written scenes crash. When one does, report it upward so the assistant
 * can repair it, and keep the canvas quiet instead of blanking the app.
 */
class SceneErrorBoundary extends React.Component<BoundaryProps, {message: string | null}> {
  state = {message: null as string | null};

  static getDerivedStateFromError(error: unknown) {
    return {message: error instanceof Error ? error.message : String(error)};
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  render() {
    if (this.state.message) {
      return (
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            padding: 120,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 22,
              lineHeight: 1.6,
              color: '#ff8f7a',
              maxWidth: 1100,
            }}
          >
            {this.state.message}
          </div>
        </AbsoluteFill>
      );
    }
    return <>{this.props.children}</>;
  }
}

/**
 * Wraps a compiled scene into the component the Player mounts. Identity is
 * derived per compile, so a new scene remounts cleanly.
 */
export const makeSceneComponent = (
  Compiled: React.ComponentType<Record<string, unknown>>,
  onError: (message: string) => void,
): React.FC => {
  const Host: React.FC = () => (
    <SceneErrorBoundary onError={onError}>
      <Compiled />
    </SceneErrorBoundary>
  );
  return Host;
};

export const EmptyScene: React.FC = () => <AbsoluteFill />;
