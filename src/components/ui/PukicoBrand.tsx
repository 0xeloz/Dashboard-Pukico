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
 * Official Circle USDC Logo icon asset
 */
export function UsdcTokenIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <img
      src="/assets/aistudio/Circle_USDC_Logo.svg_ad5d6cbc.png"
      alt="USDC"
      className={`aspect-square object-contain select-none shrink-0 ${className}`}
      loading="eager"
      draggable={false}
    />
  );
}

/**
 * Official Ethereum (ETH) round logo asset
 */
export function EthTokenIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <img
      src="/assets/aistudio/ethereum-eth-round-logo-icon-png-701751694969815akblwl2552_1031196f.png"
      alt="ETH"
      className={`aspect-square object-contain select-none shrink-0 ${className}`}
      loading="eager"
      draggable={false}
    />
  );
}

