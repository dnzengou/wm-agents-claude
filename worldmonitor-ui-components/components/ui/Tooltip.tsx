'use client';

import React from 'react';

/**
 * Lightweight CSS tooltip — no JS positioning, no portal, no library.
 * Wraps any element and shows a dark label on hover.
 *
 * Usage:
 *   <Tooltip text="Filter by domain">
 *     <button>…</button>
 *   </Tooltip>
 *
 * Side choices:
 *   - "top"    (default) — label appears above
 *   - "bottom" — label appears below
 *   - "left"   — label appears to the left
 *   - "right"  — label appears to the right
 */

type Side = 'top' | 'bottom' | 'left' | 'right';

type Props = {
  text: string;
  side?: Side;
  children: React.ReactNode;
  disabled?: boolean;
};

const SIDE_CLASSES: Record<Side, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

export function Tooltip({ text, side = 'top', children, disabled = false }: Props) {
  if (disabled) return <>{children}</>;

  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        className={`
          pointer-events-none absolute z-[2000] whitespace-nowrap
          ${SIDE_CLASSES[side]}
          px-2 py-1 rounded
          bg-[rgba(5,7,10,0.95)] border border-[rgba(0,245,255,0.2)]
          text-[10px] font-mono text-[#94a3b8]
          opacity-0 scale-95
          group-hover/tip:opacity-100 group-hover/tip:scale-100
          transition-all duration-150
        `}
      >
        {text}
      </span>
    </span>
  );
}
