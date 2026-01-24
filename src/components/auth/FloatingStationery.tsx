'use client';

import React from 'react';

type Item = {
  id: string;
  style: React.CSSProperties;
  size: number;
  rotate: number;
  duration: number;
  delay: number;
  icon: 'notebook' | 'openBook' | 'pencil' | 'pen' | 'eraser' | 'page';
  opacity: number;
};

function IconNotebook() {
  return (
    <svg viewBox="0 0 120 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="20" y="16" width="78" height="128" rx="10" className="pd-ink-stroke" strokeWidth="3" />
      <path d="M34 16v128" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 44h42M46 64h42M46 84h42M46 104h30" className="pd-ink-stroke" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 32h-6M26 52h-6M26 72h-6M26 92h-6M26 112h-6" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconOpenBook() {
  return (
    <svg viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M90 22c-18-10-44-12-66-6v78c22-6 48-4 66 6" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M90 22c18-10 44-12 66-6v78c-22-6-48-4-66 6" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M90 22v78" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 38h40M30 54h40M30 70h34" className="pd-ink-stroke" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M110 38h40M110 54h40M110 70h34" className="pd-ink-stroke" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M40 128l12 12 88-88-12-12-88 88Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M34 146l18-6-12-12-6 18Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M124 44l12 12 10-10c4-4 4-10 0-14s-10-4-14 0l-8 12Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 136l20-20" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconPen() {
  return (
    <svg viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M70 20h40v16H70V20Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M74 36l-10 18 52 88 10-18-52-88Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M64 54l-10 18 44 76 18 10 10-18-44-76" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M96 148l-6 10" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconEraser() {
  return (
    <svg viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M46 104h76l36-36c6-6 6-16 0-22L134 22c-6-6-16-6-22 0L28 106c-4 4-2 10 4 10h14Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M78 104l38-38" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 104l24-24" className="pd-ink-stroke" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconPage() {
  return (
    <svg viewBox="0 0 120 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M28 16h48l16 16v112H28V16Z" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M76 16v16h16" className="pd-ink-stroke" strokeWidth="3" strokeLinejoin="round" />
      <path d="M36 56h48M36 76h48M36 96h40M36 116h32" className="pd-ink-stroke" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Icon({ type }: { type: Item['icon'] }) {
  switch (type) {
    case 'notebook':
      return <IconNotebook />;
    case 'openBook':
      return <IconOpenBook />;
    case 'pencil':
      return <IconPencil />;
    case 'pen':
      return <IconPen />;
    case 'eraser':
      return <IconEraser />;
    case 'page':
      return <IconPage />;
  }
}

export default function FloatingStationery() {
  const items: Item[] = [
    { id: 'notebook-1', icon: 'notebook', size: 150, rotate: -10, duration: 14, delay: -2, opacity: 0.22, style: { left: '6%', top: '18%' } },
    { id: 'openbook-1', icon: 'openBook', size: 180, rotate: 8, duration: 16, delay: -6, opacity: 0.20, style: { left: '10%', bottom: '16%' } },
    { id: 'page-1', icon: 'page', size: 140, rotate: 12, duration: 18, delay: -9, opacity: 0.18, style: { right: '10%', top: '18%' } },
    { id: 'pencil-1', icon: 'pencil', size: 150, rotate: 24, duration: 15, delay: -4, opacity: 0.18, style: { right: '14%', bottom: '14%' } },
    { id: 'eraser-1', icon: 'eraser', size: 130, rotate: -18, duration: 17, delay: -7, opacity: 0.16, style: { left: '44%', top: '10%' } },
    { id: 'pen-1', icon: 'pen', size: 150, rotate: -26, duration: 19, delay: -10, opacity: 0.16, style: { left: '58%', bottom: '10%' } },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-stone-50 to-amber-50/40" />
      <div className="absolute inset-0">
        {items.map((it) => (
          <div
            key={it.id}
            className="absolute pd-float"
            style={{
              ...it.style,
              width: it.size,
              height: it.size,
              opacity: it.opacity,
              ['--r' as any]: `${it.rotate}deg`,
              animationDuration: `${it.duration}s`,
              animationDelay: `${it.delay}s`,
            }}
          >
            <div className="w-full h-full pd-sway pd-shadow">
              <Icon type={it.icon} />
            </div>
          </div>
        ))}
      </div>

      {/* soft ink blobs */}
      <div className="absolute -left-24 top-24 h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl pd-blob" />
      <div className="absolute -right-24 top-32 h-64 w-64 rounded-full bg-amber-200/25 blur-3xl pd-blob" style={{ animationDelay: '-6s' }} />
      <div className="absolute left-1/2 -bottom-24 h-72 w-72 -translate-x-1/2 rounded-full bg-stone-200/35 blur-3xl pd-blob" style={{ animationDelay: '-12s' }} />
    </div>
  );
}
