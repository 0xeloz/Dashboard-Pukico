import React, { createContext, useContext, useState, useCallback, Suspense, lazy } from 'react';
import { ENV, isValidPrivyAppId } from '../lib/config';
import { useT } from '../i18n';
import type { UserProfile, SessionErrorInfo } from '../types';

export interface AuthContextType {
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
  refreshSession?: () => Promise<void>;
  setDemoProfileField: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void;
  updateProfileId: (pukicoId: string) => void;
  grantBetaAccess: () => void;
  revokeBetaAccess: () => void;
  getAccessToken?: () => Promise<string | null>;
  sendTransaction?: (
    tx: any,
    options?: { uiOptions?: { showWalletUIs?: boolean }; [key: string]: any }
  ) => Promise<{ hash: `0x${string}` }>;
  enrollMfa: () => Promise<void>;
  mfaMethods?: ('sms' | 'totp' | 'passkey')[];
  hasPasskeyMfa?: boolean;
  exportWallet?: (options?: { address: string }) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_DEMO_PROFILE: UserProfile = {
  privy_did: 'did:privy:clx9a8b7c6d5e4f3a2b1c0d9e',
  email_hint: 'andika***@pukico.xyz',
  wallet_address: '0x1111111111111111111111111111111111111111',
  wallet_verified: true,
  pukico_id: 'andika',
  role: 'admin',
  beta_access: true,
};

// Lazy load Privy provider so that heavy wallet connectors are not evaluated when using demo mode
const LazyPrivyAuthProvider = lazy(() => import('./PrivyConnectedProvider'));

/**
 * Demo Mode Provider (with full local session state)
 */
function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_DEMO_PROFILE);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  const handleSetDemoProfileField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setProfile((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handleUpdateProfileId = useCallback((newId: string) => {
    setProfile((prev) => ({
      ...prev,
      pukico_id: newId,
    }));
  }, []);

  const handleGrantBetaAccess = useCallback(() => {
    setProfile((prev) => ({
      ...prev,
      beta_access: true,
    }));
  }, []);

  const handleRevokeBetaAccess = useCallback(() => {
    setProfile((prev) => ({
      ...prev,
      beta_access: false,
    }));
  }, []);

  const handleLogin = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      sessionStorage.removeItem('pukico.history_filters');
    } catch {}
    setIsAuthenticated(false);
  }, []);


  const value: AuthContextType = {
    isDemoMode: true,
    hasPrivyConfigured: isValidPrivyAppId(ENV.PRIVY_APP_ID),
    isPrivyReady: true,
    isAuthenticated,
    isLoadingSession: false,
    sessionError: null,
    profile: isAuthenticated ? profile : null,
    embeddedWalletAddress: isAuthenticated ? profile.wallet_address : null,
    userEmail: isAuthenticated ? profile.email_hint : null,
    login: handleLogin,
    logout: handleLogout,
    retrySession: () => {},
    refreshSession: async () => {},
    setDemoProfileField: handleSetDemoProfileField,
    updateProfileId: handleUpdateProfileId,
    grantBetaAccess: handleGrantBetaAccess,
    revokeBetaAccess: handleRevokeBetaAccess,
    getAccessToken: async () => 'demo-token',
    enrollMfa: async () => {},
    mfaMethods: [],
    hasPasskeyMfa: false,
    exportWallet: async () => {
      throw new Error('EXPORT_UNAVAILABLE_DEMO');
    },
  };


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Screen when VITE_PRIVY_APP_ID is missing and demo mode was explicitly disabled
 */
function ConfigurationMissingScreen({ onEnableDemo }: { onEnableDemo?: () => void }) {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-4">
        <h1 className="text-base font-bold text-[#0A0B0D]">{t.missingConfig.title}</h1>
        <p className="text-sm text-[#3B4455]">{t.missingConfig.message}</p>
        {onEnableDemo && (
          <button
            type="button"
            onClick={onEnableDemo}
            className="w-full py-3 px-4 rounded-xl font-medium text-sm bg-[#0052FF] hover:bg-[#0042D6] text-white transition-all cursor-pointer shadow-sm"
          >
            {t.missingConfig.launchDemo}
          </button>
        )}
      </div>
    </div>
  );
}

function AuthLoadingScreen() {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6 text-sm text-[#5B6577]">
      {t.missingConfig.connectingAuth}
    </div>
  );
}

/**
 * Main Auth Provider entrypoint
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [forcedDemo, setForcedDemo] = useState(false);

  // 1. Strict demo mode check or user-initiated demo fallback
  if (ENV.IS_DEMO_MODE || forcedDemo) {
    return <DemoAuthProvider>{children}</DemoAuthProvider>;
  }

  // 2. Missing configuration check
  if (ENV.IS_CONFIG_MISSING) {
    return (
      <ConfigurationMissingScreen
        onEnableDemo={() => setForcedDemo(true)}
      />
    );
  }

  // 3. Live Privy provider (lazy loaded)
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LazyPrivyAuthProvider>{children}</LazyPrivyAuthProvider>
    </Suspense>
  );
}


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
