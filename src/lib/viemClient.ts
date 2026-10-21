import { createPublicClient, http, formatEther, formatUnits, isAddress, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CHAIN_CONFIG } from './config';
import type { RpcStatusInfo } from '../types';

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

// Official Circle testnet USDC contract on Base Sepolia
export const BASE_SEPOLIA_USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

/**
 * Fetch native ETH balance on Base Sepolia
 */
export async function getBaseSepoliaBalance(address: string): Promise<string> {
  if (!address || !isAddress(address)) {
    throw new Error('Invalid Ethereum address format');
  }

  const balanceWei = await publicClient.getBalance({
    address: address as `0x${string}`,
  });

  const formatted = formatEther(balanceWei);
  const num = parseFloat(formatted);

  if (num === 0) {
    return '0.0000';
  } else if (num < 0.0001) {
    return '< 0.0001';
  } else {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
}

/**
 * Fetch testnet USDC balance on Base Sepolia (6 decimals)
 */
export async function getBaseSepoliaUsdcBalance(address: string): Promise<string> {
  if (!address || !isAddress(address)) {
    throw new Error('Invalid Ethereum address format');
  }

  try {
    const rawBalance = await publicClient.readContract({
      address: BASE_SEPOLIA_USDC_ADDRESS,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    const formatted = formatUnits(rawBalance, 6);
    const num = parseFloat(formatted);

    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (err) {
    console.error('USDC balance fetch error:', err);
    throw new Error('Failed to query testnet USDC balance');
  }
}

/**
 * Ping Base Sepolia RPC and get block number and latency
 */
export async function checkRpcStatus(): Promise<RpcStatusInfo> {
  const start = performance.now();
  try {
    const blockNumber = await publicClient.getBlockNumber();
    const latencyMs = Math.round(performance.now() - start);

    return {
      status: 'connected',
      blockNumber,
      latencyMs,
      chainId: CHAIN_CONFIG.id,
      networkName: CHAIN_CONFIG.name,
    };
  } catch (error) {
    return {
      status: 'error',
      blockNumber: null,
      latencyMs: null,
      error: error instanceof Error ? error.message : 'Failed to reach Base Sepolia RPC',
      chainId: CHAIN_CONFIG.id,
      networkName: CHAIN_CONFIG.name,
    };
  }
}
