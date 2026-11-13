import type { CSSProperties } from 'react';

/**
 * La cassette de Refrain, dessinee en CSS (voir `.k7` dans globals.css).
 * `width` fixe sa largeur en pixels ; tout le reste suit. `still` arrete les bobines.
 */
export function Cassette({ width, side = 'face A', still = false, className = '' }: { width?: number; side?: string; still?: boolean; className?: string }) {
  const style = width ? ({ '--w': `${width}px` } as CSSProperties) : undefined;
  return (
    <div className={`k7 ${still ? 'still' : ''} ${className}`} style={style} aria-hidden="true">
      <div className="k7-label">
        <span className="k7-title">Refrain</span>
        <span className="k7-side">{side}</span>
      </div>
      <div className="k7-window">
        <i className="k7-reel" />
        <i className="k7-tape" />
        <i className="k7-reel" />
      </div>
      <div className="k7-foot"><i /><i /><i /></div>
    </div>
  );
}
