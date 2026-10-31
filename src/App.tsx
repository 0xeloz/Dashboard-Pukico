import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LangProvider, useT } from './i18n';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BalanceProvider } from './context/BalanceContext';
import { TxProvider } from './context/TxContext';
import { ToastProvider } from './context/ToastContext';
import { ToastViewport } from './components/ui/ToastViewport';
import { NotificationsProvider } from './context/NotificationsContext';
import { FriendsProvider, useFriends } from './context/FriendsContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginView } from './components/views/LoginView';
import { HomeView } from './components/views/HomeView';
import { ReceiveView } from './components/views/ReceiveView';
import { FriendsView } from './components/views/FriendsView';
import { HistoryView } from './components/views/HistoryView';
import { SettingsView } from './components/views/SettingsView';
import { DevView } from './components/views/DevView';
import { ComingSoonView } from './components/views/ComingSoonView';
import { OnboardingView } from './components/views/OnboardingView';
import { AccessCodeView } from './components/views/AccessCodeView';
import { SplashScreen } from './components/ui/SplashScreen';
import { BottomSheet } from './components/ui/BottomSheet';
import { SendSheetContent } from './components/views/sheets/SendSheetContent';
import { resubmitPendingTransactions } from './lib/txApi';
import type { ActiveTab, UserProfile } from './types';

