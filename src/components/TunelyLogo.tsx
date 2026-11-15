import React from 'react';

interface TunelyLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export const TunelyLogo: React.FC<TunelyLogoProps> = ({
  size = 36,
  className = '',
  glow = false,
}) => {
  const padding = Math.max(3, Math.round(size * 0.1));
  const radius = size >= 72 ? 'rounded-[26px]' : size >= 44 ? 'rounded-2xl' : 'rounded-xl';

  return (
    <div
      style={{ width: size, height: size, padding }}
      className={`relative inline-flex items-center justify-center ${radius} bg-gradient-to-br from-[#0e1529] via-[#131936] to-[#080c18] border border-white/15 overflow-hidden select-none ${
        glow ? 'shadow-[0_12px_34px_rgba(168,85,247,0.38)]' : 'shadow-md shadow-indigo-950/35'
      } ${className}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(236,72,153,0.18),transparent_55%),radial-gradient(circle_at_75%_75%,rgba(34,211,238,0.18),transparent_55%)]" />
      <img
        src="/tunely-logo.png"
        alt="Tunely Logo"
        draggable={false}
        className="relative w-full h-full object-contain drop-shadow-[0_2px_6px_rgba(34,211,238,0.22)]"
      />
    </div>
  );
};
