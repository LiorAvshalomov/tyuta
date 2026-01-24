'use client'

/**
 * FloatingStationery
 * - Inline SVG (no external assets, no data: URIs) => CSP-friendly.
 * - CSS-only animations (GPU-friendly) defined in src/styles/auth.css
 * - RTL drift to the left to "feel Hebrew".
 */
export default function FloatingStationery() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Notebook (closed) */}
      <div className="pd-sway-rtl absolute right-8 top-10 opacity-[0.22] blur-[0.2px]">
        <svg width="170" height="170" viewBox="0 0 180 180" fill="none">
          <rect x="34" y="28" width="96" height="124" rx="14" fill="rgba(59,130,246,0.18)" stroke="rgba(31,35,40,0.28)" />
          <rect x="48" y="40" width="68" height="100" rx="10" fill="rgba(255,255,255,0.55)" stroke="rgba(31,35,40,0.16)" />
          <path d="M40 44h6M40 58h6M40 72h6M40 86h6M40 100h6M40 114h6M40 128h6" stroke="rgba(31,35,40,0.22)" strokeWidth="2" strokeLinecap="round"/>
          <path d="M64 64h42M64 80h42M64 96h34" stroke="rgba(31,35,40,0.18)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Open book */}
      <div className="pd-drift-rtl absolute right-[18%] top-[56%] opacity-[0.20] blur-[0.2px]">
        <svg width="220" height="160" viewBox="0 0 240 170" fill="none">
          <path d="M120 42c-24-18-56-18-82-2v96c26-16 58-16 82 2V42z" fill="rgba(34,197,94,0.14)" stroke="rgba(31,35,40,0.26)"/>
          <path d="M120 42c24-18 56-18 82-2v96c-26-16-58-16-82 2V42z" fill="rgba(251,146,60,0.13)" stroke="rgba(31,35,40,0.26)"/>
          <path d="M120 42v96" stroke="rgba(31,35,40,0.22)" strokeWidth="2"/>
          <path d="M56 70h46M56 86h46M56 102h36" stroke="rgba(31,35,40,0.16)" strokeLinecap="round"/>
          <path d="M138 70h46M138 86h46M138 102h36" stroke="rgba(31,35,40,0.16)" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Loose page */}
      <div className="pd-float absolute right-[6%] top-[70%] opacity-[0.16]">
        <svg width="170" height="170" viewBox="0 0 180 180" fill="none">
          <path d="M56 30h62l20 20v98a12 12 0 0 1-12 12H56a12 12 0 0 1-12-12V42a12 12 0 0 1 12-12z" fill="rgba(255,255,255,0.55)" stroke="rgba(31,35,40,0.26)"/>
          <path d="M118 30v20h20" fill="rgba(56,189,248,0.12)" stroke="rgba(31,35,40,0.18)"/>
          <path d="M62 70h56M62 86h56M62 102h46M62 118h56" stroke="rgba(31,35,40,0.16)" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Pencil */}
      <div className="pd-sway-rtl absolute right-[60%] top-[16%] opacity-[0.16]">
        <svg width="220" height="120" viewBox="0 0 260 140" fill="none">
          <path d="M58 96l110-58 18 34-110 58-18-34z" fill="rgba(251,146,60,0.18)" stroke="rgba(31,35,40,0.26)"/>
          <path d="M168 38l22-12 18 34-22 12-18-34z" fill="rgba(34,197,94,0.12)" stroke="rgba(31,35,40,0.22)"/>
          <path d="M52 98l-16 22 26-2  -10-20z" fill="rgba(31,35,40,0.18)"/>
        </svg>
      </div>

      {/* Pen */}
      <div className="pd-drift-rtl absolute right-[40%] top-[78%] opacity-[0.14]">
        <svg width="240" height="120" viewBox="0 0 280 140" fill="none">
          <path d="M70 96l126-44 12 34-126 44-12-34z" fill="rgba(59,130,246,0.14)" stroke="rgba(31,35,40,0.26)"/>
          <path d="M196 52l22-8 12 34-22 8-12-34z" fill="rgba(31,35,40,0.12)" stroke="rgba(31,35,40,0.22)"/>
          <path d="M60 100l-18 18 28 4 -10-22z" fill="rgba(31,35,40,0.16)"/>
        </svg>
      </div>

      {/* Eraser */}
      <div className="pd-float absolute right-[78%] top-[62%] opacity-[0.12]">
        <svg width="140" height="110" viewBox="0 0 180 140" fill="none">
          <path d="M42 88l36-36h62a12 12 0 0 1 8 20l-24 24H42z" fill="rgba(244,114,182,0.14)" stroke="rgba(31,35,40,0.24)"/>
          <path d="M42 88l24 24h58l-24-24H42z" fill="rgba(148,163,184,0.12)" stroke="rgba(31,35,40,0.20)"/>
        </svg>
      </div>
    </div>
  )
}