function Dashboard() {
  const {
    isAuthenticated,
    isPrivyReady,
    isLoadingSession,
    profile,
    isDemoMode,
    logout,
    setDemoProfileField,
    updateProfileId,
    getAccessToken,
    enrollMfa,
    hasPasskeyMfa,
  } = useAuth();

  const [currentTab, setCurrentTab] = useState<ActiveTab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set(['home']));
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [isFinishingOnboarding, setIsFinishingOnboarding] = useState<boolean>(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState<boolean>(false);

  // Transition handler when onboarding finishes
  const handleOnboardingComplete = useCallback(
    (claimedId: string) => {
      setShowSplashOverlay(true);
      setIsFinishingOnboarding(true);
      setTimeout(() => {
        updateProfileId(claimedId);
        setTimeout(() => {
          setIsFinishingOnboarding(false);
        }, 500);
      }, 120);
    },
    [updateProfileId]
  );

  const handleSplashFinished = useCallback(() => {
    setShowSplashOverlay(false);
  }, []);

  // Resubmit pending transactions from localStorage when session succeeds
  const hasResubmittedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && profile?.pukico_id && !hasResubmittedRef.current) {
      hasResubmittedRef.current = true;
      (async () => {
        try {
          const token = getAccessToken ? await getAccessToken() : null;
          await resubmitPendingTransactions({ privyToken: token, isDemoMode });
        } catch {
          // Ignore background resubmit errors
        }
      })();
    }
  }, [isAuthenticated, profile?.pukico_id, getAccessToken, isDemoMode]);

  // Store scroll positions per tab
  const scrollPositions = useRef<Partial<Record<ActiveTab, number>>>({});
  const activeTabRef = useRef<ActiveTab>(currentTab);
  activeTabRef.current = currentTab;

  // Handle URL hash / path routing (e.g. /dev or #dev)
  useEffect(() => {
    const checkHashOrPath = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      const path = window.location.pathname.replace('/', '').toLowerCase();

      let target: ActiveTab | null = null;
      if (hash === 'dev' || path === 'dev') target = 'dev';
      else if (hash === 'receive') target = 'receive';
      else if (hash === 'settings') target = 'settings';
      else if (hash === 'friends') target = 'friends';
      else if (hash === 'discover') target = 'discover';
      else if (hash === 'history') target = 'history';

      if (target && target !== activeTabRef.current) {
        scrollPositions.current[activeTabRef.current] = window.scrollY;
        setCurrentTab(target);
        setVisitedTabs((prev) => new Set(prev).add(target!));
      }
    };

    checkHashOrPath();
    window.addEventListener('hashchange', checkHashOrPath);
    return () => window.removeEventListener('hashchange', checkHashOrPath);
  }, []);

  // Update tab and save/restore scroll positions
  const handleTabChange = useCallback((tab: ActiveTab) => {
    if (tab === activeTabRef.current) return;

    // Save scroll of current tab
    scrollPositions.current[activeTabRef.current] = window.scrollY;

    // Mark tab visited so it mounts once and stays alive
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });

    setCurrentTab(tab);
    window.location.hash = tab === 'home' ? '' : tab;

    // Restore scroll on next tick after visibility change
    const targetScroll = scrollPositions.current[tab] ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetScroll, behavior: 'instant' });
    });
  }, []);

  // 1. Privy is initializing or session is loading on startup
  if (!isPrivyReady || (isLoadingSession && !profile)) {
    return <SplashScreen isLoading={true} />;
  }

  // 2. If not authenticated, show Login screen
  if (!isAuthenticated || !profile) {
    return <LoginView />;
  }

  // 3. If authenticated but pukico_id is empty, check closed beta access
  if (!profile.pukico_id || profile.pukico_id.trim() === '') {
    if (!profile.beta_access && profile.role !== 'admin') {
      return <AccessCodeView />;
    }

    return (
      <>
        <OnboardingView onComplete={handleOnboardingComplete} />
        {showSplashOverlay && (
          <SplashScreen
            isLoading={isFinishingOnboarding}
            onFinished={handleSplashFinished}
          />
        )}
      </>
    );
  }

  return (
    <ToastProvider storageId={profile.wallet_address}>
      <ToastViewport />
      <BalanceProvider walletAddress={profile.wallet_address} isDemoMode={isDemoMode}>
        <TxProvider walletAddress={profile.wallet_address} isDemoMode={isDemoMode}>
          <NotificationsProvider walletAddress={profile.wallet_address} isDemoMode={isDemoMode}>
            <FriendsProvider walletAddress={profile.wallet_address} isDemoMode={isDemoMode}>
              {showSplashOverlay && (
                <SplashScreen
                  isLoading={isFinishingOnboarding}
                  onFinished={handleSplashFinished}
                />
              )}
              <DashboardContent
                currentTab={currentTab}
                onTabChange={handleTabChange}
                visitedTabs={visitedTabs}
                profile={profile}
                isDemoMode={isDemoMode}
                isSheetOpen={isSheetOpen}
                setIsSheetOpen={setIsSheetOpen}
                logout={logout}
                setDemoProfileField={setDemoProfileField}
                enrollMfa={enrollMfa}
                hasPasskeyMfa={hasPasskeyMfa}
              />
            </FriendsProvider>
          </NotificationsProvider>
        </TxProvider>
      </BalanceProvider>
    </ToastProvider>
  );
}

interface DashboardContentProps {
  currentTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  visitedTabs: Set<ActiveTab>;
  profile: UserProfile;
  isDemoMode: boolean;
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  logout: () => Promise<void>;
  setDemoProfileField: (field: 'role' | 'pukico_id', val: any) => void;
  enrollMfa: () => Promise<void>;
  hasPasskeyMfa?: boolean;
}

