import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { EditorialFooter } from './components/EditorialFooter';
import { LandingPage } from './pages/LandingPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ExplorerPage } from './pages/ExplorerPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CategoryViewPage } from './pages/CategoryViewPage';
import { ArchiveDetailPage } from './pages/ArchiveDetailPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { ProfilePage } from './pages/ProfilePage';
import { SecuritySettingsPage } from './pages/SecuritySettingsPage';
import { AboutPage, EditorialPrinciplesPage, PrivacyPage, TermsPage } from './pages/LegalPages';
import { AccessDeniedPage, AccountSuspendedPage } from './pages/StatusPages';
import { AdminLayout } from './pages/admin/AdminLayout';

function RouteView() {
  const { user, loading, banInfo, currentPath } = useApp();

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-[#090D0C]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B89B63] border-t-transparent" />
      </div>
    );
  }

  if (banInfo || currentPath === '/suspended') {
    return <AccountSuspendedPage />;
  }

  if (currentPath === '/' || currentPath === '') {
    return <LandingPage />;
  }

  if (currentPath === '/about' || currentPath === '/purpose') {
    return <AboutPage />;
  }

  if (currentPath === '/editorial-principles' || currentPath === '/neutrality') {
    return <EditorialPrinciplesPage />;
  }

  if (currentPath === '/terms' || currentPath === '/legal') {
    return <TermsPage />;
  }

  if (currentPath === '/privacy') {
    return <PrivacyPage />;
  }

  if (currentPath === '/explorer' || currentPath === '/search') {
    return <ExplorerPage />;
  }

  if (currentPath === '/categories') {
    return <CategoriesPage mode="categories" />;
  }

  if (currentPath === '/subcategories') {
    return <CategoriesPage mode="subcategories" />;
  }

  if (currentPath.startsWith('/category/')) {
    const slug = decodeURIComponent(currentPath.slice('/category/'.length));
    return <CategoryViewPage slug={slug} />;
  }

  if (currentPath.startsWith('/archive/')) {
    const slug = decodeURIComponent(currentPath.slice('/archive/'.length));
    return <ArchiveDetailPage slug={slug} />;
  }

  if (currentPath === '/login') {
    return user ? <DashboardPage /> : <LoginPage />;
  }

  if (currentPath === '/register') {
    return user ? <DashboardPage /> : <RegisterPage />;
  }

  if (currentPath === '/access-denied') {
    return <AccessDeniedPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (currentPath.startsWith('/admin')) {
    return <AdminLayout />;
  }

  if (currentPath === '/dashboard') {
    return <DashboardPage />;
  }

  if (currentPath === '/favorites') {
    return <FavoritesPage />;
  }

  if (currentPath === '/profile') {
    return <ProfilePage />;
  }

  if (currentPath === '/security') {
    return <SecuritySettingsPage />;
  }

  return <LandingPage />;
}

function AppShell() {
  const { currentPath } = useApp();
  const isAdmin = currentPath.startsWith('/admin');

  return (
    <div className="flex min-h-screen flex-col bg-[#090D0C] text-[#E9E7DF]">
      <Navbar />
      <div className="flex-1">
        <RouteView />
      </div>
      {!isAdmin && <EditorialFooter />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
