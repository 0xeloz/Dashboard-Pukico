import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
import { ENV, CHAIN_CONFIG, isValidPrivyAppId } from '../lib/config';
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
  toggleDemoMode: (enable?: boolean) => void;
  setDemoProfileField: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_DEMO_PROFILE: UserProfile = {
  privy_did: 'did:privy:clx9a8b7c6d5e4f3a2b1c0d9e',
  email_hint: 'beta***@pukico.xyz',
  wallet_address: '0x35B16F71C941A5a50785B8Fa85B9E7804100bF20',
  wallet_verified: true,
  pukico_id: 'andika',
  role: 'admin',
};

// Privy SDK configuration complying with docs.privy.io
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
 * Inner component that consumes Privy hooks when PrivyProvider is present with valid appId
 */
function PrivyConnectedAuthConsumer({
  children,
  initialDemoMode,
}: {
  children: React.ReactNode;
  initialDemoMode: boolean;
}) {
  const {
    ready: isPrivyReady,
    authenticated: isPrivyAuthenticated,
    user: privyUser,
    login: privyLogin,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy();

  const { wallets } = useWallets();

  const [isDemoMode, setIsDemoMode] = useState<boolean>(initialDemoMode);
  const [demoProfile, setDemoProfile] = useState<UserProfile>(DEFAULT_DEMO_PROFILE);
  const [profile, setProfile] = useState<UserProfile | null>(initialDemoMode ? DEFAULT_DEMO_PROFILE : null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<SessionErrorInfo | null>(null);

  // Extract embedded wallet address
  const embeddedWallet =
    wallets.find((w) => w.walletClientType === 'privy' || w.connectorType === 'embedded') ||
    wallets[0] ||
    privyUser?.linkedAccounts.find((a) => a.type === 'wallet' && a.walletClientType === 'privy') ||
    privyUser?.wallet;

  const embeddedWalletAddress = embeddedWallet ? embeddedWallet.address : null;

  // Extract user email
  const userEmail =
    privyUser?.email?.address ||
    (privyUser?.linkedAccounts.find((a) => a.type === 'email') as { address?: string } | undefined)?.address ||
    null;

  // Session sync worker
  const runSessionSync = useCallback(async () => {
    if (!isPrivyAuthenticated || isDemoMode) {
      return;
    }

    if (!userEmail) {
      setSessionError({
        type: 'unauthorized',
        message: 'No email found in Privy account. Please sign in with email.',
      });
      return;
    }

    if (!embeddedWalletAddress) {
      // Wallet creation might still be in progress
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
  }, [isPrivyAuthenticated, isDemoMode, userEmail, embeddedWalletAddress, getAccessToken]);

  // Synchronize whenever authenticated state or wallet changes
  useEffect(() => {
    if (isDemoMode) {
      setIsLoadingSession(false);
      setSessionError(null);
      setProfile(demoProfile);
      return;
    }

    if (isPrivyAuthenticated && isPrivyReady) {
      if (embeddedWalletAddress && userEmail) {
        runSessionSync();
      }
    } else {
      setProfile(null);
      setSessionError(null);
      setIsLoadingSession(false);
    }
  }, [isPrivyAuthenticated, isPrivyReady, embeddedWalletAddress, userEmail, isDemoMode, runSessionSync, demoProfile]);

  const handleLogin = useCallback(() => {
    if (isDemoMode) {
      return;
    }
    setSessionError(null);
    privyLogin();
  }, [isDemoMode, privyLogin]);

  const handleLogout = useCallback(async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setProfile(null);
      return;
    }
    setProfile(null);
    setSessionError(null);
    await privyLogout();
  }, [isDemoMode, privyLogout]);

  const handleRetrySession = useCallback(() => {
    runSessionSync();
  }, [runSessionSync]);

  const handleToggleDemoMode = useCallback((enable?: boolean) => {
    setIsDemoMode((prev) => {
      const next = typeof enable === 'boolean' ? enable : !prev;
      if (next) {
        setProfile(demoProfile);
      } else {
        setProfile(null);
      }
      return next;
    });
  }, [demoProfile]);

  const handleSetDemoProfileField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setDemoProfile((prev) => {
        const updated = {
          ...prev,
          [field]: value,
        };
        if (isDemoMode) {
          setProfile(updated);
        }
        return updated;
      });
    },
    [isDemoMode]
  );

  const value: AuthContextType = {
    isDemoMode,
    hasPrivyConfigured: true,
    isPrivyReady,
    isAuthenticated: isDemoMode ? true : isPrivyAuthenticated && !!profile,
    isLoadingSession: isDemoMode ? false : isLoadingSession,
    sessionError: isDemoMode ? null : sessionError,
    profile: isDemoMode ? demoProfile : profile,
    embeddedWalletAddress: isDemoMode ? demoProfile.wallet_address : embeddedWalletAddress,
    userEmail: isDemoMode ? demoProfile.email_hint : userEmail,
    login: handleLogin,
    logout: handleLogout,
    retrySession: handleRetrySession,
    toggleDemoMode: handleToggleDemoMode,
    setDemoProfileField: handleSetDemoProfileField,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Fallback Provider when VITE_PRIVY_APP_ID is not configured or invalid
 * This prevents the fatal PrivyProvider crash while enabling full Demo Mode testing
 */
function FallbackAuthProvider({
  children,
  initialDemoMode,
}: {
  children: React.ReactNode;
  initialDemoMode: boolean;
}) {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(initialDemoMode);
  const [demoProfile, setDemoProfile] = useState<UserProfile>(DEFAULT_DEMO_PROFILE);
  const [sessionError, setSessionError] = useState<SessionErrorInfo | null>(null);

  const handleToggleDemoMode = useCallback((enable?: boolean) => {
    setIsDemoMode((prev) => (typeof enable === 'boolean' ? enable : !prev));
    setSessionError(null);
  }, []);

  const handleSetDemoProfileField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setDemoProfile((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handleLogin = useCallback(() => {
    // If not in demo mode and user tries to log in without a valid Privy App ID
    if (!isValidPrivyAppId(ENV.PRIVY_APP_ID)) {
      setSessionError({
        type: 'server',
        message:
          'Live login requires a valid 25-character Privy App ID in VITE_PRIVY_APP_ID. You can test all features right now in Demo Mode.',
      });
      return;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setIsDemoMode(false);
    setSessionError(null);
  }, []);

  const value: AuthContextType = {
    isDemoMode,
    hasPrivyConfigured: false,
    isPrivyReady: true,
    isAuthenticated: isDemoMode,
    isLoadingSession: false,
    sessionError,
    profile: isDemoMode ? demoProfile : null,
    embeddedWalletAddress: isDemoMode ? demoProfile.wallet_address : null,
    userEmail: isDemoMode ? demoProfile.email_hint : null,
    login: handleLogin,
    logout: handleLogout,
    retrySession: () => {},
    toggleDemoMode: handleToggleDemoMode,
    setDemoProfileField: handleSetDemoProfileField,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Main Auth Provider wrapping with PrivyProvider only if appId is strictly valid
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hasValidPrivyAppId = isValidPrivyAppId(ENV.PRIVY_APP_ID);
  const initialDemoMode = ENV.DEMO_MODE_DEFAULT;

  if (!hasValidPrivyAppId) {
    return (
      <FallbackAuthProvider initialDemoMode={initialDemoMode}>
        {children}
      </FallbackAuthProvider>
    );
  }

  return (
    <PrivyProvider appId={ENV.PRIVY_APP_ID} config={privyConfig}>
      <PrivyConnectedAuthConsumer initialDemoMode={initialDemoMode}>
        {children}
      </PrivyConnectedAuthConsumer>
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
