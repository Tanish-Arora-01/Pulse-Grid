import React, { useRef, useState } from "react";

const SpotlightCard = ({
  children,
  className = "",
  spotlightColor = "rgba(167, 139, 250, 0.25)",
}) => {
  const divRef = useRef(null);
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e) => {
    if (!divRef.current) return;

    const div = divRef.current;
    const rect = div.getBoundingClientRect();

    div.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    div.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`
        relative rounded-3xl border border-white/10
        bg-gray-900/20 backdrop-blur-md
        overflow-hidden
        transition-all duration-500
        hover:border-white/20
        hover:shadow-[0_0_30px_rgba(139,92,246,0.15)]
        ${className}
      `}
    >
      {/* Spotlight */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
        style={{
          opacity,
          background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), ${spotlightColor}, transparent 40%)`,
        }}
      />

      {/* Noise */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Shine */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50" />

      {/* CONTENT FIXED */}
      <div className="relative z-10 flex flex-col h-full">{children}</div>
    </div>
  );
};

export default SpotlightCard;
