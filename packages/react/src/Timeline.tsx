import { forwardRef } from 'react';
import type { CSSProperties, ForwardedRef } from 'react';

/**
 * Props for the {@link Timeline} component.
 *
 * Phase 0 exposes only presentational props. The full data / theme / callback
 * surface (TimelineProps<TData> in docs/DESIGN.md §12) lands in later phases.
 */
export interface TimelineProps {
  /** Class applied to the root container. */
  className?: string;
  /** Inline style merged over the default container style. */
  style?: CSSProperties;
}

/**
 * Imperative handle returned via `ref`.
 *
 * Phase 0 exposes only the engine version so the ref contract exists end to
 * end; the streaming / viewport methods of docs/DESIGN.md §12 arrive later.
 */
export interface TimelineHandle {
  readonly version: string;
}

const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

/**
 * Placeholder Timeline component (Phase 0).
 *
 * Renders an empty positioned container. The two stacked `<canvas>` layers and
 * the core engine they drive are introduced in Phase 1 (docs/DESIGN.md §4, §12).
 */
export const Timeline = forwardRef(function Timeline(
  { className, style }: TimelineProps,
  _ref: ForwardedRef<TimelineHandle>,
) {
  return (
    <div
      className={className}
      style={{ ...containerStyle, ...style }}
      data-testid="timeline-root"
    />
  );
});
