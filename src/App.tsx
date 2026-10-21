import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);

  // Handle URL hash / path routing (e.g. /dev or #dev)
  useEffect(() => {
    const checkHashOrPath = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      const path = window.location.pathname.replace('/', '').toLowerCase();

      if (hash === 'dev' || path === 'dev') {
        setCurrentTab('dev');
      } else if (hash === 'receive') {
        setCurrentTab('receive');
      } else if (hash === 'settings') {
        setCurrentTab('settings');
      } else if (hash === 'friends') {
        setCurrentTab('friends');
      } else if (hash === 'discover') {
        setCurrentTab('discover');
      } else if (hash === 'history') {
        setCurrentTab('history');
      }
    };

    checkHashOrPath();
    window.addEventListener('hashchange', checkHashOrPath);
    return () => window.removeEventListener('hashchange', checkHashOrPath);
  }, []);

  // Update hash when tab changes
  const handleTabChange = (tab: ActiveTab) => {
    setCurrentTab(tab);
    window.location.hash = tab === 'home' ? '' : tab;
  };

  // If not authenticated (or session is still synchronizing), show Login screen
  if (!isAuthenticated || !profile) {
    return <LoginView />;
  }

  return (
    <AppLayout
      currentTab={currentTab}
      onTabChange={handleTabChange}
      profile={profile}
      isDemoMode={isDemoMode}
      isSheetOpen={isSheetOpen}
    >
      <div className="transition-opacity duration-200">
        {currentTab === 'home' && (
          <HomeView
            profile={profile}
            isDemoMode={isDemoMode}
            onNavigateToHistory={() => handleTabChange('history')}
            onSheetOpenChange={setIsSheetOpen}
          />
        )}

        {currentTab === 'receive' && (
          <ReceiveView
            walletAddress={profile.wallet_address}
            onBack={() => handleTabChange('home')}
          />
        )}

        {currentTab === 'friends' && <ComingSoonView tab="friends" />}
        {currentTab === 'discover' && <ComingSoonView tab="discover" />}
        {currentTab === 'history' && <ComingSoonView tab="history" />}

        {currentTab === 'settings' && (
          <SettingsView
            profile={profile}
            isDemoMode={isDemoMode}
            onLogout={logout}
            onToggleRole={(role) => setDemoProfileField('role', role)}
            onTogglePukicoId={(hasId) =>
              setDemoProfileField('pukico_id', hasId ? 'andika' : '')
            }
          />
        )}

        {currentTab === 'dev' && (
          <DevView
            profile={profile}
            onRedirectToHome={() => handleTabChange('home')}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}
