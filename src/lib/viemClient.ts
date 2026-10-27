import { createPublicClient, http, formatUnits, isAddress, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CHAIN_CONFIG } from './config';
import { formatEthBalance } from './formatters';
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
 * Fetch raw native ETH balance in wei
 */
export async function getBaseSepoliaBalanceRaw(address: string): Promise<bigint> {
  if (!address || !isAddress(address)) {
    throw new Error('Invalid Ethereum address format');
  }

  return await publicClient.getBalance({
    address: address as `0x${string}`,
  });
}

/**
 * Fetch native ETH balance on Base Sepolia formatted up to 8 decimals
 */
export async function getBaseSepoliaBalance(address: string): Promise<string> {
  const balanceWei = await getBaseSepoliaBalanceRaw(address);
  return formatEthBalance(balanceWei);
}

/**
 * Fetch raw testnet USDC balance (6 decimals)
 */
export async function getBaseSepoliaUsdcBalanceRaw(address: string): Promise<bigint> {
  if (!address || !isAddress(address)) {
    throw new Error('Invalid Ethereum address format');
  }

  const rawBalance = await publicClient.readContract({
    address: BASE_SEPOLIA_USDC_ADDRESS,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });

  return rawBalance as bigint;
}

/**
 * Fetch testnet USDC balance on Base Sepolia (6 decimals, formatted 2 decimals)
 */
export async function getBaseSepoliaUsdcBalance(address: string): Promise<string> {
  try {
    const rawBalance = await getBaseSepoliaUsdcBalanceRaw(address);
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
