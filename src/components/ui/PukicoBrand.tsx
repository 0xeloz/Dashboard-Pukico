import React from 'react';

interface PukicoLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * Pukico brandmark icon (SVG)
 * Modern geometric monogram emblem representing Pukico
 */
export function PukicoLogo({ className = 'w-6 h-6', size, color = 'currentColor' }: PukicoLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {/* Outer rounded container shape */}
      <rect width="100" height="100" rx="30" fill={color} />
      {/* Stylized P emblem in contrast */}
      <path
        d="M32 25H56C67.0457 25 76 33.9543 76 45C76 56.0457 67.0457 65 56 65H46V75H32V25Z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="54" cy="45" r="8" fill={color} />
    </svg>
  );
}

/**
 * Monochromatic white Pukico emblem for watermark / overlay
 */
export function PukicoWatermark({ className = 'w-32 h-32' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M20 15H58C73.464 15 86 27.536 86 43C86 58.464 73.464 71 58 71H42V85H20V15Z"
        fill="white"
      />
      <circle cx="56" cy="43" r="14" fill="#0052FF" />
    </svg>
  );
}

/**
 * Generic testnet network indicator icon
 * (Strictly generic node icon, no third-party branding)
 */
export function GenericNetworkIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <div className={`rounded-full bg-[#0052FF] flex items-center justify-center ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white" />
    </div>
  );
}

/**
 * Token icon badges (handmade SVG, no external images)
 */
export function UsdcTokenIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" fill="#2775CA" />
      <path
        d="M17.5 10.5C14.7 10.5 13 11.9 13 13.7C13 17 19.5 16 19.5 18.5C19.5 19.6 18.4 20.4 16.7 20.4C14.8 20.4 13.7 19.4 13.5 18M16.5 8.5V10.5M16.5 20.5V22.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EthTokenIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" fill="#627EEA" />
      <g transform="translate(10, 6) scale(0.75)">
        <polygon points="8,0 0.5,12 8,16 15.5,12" fill="white" fillOpacity="0.9" />
        <polygon points="8,17.5 0.5,13.5 8,24 15.5,13.5" fill="white" fillOpacity="0.75" />
      </g>
    </svg>
  );
}
