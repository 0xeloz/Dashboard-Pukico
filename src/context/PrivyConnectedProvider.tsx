import React, { useState, useEffect, useCallback } from 'react';
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useSendTransaction,
  useMfaEnrollment,
} from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
import { ENV } from '../lib/config';
import { syncSessionWithSupabase, SessionSyncError } from '../lib/sessionApi';
import type { UserProfile, SessionErrorInfo } from '../types';
import { AuthContext, type AuthContextType } from './AuthContext';

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

function PrivyConnectedAuthConsumer({ children }: { children: React.ReactNode }) {
  const {
    ready: isPrivyReady,
    authenticated: isPrivyAuthenticated,
    user: privyUser,
    login: privyLogin,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy();

  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { showMfaEnrollmentModal } = useMfaEnrollment();

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

  const refreshSession = useCallback(async () => {
    if (!isPrivyAuthenticated || !userEmail || !embeddedWalletAddress) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const syncedProfile = await syncSessionWithSupabase({
        privyToken: token,
        email: userEmail,
        walletAddress: embeddedWalletAddress,
      });
      setProfile(syncedProfile);
    } catch (_err) {
      // Do not clear profile on transient background refresh failures
    }
  }, [isPrivyAuthenticated, userEmail, embeddedWalletAddress, getAccessToken]);

  // Revalidate session when app becomes active (visibilitychange / focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [refreshSession]);

  const handleUpdateProfileId = useCallback((newId: string) => {
    setProfile((prev) => (prev ? { ...prev, pukico_id: newId } : null));
  }, []);

  const handleGrantBetaAccess = useCallback(() => {
    setProfile((prev) => (prev ? { ...prev, beta_access: true } : null));
  }, []);

  const handleRevokeBetaAccess = useCallback(() => {
    setProfile((prev) => (prev ? { ...prev, beta_access: false } : null));
  }, []);

  const enrollMfa = useCallback(async () => {
    try {
      await Promise.resolve(showMfaEnrollmentModal());
    } catch (_err) {
      // Do not throw when user closes modal or cancels
    }
  }, [showMfaEnrollmentModal]);

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
    refreshSession,
    setDemoProfileField: () => {},
    updateProfileId: handleUpdateProfileId,
    grantBetaAccess: handleGrantBetaAccess,
    revokeBetaAccess: handleRevokeBetaAccess,
    getAccessToken,
    sendTransaction,
    enrollMfa,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={ENV.PRIVY_APP_ID} config={privyConfig}>
      <PrivyConnectedAuthConsumer>{children}</PrivyConnectedAuthConsumer>
    </PrivyProvider>
  );
}
