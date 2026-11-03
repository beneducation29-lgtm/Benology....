/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  BookOpen,
  ClipboardPaste,
  Home,
  Layers,
  Loader2,
  Mic,
  PlusCircle,
  Repeat,
  Settings,
} from 'lucide-react';
import { AuthLanding } from './components/AuthLanding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LearningProvider, useLearning } from './context/LearningContext';
import { isDueToday } from './lib/dedupAndSrs';
import { DashboardPage } from './pages/DashboardPage';
import { FlashcardsPage } from './pages/FlashcardsPage';
import { ImportPage } from './pages/ImportPage';
import { LessonsPage } from './pages/LessonsPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShadowingPage } from './pages/ShadowingPage';
import { NavTab } from './types';

interface NavItemConfig {
  id: NavTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Trang chủ', shortLabel: 'Trang chủ', icon: Home },
  { id: 'import', label: 'Nhập bản dịch', shortLabel: 'Nhập dịch', icon: ClipboardPaste },
  { id: 'lessons', label: 'Bài học', shortLabel: 'Bài học', icon: BookOpen },
  { id: 'flashcards', label: 'Flashcard', shortLabel: 'Từ vựng', icon: Layers },
  { id: 'shadowing', label: 'Shadowing', shortLabel: 'Luyện nói', icon: Mic },
  { id: 'review', label: 'Ôn tập', shortLabel: 'Ôn tập', icon: Repeat },
  { id: 'settings', label: 'Cài đặt', shortLabel: 'Cài đặt', icon: Settings },
];

function WorkspaceShell() {
  const {
    firebaseUser,
    profile,
    authLoading,
    flashcards,
    reviewProgressMap,
    activeTab,
    setActiveTab,
    setSelectedLessonId,
  } = useLearning();

  const dueCount = useMemo(() => {
    let count = 0;
    for (const fc of flashcards) {
      if (isDueToday(reviewProgressMap.get(fc.id))) count += 1;
    }
    return count;
  }, [flashcards, reviewProgressMap]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-sky-700" />
          <span>Đang tải không gian học tập...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthLanding />;
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handleNavigate = (tab: NavTab) => {
    if (tab !== 'lessons' && tab !== 'shadowing') {
      setSelectedLessonId(null);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="px-6 py-5 border-b border-slate-100">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="text-left text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap"
          >
            Smart Translation
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-50 text-sky-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-sky-700' : 'text-slate-400'}`} />
                  {item.label}
                </span>
                {item.id === 'review' && dueCount > 0 && (
                  <span className="text-xs font-mono tabular-nums font-semibold text-sky-700">
                    {dueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-800 truncate">
            {profile?.displayName || firebaseUser.displayName || 'Học viên'}
          </p>
          <p className="font-mono tabular-nums">
            Chuỗi học: {profile?.streakDays || 0} ngày
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Clean 3-Zone Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="lg:hidden font-bold text-slate-900 font-display whitespace-nowrap">
              Smart Translation
            </span>
            <span className="lg:hidden text-slate-300">/</span>
            <span className="font-medium text-slate-800 truncate">{currentNav.label}</span>
          </div>

          <div className="hidden md:flex items-center gap-5 text-xs text-slate-500">
            <span className="whitespace-nowrap">
              Ngôn ngữ chính:{' '}
              <strong className="text-slate-800">
                {profile?.primaryLearningLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap font-mono tabular-nums">
              Cần ôn hôm nay: <strong className="text-sky-700">{dueCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeTab !== 'import' ? (
              <button
                type="button"
                onClick={() => handleNavigate('import')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Nhập bản dịch
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('lessons')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Xem bài học
              </button>
            )}
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'import' && <ImportPage />}
          {activeTab === 'lessons' && <LessonsPage />}
          {activeTab === 'flashcards' && <FlashcardsPage />}
          {activeTab === 'shadowing' && <ShadowingPage />}
          {activeTab === 'review' && <ReviewPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Compact Mobile Bottom Navigation (<= 56px height, well below 15% viewport sticky cap) */}
      <nav
        aria-label="Điều hướng di động"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-white border-t border-slate-200 z-40 grid grid-cols-7"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={`mob_${item.id}`}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-sky-700 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] leading-none truncate max-w-full px-0.5">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LearningProvider>
        <WorkspaceShell />
      </LearningProvider>
    </ErrorBoundary>
  );
}
