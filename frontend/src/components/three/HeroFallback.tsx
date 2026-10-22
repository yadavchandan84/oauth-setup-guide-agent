/**
 * Static SVG fallback for the 3D hero, used whenever WebGL is unavailable, the device is
 * low-power, reduced-motion is requested, or the 3D chunk fails. The float animation is
 * gated behind prefers-reduced-motion: no-preference via a scoped <style>.
 */
const CHIPS = [
  { c: '#24292F', x: 150, y: 40 },
  { c: '#4A154B', x: 250, y: 70 },
  { c: '#000000', x: 60, y: 90 },
  { c: '#635BFF', x: 260, y: 170 },
  { c: '#5865F2', x: 40, y: 180 },
  { c: '#0052CC', x: 150, y: 230 },
  { c: '#2EB67D', x: 250, y: 210 },
  { c: '#F24E1E', x: 70, y: 230 },
];

export function HeroFallback() {
  return (
    <div className="relative h-full w-full" aria-hidden="true">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .hero-fallback-core { animation: hero-float 6s ease-in-out infinite; transform-origin: center; }
          .hero-fallback-chip { animation: hero-float 7s ease-in-out infinite; transform-origin: center; }
        }
        @keyframes hero-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>
      <svg viewBox="0 0 320 300" className="h-full w-full">
        <defs>
          <radialGradient id="hf-core" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.05" />
          </radialGradient>
          <linearGradient id="hf-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#818cf8" />
            <stop offset="1" stopColor="#67e8f9" />
          </linearGradient>
        </defs>

        {/* orbit ellipses */}
        <ellipse cx="160" cy="150" rx="120" ry="60" fill="none" stroke="rgba(255,255,255,0.08)" />
        <ellipse cx="160" cy="150" rx="135" ry="95" fill="none" stroke="rgba(255,255,255,0.06)" />

        {/* token-flow lines */}
        {CHIPS.map((chip, i) => (
          <line
            key={`line-${i}`}
            x1={chip.x + 11}
            y1={chip.y + 11}
            x2="160"
            y2="150"
            stroke="url(#hf-edge)"
            strokeOpacity="0.35"
            strokeDasharray="4 5"
          />
        ))}

        {/* central vault */}
        <g className="hero-fallback-core">
          <polygon
            points="160,95 205,122 205,178 160,205 115,178 115,122"
            fill="url(#hf-core)"
            stroke="url(#hf-edge)"
            strokeWidth="2"
          />
          <circle cx="160" cy="150" r="14" fill="#67e8f9" fillOpacity="0.85" />
        </g>

        {/* provider chips */}
        {CHIPS.map((chip, i) => (
          <g key={`chip-${i}`} className="hero-fallback-chip">
            <rect
              x={chip.x}
              y={chip.y}
              width="22"
              height="22"
              rx="6"
              fill={chip.c}
              stroke="rgba(255,255,255,0.25)"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
