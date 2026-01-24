'use client'

export default function FloatingLiteraryBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {/* Soft paper gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_80%_20%,rgba(47,93,80,0.10),transparent_55%),radial-gradient(900px_circle_at_15%_65%,rgba(15,23,42,0.08),transparent_60%),linear-gradient(180deg,#F7F6F3,#F3F1EC)]" />

      {/* Milk overlay for readability */}
      <div className="absolute inset-0 bg-white/40" />

      {/* Floating “paper” shapes */}
      <div className="absolute inset-0">
        <span className="pen-float pen-paper absolute right-[8%] top-[12%] h-40 w-28 rotate-6 opacity-40" />
        <span className="pen-float2 pen-paper absolute right-[22%] top-[52%] h-28 w-20 -rotate-3 opacity-30" />
        <span className="pen-float3 pen-paper absolute left-[10%] top-[18%] h-44 w-32 -rotate-6 opacity-35" />
        <span className="pen-float pen-paper absolute left-[22%] top-[62%] h-32 w-24 rotate-3 opacity-30" />
        <span className="pen-float2 pen-ink absolute left-[45%] top-[10%] h-28 w-28 opacity-25" />
        <span className="pen-float3 pen-ink absolute right-[40%] top-[72%] h-24 w-24 opacity-20" />
      </div>

      {/* Tiny grain */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-multiply [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%222%22 stitchTiles=%22stitch%22/></filter><rect width=%22200%22 height=%22200%22 filter=%22url(%23n)%22 opacity=%220.25%22/></svg>')]" />

      <style jsx global>{`
        .pen-paper {
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.55)),
            repeating-linear-gradient(
              180deg,
              rgba(15, 23, 42, 0.08) 0px,
              rgba(15, 23, 42, 0.08) 1px,
              transparent 1px,
              transparent 18px
            );
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.06);
          filter: blur(0.3px);
        }

        .pen-ink {
          border-radius: 999px;
          background:
            radial-gradient(circle at 30% 30%, rgba(47,93,80,0.35), transparent 60%),
            radial-gradient(circle at 65% 60%, rgba(15,23,42,0.28), transparent 65%);
          filter: blur(0.2px);
        }

        @keyframes penFloat {
          0% { transform: translate3d(0, 0, 0) rotate(var(--r)); }
          50% { transform: translate3d(0, -12px, 0) rotate(calc(var(--r) + 1deg)); }
          100% { transform: translate3d(0, 0, 0) rotate(var(--r)); }
        }
        @keyframes penFloat2 {
          0% { transform: translate3d(0, 0, 0) rotate(var(--r)); }
          50% { transform: translate3d(10px, -10px, 0) rotate(calc(var(--r) - 1deg)); }
          100% { transform: translate3d(0, 0, 0) rotate(var(--r)); }
        }
        @keyframes penFloat3 {
          0% { transform: translate3d(0, 0, 0) rotate(var(--r)); }
          50% { transform: translate3d(-8px, -14px, 0) rotate(calc(var(--r) + 1deg)); }
          100% { transform: translate3d(0, 0, 0) rotate(var(--r)); }
        }

        .pen-float { --r: 6deg; animation: penFloat 26s ease-in-out infinite; will-change: transform; }
        .pen-float2 { --r: -4deg; animation: penFloat2 32s ease-in-out infinite; will-change: transform; }
        .pen-float3 { --r: -6deg; animation: penFloat3 38s ease-in-out infinite; will-change: transform; }

        @media (prefers-reduced-motion: reduce) {
          .pen-float, .pen-float2, .pen-float3 { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
