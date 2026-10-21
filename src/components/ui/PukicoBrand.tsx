import React from 'react';

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