function DashboardContent({
  currentTab,
  onTabChange,
  visitedTabs,
  profile,
  isDemoMode,
  isSheetOpen,
  setIsSheetOpen,
  logout,
  setDemoProfileField,
  enrollMfa,
  hasPasskeyMfa,
}: DashboardContentProps) {
  const { t } = useT();
  const {
    isSendOpen,
    closeSend,
    sendPrefilledId,
    isSendWaitingApproval,
    setIsSendWaitingApproval,
  } = useFriends();

  const [isSendReviewStep, setIsSendReviewStep] = useState<boolean>(false);
  const handleCloseSend = useCallback(() => {
    setIsSendReviewStep(false);
    closeSend();
  }, [closeSend]);

  return (
    <>
      <AppLayout
        currentTab={currentTab}
        onTabChange={onTabChange}
        profile={profile}
        isDemoMode={isDemoMode}
        isSheetOpen={isSheetOpen || isSendOpen}
      >
        <div className="w-full min-w-0">
          {/* 1. Home View */}
          {visitedTabs.has('home') && (
            <div
              hidden={currentTab !== 'home'}
              inert={currentTab !== 'home' ? true : undefined}
              className={currentTab === 'home' ? 'tab-view-active' : ''}
            >
              <HomeView
                profile={profile}
                isDemoMode={isDemoMode}
                onNavigateToHistory={() => onTabChange('history')}
                onSheetOpenChange={setIsSheetOpen}
              />
            </div>
          )}

          {/* 2. Receive View */}
          {visitedTabs.has('receive') && (
            <div
              hidden={currentTab !== 'receive'}
              inert={currentTab !== 'receive' ? true : undefined}
              className={currentTab === 'receive' ? 'tab-view-active' : ''}
            >
              <ReceiveView
                walletAddress={profile.wallet_address}
                onBack={() => onTabChange('home')}
                isDemoMode={isDemoMode}
              />
            </div>
          )}

          {/* 3. Friends View */}
          {visitedTabs.has('friends') && (
            <div
              hidden={currentTab !== 'friends'}
              inert={currentTab !== 'friends' ? true : undefined}
              className={currentTab === 'friends' ? 'tab-view-active' : ''}
            >
              <FriendsView />
            </div>
          )}

          {/* 4. Discover View */}
          {visitedTabs.has('discover') && (
            <div
              hidden={currentTab !== 'discover'}
              inert={currentTab !== 'discover' ? true : undefined}
              className={currentTab === 'discover' ? 'tab-view-active' : ''}
            >
              <ComingSoonView tab="discover" />
            </div>
          )}

          {/* 5. History View */}
          {visitedTabs.has('history') && (
            <div
              hidden={currentTab !== 'history'}
              inert={currentTab !== 'history' ? true : undefined}
              className={currentTab === 'history' ? 'tab-view-active' : ''}
            >
              <HistoryView isDemoMode={isDemoMode} />
            </div>
          )}

          {/* 6. Settings View */}
          {visitedTabs.has('settings') && (
            <div
              hidden={currentTab !== 'settings'}
              inert={currentTab !== 'settings' ? true : undefined}
              className={currentTab === 'settings' ? 'tab-view-active' : ''}
            >
              <SettingsView
                profile={profile}
                isDemoMode={isDemoMode}
                onLogout={logout}
                onEnrollMfa={enrollMfa}
                hasPasskeyMfa={hasPasskeyMfa}
                onToggleRole={(role) => setDemoProfileField('role', role)}
                onTogglePukicoId={(hasId) =>
                  setDemoProfileField('pukico_id', hasId ? 'andika' : '')
                }
              />
            </div>
          )}

          {/* 7. Dev View */}
          {visitedTabs.has('dev') && (
            <div
              hidden={currentTab !== 'dev'}
              inert={currentTab !== 'dev' ? true : undefined}
              className={currentTab === 'dev' ? 'tab-view-active' : ''}
            >
              <DevView
                profile={profile}
                onRedirectToHome={() => onTabChange('home')}
              />
            </div>
          )}
        </div>
      </AppLayout>

      {/* Global Send Bottom Sheet (triggered from Home quick action or Friends profile) */}
      <BottomSheet
        open={isSendOpen}
        onClose={handleCloseSend}
        title={t.sheets.send.title}
        disableBackdropClick={isSendWaitingApproval}
        sheetClassName={isSendReviewStep ? 'max-h-[92dvh]' : undefined}
        contentClassName={isSendReviewStep ? 'flex flex-col flex-1 min-h-0 overflow-hidden p-0' : undefined}
      >
        <SendSheetContent
          onClose={handleCloseSend}
          isDemoMode={isDemoMode}
          onApprovalStateChange={setIsSendWaitingApproval}
          prefilledRecipientId={sendPrefilledId}
          onStepChange={(s) => setIsSendReviewStep(s === 4)}
        />
      </BottomSheet>
    </>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </LangProvider>
  );
}

