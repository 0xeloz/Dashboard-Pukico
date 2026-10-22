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
import type { ActiveTab } from './types';

function Dashboard() {
  const {
    isAuthenticated,
    profile,
    isDemoMode,
    logout,
    setDemoProfileField,
  } = useAuth();

  const [currentTab, setCurrentTab] = useState<ActiveTab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set(['home']));
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);

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

  // If not authenticated (or session is still synchronizing), show Login screen
  if (!isAuthenticated || !profile) {
    return <LoginView />;
  }

  return (
    <BalanceProvider walletAddress={profile.wallet_address} isDemoMode={isDemoMode}>
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

