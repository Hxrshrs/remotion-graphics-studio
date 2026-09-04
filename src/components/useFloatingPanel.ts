import React, {useCallback, useLayoutEffect, useRef, useState} from 'react';

type UseFloatingPanelOptions = {
  /** Gap between the anchor and the panel. */
  offset?: number;
  /** Panel width: anchor width, or a fixed pixel width clamped to viewport. */
  width?: number | 'anchor';
  /** Minimum panel width in pixels. */
  minWidth?: number;
  /** Maximum panel height before its own scroll takes over. */
  maxHeight?: number;
  /** Minimum space required to open downward; otherwise flips up. */
  minBelow?: number;
};

/**
 * Anchors a portal-rendered dropdown to an element without clipping inside
 * scrolling parents. Measures on open, follows scroll/resize, and flips
 * above the anchor when there is no room below.
 */
export function useFloatingPanel<T extends HTMLElement>(
  open: boolean,
  options: UseFloatingPanelOptions = {},
) {
  const {offset = 6, width = 'anchor', minWidth, maxHeight = 320, minBelow = 180} = options;
  const anchorRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({visibility: 'hidden'});
  const [placement, setPlacement] = useState<'below' | 'above'>('below');

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    let panelWidth =
      width === 'anchor' ? rect.width : Math.min(width, window.innerWidth - 16);
    if (minWidth != null) {
      panelWidth = Math.max(panelWidth, Math.min(minWidth, window.innerWidth - 16));
    }
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const place = spaceBelow >= minBelow || spaceBelow >= spaceAbove ? 'below' : 'above';
    const available = Math.max(120, place === 'below' ? spaceBelow : spaceAbove);
    setPlacement(place);
    setStyle({
      position: 'fixed',
      left,
      width: panelWidth,
      maxHeight: Math.min(maxHeight, available),
      zIndex: 200,
      ...(place === 'below'
        ? {top: rect.bottom + offset}
        : {bottom: window.innerHeight - rect.top + offset}),
    });
  }, [maxHeight, minBelow, minWidth, offset, width]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return {anchorRef, panelRef, panelStyle: style, placement};
}
