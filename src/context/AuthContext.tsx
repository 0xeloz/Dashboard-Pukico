import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
import { ENV, isValidPrivyAppId } from '../lib/config';
import { syncSessionWithSupabase, SessionSyncError } from '../lib/sessionApi';
import type { UserProfile, SessionErrorInfo } from '../types';

interface AuthContextType {
  isDemoMode: boolean;
  hasPrivyConfigured: boolean;
  isPrivyReady: boolean;
  isAuthenticated: boolean;
  isLoadingSession: boolean;
  sessionError: SessionErrorInfo | null;
  profile: UserProfile | null;
  embeddedWalletAddress: string | null;
  userEmail: string | null;
  login: () => void;
  logout: () => Promise<void>;
  retrySession: () => void;
  setDemoProfileField: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_DEMO_PROFILE: UserProfile = {
  privy_did: 'did:privy:clx9a8b7c6d5e4f3a2b1c0d9e',
  email_hint: 'andika***@pukico.xyz',
  wallet_address: '0x1111111111111111111111111111111111111111',
  wallet_verified: true,
  pukico_id: 'andika',
  role: 'admin',
};

const privyConfig = {
  loginMethods: ['email' as const],
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets' as const,
    },
  },
  defaultChain: baseSepolia,
  supportedChains: [baseSepolia],
  appearance: {
    theme: 'light' as const,
    accentColor: '#0052FF' as `#${string}`,
    logo: '/pukico-logo.png',
  },
};

/**
 * Live Privy-connected consumer
 */
function PrivyConnectedAuthConsumer({ children }: { children: React.ReactNode }) {
  const {
    ready: isPrivyReady,
    authenticated: isPrivyAuthenticated,
    user: privyUser,
    login: privyLogin,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy();

  const { wallets } = useWallets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<SessionErrorInfo | null>(null);

  const embeddedWallet =
    wallets.find((w) => w.walletClientType === 'privy' || w.connectorType === 'embedded') ||
    wallets[0] ||
    privyUser?.linkedAccounts.find((a) => a.type === 'wallet' && a.walletClientType === 'privy') ||
    privyUser?.wallet;

  const embeddedWalletAddress = embeddedWallet ? embeddedWallet.address : null;

  const userEmail =
    privyUser?.email?.address ||
    (privyUser?.linkedAccounts.find((a) => a.type === 'email') as { address?: string } | undefined)?.address ||
    null;

  const runSessionSync = useCallback(async () => {
    if (!isPrivyAuthenticated) return;

    if (!userEmail) {
      setSessionError({
        type: 'unauthorized',
        message: 'No email found in Privy account. Please sign in with email.',
      });
      return;
    }

    if (!embeddedWalletAddress) {
      setIsLoadingSession(true);
      return;
    }

    setIsLoadingSession(true);
    setSessionError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new SessionSyncError('unauthorized', 'Unable to retrieve Privy access token.');
      }

      const syncedProfile = await syncSessionWithSupabase({
        privyToken: token,
        email: userEmail,
        walletAddress: embeddedWalletAddress,
      });

      setProfile(syncedProfile);
      setSessionError(null);
    } catch (err) {
      if (err instanceof SessionSyncError) {
        setSessionError({
          type: err.type,
          message: err.message,
          statusCode: err.statusCode,
        });
      } else {
        setSessionError({
          type: 'server',
          message: err instanceof Error ? err.message : 'Unknown session error occurred.',
        });
      }
      setProfile(null);
    } finally {
      setIsLoadingSession(false);
    }
  }, [isPrivyAuthenticated, userEmail, embeddedWalletAddress, getAccessToken]);

  useEffect(() => {
    if (isPrivyAuthenticated && isPrivyReady) {
      if (embeddedWalletAddress && userEmail) {
        runSessionSync();
      }
    } else {
      setProfile(null);
      setSessionError(null);
      setIsLoadingSession(false);
    }
  }, [isPrivyAuthenticated, isPrivyReady, embeddedWalletAddress, userEmail, runSessionSync]);

  const value: AuthContextType = {
    isDemoMode: false,
    hasPrivyConfigured: true,
    isPrivyReady,
    isAuthenticated: isPrivyAuthenticated && !!profile,
    isLoadingSession,
    sessionError,
    profile,
    embeddedWalletAddress,
    userEmail,
    login: () => {
      setSessionError(null);
      privyLogin();
    },
    logout: async () => {
      setProfile(null);
      setSessionError(null);
      await privyLogout();
    },
    retrySession: runSessionSync,
    setDemoProfileField: () => {},
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Pure Demo Mode Provider (only active when VITE_DEMO_MODE === 'true')
 */
function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_DEMO_PROFILE);

  const handleSetDemoProfileField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setProfile((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const value: AuthContextType = {
    isDemoMode: true,
    hasPrivyConfigured: isValidPrivyAppId(ENV.PRIVY_APP_ID),
    isPrivyReady: true,
    isAuthenticated: true,
    isLoadingSession: false,
    sessionError: null,
    profile,
    embeddedWalletAddress: profile.wallet_address,
    userEmail: profile.email_hint,
    login: () => {},
    logout: async () => {},
    retrySession: () => {},
    setDemoProfileField: handleSetDemoProfileField,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Minimal screen when VITE_DEMO_MODE is not "true" and VITE_PRIVY_APP_ID is missing/invalid
 */
function ConfigurationMissingScreen() {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-2">
        <h1 className="text-base font-bold text-[#0A0B0D]">Configuration missing</h1>
        <p className="text-sm text-[#3B4455]">This app is missing VITE_PRIVY_APP_ID.</p>
      </div>
    </div>
  );
}

/**
 * Main Auth Provider entrypoint
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 1. Strict demo mode check
  if (ENV.IS_DEMO_MODE) {
    return <DemoAuthProvider>{children}</DemoAuthProvider>;
  }

  // 2. Missing configuration check
  if (ENV.IS_CONFIG_MISSING) {
    return <ConfigurationMissingScreen />;
  }

  // 3. Live Privy provider
  return (
    <PrivyProvider appId={ENV.PRIVY_APP_ID} config={privyConfig}>
      <PrivyConnectedAuthConsumer>{children}</PrivyConnectedAuthConsumer>
    </PrivyProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
