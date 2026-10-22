import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LangProvider } from './i18n';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BalanceProvider } from './context/BalanceContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginView } from './components/views/LoginView';
import { HomeView } from './components/views/HomeView';
import { ReceiveView } from './components/views/ReceiveView';
import { SettingsView } from './components/views/SettingsView';
import { DevView } from './components/views/DevView';
import { ComingSoonView } from './components/views/ComingSoonView';
import { OnboardingView } from './components/views/OnboardingView';
import { SplashScreen } from './components/ui/SplashScreen';
import { resubmitPendingTransactions } from './lib/txApi';
import type { ActiveTab } from './types';

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

  // 3. If authenticated but pukico_id is empty, show Onboarding view
  if (!profile.pukico_id || profile.pukico_id.trim() === '') {
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
    <BalanceProvider walletAddress={profile.wallet_address} isDemoMode={isDemoMode}>
      {showSplashOverlay && (
        <SplashScreen
          isLoading={isFinishingOnboarding}
          onFinished={handleSplashFinished}
        />
      )}
      <AppLayout
        currentTab={currentTab}
        onTabChange={handleTabChange}
        profile={profile}
        isDemoMode={isDemoMode}
        isSheetOpen={isSheetOpen}
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
                onNavigateToHistory={() => handleTabChange('history')}
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
                onBack={() => handleTabChange('home')}
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
              <ComingSoonView tab="friends" />
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
              <ComingSoonView tab="history" />
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
                onRedirectToHome={() => handleTabChange('home')}
              />
            </div>
          )}
        </div>
      </AppLayout>
    </BalanceProvider>
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

