// Small stroke icons drawn to sit on the text baseline at 13 to 15px.
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const Check = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

export const Copy = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.75" />
    <path d="M10.5 3.5v-.25A1.75 1.75 0 008.75 1.5h-5.5A1.75 1.75 0 001.5 3.25v5.5c0 .97.78 1.75 1.75 1.75h.25" />
  </svg>
);

export const Warn = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7.13 2.5a1 1 0 011.74 0l5.5 9.75a1 1 0 01-.87 1.5H2.5a1 1 0 01-.87-1.5z" />
    <path d="M8 6.5v3" />
    <path d="M8 11.75h.01" strokeWidth={2} />
  </svg>
);

export const Chevron = ({ size = 12, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </svg>
);

export const Person = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="5.25" r="2.75" />
    <path d="M2.75 14c.6-2.6 2.7-4.25 5.25-4.25s4.65 1.65 5.25 4.25" />
  </svg>
);

export const KeyIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="5.25" cy="10.75" r="3" />
    <path d="M7.4 8.6l6.1-6.1M11.5 4.5l1.75 1.75M9.75 6.25l1.25 1.25" />
  </svg>
);

export const Stop = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden>
    <rect x="3.5" y="3.5" width="9" height="9" rx="2" fill="currentColor" />
  </svg>
);
