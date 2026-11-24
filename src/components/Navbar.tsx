import { Bell, Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { AppView, UserProfile } from '../types/auth';

interface NavbarProps {
  activeView: AppView;
  user: UserProfile | null;
  unreadNotificationCount: number;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
}

const AUTH_NAV_ITEMS: Array<{ view: AppView; label: string }> = [
  { view: 'home', label: 'Home' },
  { view: 'explore', label: 'Explore' },
  { view: 'create-post', label: 'Create Post' },
  { view: 'enquiries', label: 'Enquiries' },
  { view: 'profile', label: 'My Profile' },
  { view: 'settings', label: 'Settings' },
];

export function Navbar({
  activeView,
  user,
  unreadNotificationCount,
  onNavigate,
  onLogout,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function handleNavClick(view: AppView) {
    setMobileMenuOpen(false);
    onNavigate(view);
  }

  const formattedUnread =
    unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

  return (
    <header className="glass-nav sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        {/* Zone 1: Single-line brand mark */}
        <button
          type="button"
          onClick={() => handleNavClick(user ? 'home' : 'landing')}
          className="group flex items-center gap-2.5 whitespace-nowrap shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1F3A] via-[#13315C] to-[#1D4ED8] text-white shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M12 2.5C7.86 2.5 4.5 5.86 4.5 10c0 5.14 6.26 10.74 6.53 10.97a1.5 1.5 0 0 0 1.94 0C13.24 20.74 19.5 15.14 19.5 10c0-4.14-3.36-7.5-7.5-7.5Zm0 10.25a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-[#0B1F3A]">
            LocalPro
          </span>
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-600"
        >
          {user ? (
            AUTH_NAV_ITEMS.map((item) => {
              const isActive =
                activeView === item.view ||
                (item.view === 'explore' && activeView === 'public-profile') ||
                (item.view === 'home' && activeView === 'post-detail');
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => handleNavClick(item.view)}
                  className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors hover:text-[#0B1F3A] ${
                    isActive
                      ? 'border-[#1D4ED8] font-semibold text-[#0B1F3A]'
                      : 'border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              );
            })
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleNavClick('landing')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#0B1F3A] ${
                  activeView === 'landing' ? 'font-semibold text-[#0B1F3A]' : ''
                }`}
              >
                Overview
              </button>
              <a
                href="#how-it-works"
                onClick={() => {
                  if (activeView !== 'landing') handleNavClick('landing');
                }}
                className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0B1F3A]"
              >
                How It Works
              </a>
              <a
                href="#skill-categories"
                onClick={() => {
                  if (activeView !== 'landing') handleNavClick('landing');
                }}
                className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0B1F3A]"
              >
                Categories
              </a>
              <button
                type="button"
                onClick={() => handleNavClick('login')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#0B1F3A] ${
                  activeView === 'login' ? 'font-semibold text-[#0B1F3A]' : ''
                }`}
              >
                Login
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Notifications Bell + Logout / Auth CTA + Mobile drawer toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
          {user ? (
            <>
              <button
                type="button"
                onClick={() => handleNavClick('notifications')}
                aria-label={
                  unreadNotificationCount > 0
                    ? `Notifications (${unreadNotificationCount} unread)`
                    : 'Notifications'
                }
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                  activeView === 'notifications'
                    ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]'
                    : 'border-slate-200/90 bg-white/85 text-[#0B1F3A] hover:border-slate-300 hover:bg-white'
                }`}
              >
                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#1D4ED8] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-xs tabular-nums">
                    {formattedUnread}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="hidden lg:inline-flex whitespace-nowrap shrink-0 rounded-xl border border-slate-200/90 bg-white/85 px-4 py-2 text-sm font-semibold text-[#0B1F3A] shadow-xs transition-all hover:border-slate-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                Logout
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white/85 text-[#0B1F3A] lg:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </>
          ) : activeView === 'register' ? (
            <button
              type="button"
              onClick={() => handleNavClick('login')}
              className="whitespace-nowrap shrink-0 rounded-xl border border-slate-200/90 bg-white/85 px-4 py-2 text-sm font-semibold text-[#0B1F3A] shadow-xs transition-all hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              Login
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNavClick('register')}
              className="btn-royal whitespace-nowrap shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              Create Account
            </button>
          )}
        </div>
      </div>

      {/* Mobile / Tablet navigation drawer for authenticated users */}
      {user && mobileMenuOpen && (
        <div className="border-t border-slate-200/70 bg-white/95 px-5 py-3 backdrop-blur-xl lg:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
            {AUTH_NAV_ITEMS.map((item) => {
              const isActive =
                activeView === item.view ||
                (item.view === 'explore' && activeView === 'public-profile') ||
                (item.view === 'home' && activeView === 'post-detail');
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => handleNavClick(item.view)}
                  className={`flex min-h-[44px] items-center rounded-xl px-3 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#EFF6FF] font-semibold text-[#1D4ED8]'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleNavClick('notifications')}
              className={`flex min-h-[44px] items-center justify-between rounded-xl px-3 text-left text-sm font-medium transition-colors ${
                activeView === 'notifications'
                  ? 'bg-[#EFF6FF] font-semibold text-[#1D4ED8]'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Notifications</span>
              {unreadNotificationCount > 0 && (
                <span className="rounded-full bg-[#1D4ED8] px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                  {formattedUnread}
                </span>
              )}
            </button>
            <div className="my-1 h-px bg-slate-200/80" />
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onLogout();
              }}
              className="flex min-h-[44px] items-center rounded-xl px-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50/70"
            >
              Logout
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
