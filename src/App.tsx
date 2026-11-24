import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { CreatePostPage } from './components/CreatePostPage';
import { EnquiriesPage } from './components/EnquiriesPage';
import { ExplorePage } from './components/ExplorePage';
import { HomeFeedPage } from './components/HomeFeedPage';
import { LandingPage } from './components/LandingPage';
import { LiquidBackground } from './components/LiquidBackground';
import { LoginPage } from './components/LoginPage';
import { AccountSettingsView } from './components/ModulePages';
import { Navbar } from './components/Navbar';
import { NotificationsPage } from './components/NotificationsPage';
import { ProfileView } from './components/ProfileView';
import { RegisterPage } from './components/RegisterPage';
import { SinglePostPage } from './components/SinglePostPage';
import { COOKIE_SESSION_SENTINEL } from './services/apiClient';
import { fetchCurrentUser, fetchPredefinedSkills, logoutAccount } from './services/authApi';
import { logoutGoogle } from './services/gmailAuth';
import { fetchUnreadNotificationCount } from './services/notificationApi';
import { fetchCategories } from './services/postApi';
import { fetchPublicProfileById as loadPublicProfileById } from './services/profileApi';
import type {
  AppView,
  AuthResponse,
  CategoryItem,
  PublicProfile,
  SkillItem,
  UserProfile,
} from './types/auth';

function resolveRouteFromPath(
  pathname: string,
  hasUser: boolean
): { view: AppView; publicProfileId: string | null; postDetailId: string | null } {
  if (pathname === '/register') {
    return { view: hasUser ? 'home' : 'register', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/login') {
    return { view: hasUser ? 'home' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/home') {
    return { view: hasUser ? 'home' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/explore') {
    return { view: hasUser ? 'explore' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/create-post') {
    return { view: hasUser ? 'create-post' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/enquiries') {
    return { view: hasUser ? 'enquiries' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/profile' || pathname === '/welcome') {
    return { view: hasUser ? 'profile' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname.startsWith('/profiles/')) {
    const id = decodeURIComponent(pathname.slice('/profiles/'.length)).trim();
    if (id) {
      return {
        view: hasUser ? 'public-profile' : 'login',
        publicProfileId: id,
        postDetailId: null,
      };
    }
  }
  if (pathname.startsWith('/posts/')) {
    const postId = decodeURIComponent(pathname.slice('/posts/'.length)).trim();
    if (postId) {
      return {
        view: hasUser ? 'post-detail' : 'login',
        publicProfileId: null,
        postDetailId: postId,
      };
    }
  }
  if (pathname === '/notifications') {
    return { view: hasUser ? 'notifications' : 'login', publicProfileId: null, postDetailId: null };
  }
  if (pathname === '/settings') {
    return { view: hasUser ? 'settings' : 'login', publicProfileId: null, postDetailId: null };
  }
  return { view: hasUser ? 'home' : 'landing', publicProfileId: null, postDetailId: null };
}

function pathForRoute(
  view: AppView,
  publicProfileId?: string | null,
  postDetailId?: string | null
): string {
  switch (view) {
    case 'register':
      return '/register';
    case 'login':
      return '/login';
    case 'home':
      return '/home';
    case 'explore':
      return '/explore';
    case 'create-post':
      return '/create-post';
    case 'enquiries':
      return '/enquiries';
    case 'profile':
      return '/profile';
    case 'public-profile':
      return publicProfileId ? `/profiles/${encodeURIComponent(publicProfileId)}` : '/explore';
    case 'post-detail':
      return postDetailId ? `/posts/${encodeURIComponent(postDetailId)}` : '/home';
    case 'notifications':
      return '/notifications';
    case 'settings':
      return '/settings';
    default:
      return '/';
  }
}

export default function App() {
  // Hold bearer token strictly in React memory (never localStorage/sessionStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allSkills, setAllSkills] = useState<SkillItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [feedCategoryFilter, setFeedCategoryFilter] = useState<number | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [enquiriesInitialTab, setEnquiriesInitialTab] = useState<'received' | 'sent' | undefined>(
    undefined
  );

  const [activeView, setActiveView] = useState<AppView>(
    () => resolveRouteFromPath(window.location.pathname, false).view
  );

  // Public profile & post detail view state
  const [selectedPublicProfileId, setSelectedPublicProfileId] = useState<string | null>(null);
  const [selectedPostDetailId, setSelectedPostDetailId] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState('');

  // Load predefined skills, categories, and rehydrate HttpOnly cookie session if present
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPredefinedSkills(), fetchCategories()])
      .then(([skills, cats]) => {
        if (!cancelled) {
          setAllSkills(skills);
          setCategories(cats);
        }
      })
      .catch((err) => {
        console.error('Failed to load skills/categories:', err);
      });

    const params = new URLSearchParams(window.location.search);
    if (params.has('resetToken') || params.has('verifyToken')) {
      setActiveView('login');
      return () => {
        cancelled = true;
      };
    }

    fetchCurrentUser(COOKIE_SESSION_SENTINEL)
      .then((cookieUser) => {
        if (cancelled) return;
        setAuthToken(COOKIE_SESSION_SENTINEL);
        setUser(cookieUser);
        const resolved = resolveRouteFromPath(window.location.pathname, true);
        setActiveView(resolved.view === 'landing' ? 'home' : resolved.view);
        setSelectedPublicProfileId(resolved.publicProfileId);
        setSelectedPostDetailId(resolved.postDetailId);
      })
      .catch(() => {
        // No active HttpOnly cookie session; stay unauthenticated
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUnreadNotifications = useCallback(() => {
    if (!authToken) return;
    fetchUnreadNotificationCount(authToken)
      .then((count) => setUnreadNotificationCount(count))
      .catch(() => undefined);
  }, [authToken]);

  useEffect(() => {
    if (!authToken || !user) {
      setUnreadNotificationCount(0);
      return;
    }
    refreshUnreadNotifications();
    const timer = window.setInterval(refreshUnreadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [authToken, user, refreshUnreadNotifications]);

  const refreshUserStats = useCallback(() => {
    if (!authToken) return;
    fetchCurrentUser(authToken)
      .then((freshUser) => setUser(freshUser))
      .catch(() => undefined);
  }, [authToken]);

  // Load selected public profile when viewing another member's profile
  useEffect(() => {
    if (activeView !== 'public-profile' || !selectedPublicProfileId || !authToken) {
      return;
    }

    let cancelled = false;
    setPublicProfileLoading(true);
    setPublicProfileError('');
    setPublicProfile(null);

    loadPublicProfileById(authToken, selectedPublicProfileId)
      .then((profile) => {
        if (!cancelled) {
          setPublicProfile(profile);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPublicProfileError(
            err instanceof Error ? err.message : 'Unable to load this profile.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPublicProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeView, selectedPublicProfileId, authToken]);

  // Support browser back/forward navigation cleanly
  useEffect(() => {
    function handlePopState() {
      const resolved = resolveRouteFromPath(window.location.pathname, Boolean(user));
      setActiveView(resolved.view);
      setSelectedPublicProfileId(resolved.publicProfileId);
      setSelectedPostDetailId(resolved.postDetailId);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  function navigateTo(
    view: AppView,
    options?: {
      publicProfileId?: string;
      postDetailId?: string;
      enquiriesTab?: 'received' | 'sent';
    }
  ) {
    const isAuthenticatedRoute =
      view === 'home' ||
      view === 'explore' ||
      view === 'create-post' ||
      view === 'enquiries' ||
      view === 'profile' ||
      view === 'public-profile' ||
      view === 'post-detail' ||
      view === 'notifications' ||
      view === 'settings';

    let nextView = view;
    if (isAuthenticatedRoute && !user) {
      nextView = 'login';
    } else if (user && (view === 'landing' || view === 'login' || view === 'register')) {
      nextView = 'home';
    }

    if (nextView === 'home' && view !== 'home') {
      setFeedCategoryFilter(null);
    }

    if (nextView === 'enquiries') {
      setEnquiriesInitialTab(options?.enquiriesTab);
    }

    const nextPublicId =
      nextView === 'public-profile' ? options?.publicProfileId ?? null : null;
    const nextPostId = nextView === 'post-detail' ? options?.postDetailId ?? null : null;

    setActiveView(nextView);
    setSelectedPublicProfileId(nextPublicId);
    setSelectedPostDetailId(nextPostId);

    const nextPath = pathForRoute(nextView, nextPublicId, nextPostId);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(
        { view: nextView, publicProfileId: nextPublicId, postDetailId: nextPostId },
        '',
        nextPath
      );
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenProfile(profileId: string) {
    if (user && profileId === user.id) {
      navigateTo('profile');
      return;
    }
    navigateTo('public-profile', { publicProfileId: profileId });
  }

  function handleAuthSuccess(response: AuthResponse) {
    setAuthToken(response.token);
    setUser(response.user);
    setFeedCategoryFilter(null);
    setActiveView('home');
    window.history.pushState({ view: 'home' }, '', '/home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearClientSessionState() {
    setAuthToken(null);
    setUser(null);
    setUnreadNotificationCount(0);
    setSelectedPublicProfileId(null);
    setSelectedPostDetailId(null);
    setPublicProfile(null);
    setFeedCategoryFilter(null);
    setActiveView('landing');
    window.history.pushState({ view: 'landing' }, '', '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleLogout() {
    await Promise.all([logoutAccount(authToken), logoutGoogle()]);
    clearClientSessionState();
  }

  const viewerLocationDisplay = user
    ? [user.suburb, user.city, user.province].filter(Boolean).join(', ')
    : '';

  const transitionKey =
    activeView === 'public-profile'
      ? `public-profile-${selectedPublicProfileId}`
      : activeView === 'post-detail'
        ? `post-detail-${selectedPostDetailId}`
        : activeView;

  return (
    <div className="relative min-h-screen text-[#0F172A]">
      <LiquidBackground />
      <Navbar
        activeView={activeView}
        user={user}
        unreadNotificationCount={unreadNotificationCount}
        onNavigate={(view) => navigateTo(view)}
        onLogout={handleLogout}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={transitionKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {activeView === 'landing' && <LandingPage onNavigate={(v) => navigateTo(v)} />}

          {activeView === 'register' && (
            <RegisterPage
              allSkills={allSkills}
              onNavigate={(v) => navigateTo(v)}
              onAuthSuccess={handleAuthSuccess}
            />
          )}

          {activeView === 'login' && (
            <LoginPage onNavigate={(v) => navigateTo(v)} onAuthSuccess={handleAuthSuccess} />
          )}

          {activeView === 'home' && user && authToken && (
            <HomeFeedPage
              user={user}
              authToken={authToken}
              categories={categories}
              initialCategoryFilter={feedCategoryFilter}
              onNavigate={(v) => navigateTo(v)}
              onOpenProfile={handleOpenProfile}
              onRefreshUserStats={refreshUserStats}
            />
          )}

          {activeView === 'explore' && user && authToken && (
            <ExplorePage
              user={user}
              authToken={authToken}
              allSkills={allSkills}
              categories={categories}
              onOpenProfile={handleOpenProfile}
              onJumpToFeedCategory={(categoryId) => {
                setFeedCategoryFilter(categoryId);
                navigateTo('home');
              }}
              onRefreshUserStats={refreshUserStats}
            />
          )}

          {activeView === 'create-post' && user && authToken && (
            <CreatePostPage
              user={user}
              authToken={authToken}
              categories={categories}
              onPostCreated={() => {
                setFeedCategoryFilter(null);
                refreshUserStats();
                navigateTo('home');
              }}
              onCancel={() => navigateTo('home')}
            />
          )}

          {activeView === 'enquiries' && user && authToken && (
            <EnquiriesPage
              authToken={authToken}
              initialTab={enquiriesInitialTab}
              onOpenProfile={handleOpenProfile}
              onExploreProviders={() => navigateTo('explore')}
              onEnquiryUpdated={refreshUnreadNotifications}
            />
          )}

          {activeView === 'profile' && user && authToken && (
            <ProfileView
              profile={user}
              isOwner={true}
              authToken={authToken}
              allSkills={allSkills}
              categories={categories}
              viewerLocationDisplay={viewerLocationDisplay}
              onProfileUpdated={setUser}
              onOpenProfile={handleOpenProfile}
              onNavigateToCreatePost={() => navigateTo('create-post')}
              onNavigateToEnquiries={() => navigateTo('enquiries', { enquiriesTab: 'sent' })}
              onRefreshUserStats={refreshUserStats}
            />
          )}

          {activeView === 'public-profile' && user && authToken && (
            <>
              {publicProfileLoading && (
                <main className="mx-auto max-w-4xl px-4 pb-20 pt-12">
                  <div className="glass-panel rounded-3xl p-10 text-center text-sm text-slate-600">
                    Loading profile...
                  </div>
                </main>
              )}

              {!publicProfileLoading && publicProfileError && (
                <main className="mx-auto max-w-4xl px-4 pb-20 pt-12">
                  <div className="glass-panel rounded-3xl p-8 text-center space-y-4">
                    <p role="alert" className="text-sm font-medium text-red-700">
                      {publicProfileError}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateTo('explore')}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
                    >
                      Back to Explore
                    </button>
                  </div>
                </main>
              )}

              {!publicProfileLoading && !publicProfileError && publicProfile && (
                <ProfileView
                  profile={publicProfile}
                  isOwner={publicProfile.id === user.id}
                  authToken={authToken}
                  allSkills={allSkills}
                  categories={categories}
                  viewerLocationDisplay={viewerLocationDisplay}
                  onProfileUpdated={setUser}
                  onOpenProfile={handleOpenProfile}
                  onNavigateToEnquiries={() => navigateTo('enquiries', { enquiriesTab: 'sent' })}
                  onRefreshUserStats={refreshUserStats}
                  onBack={() => navigateTo('explore')}
                  backLabel="Back to Explore"
                />
              )}
            </>
          )}

          {activeView === 'post-detail' && user && authToken && selectedPostDetailId && (
            <SinglePostPage
              postId={selectedPostDetailId}
              authToken={authToken}
              categories={categories}
              onOpenProfile={handleOpenProfile}
              onBack={() => navigateTo('notifications')}
              onRefreshUserStats={refreshUserStats}
            />
          )}

          {activeView === 'notifications' && user && authToken && (
            <NotificationsPage
              authToken={authToken}
              onUnreadCountChange={setUnreadNotificationCount}
              onOpenPost={(postId) => navigateTo('post-detail', { postDetailId: postId })}
              onOpenEnquiries={(tab) => navigateTo('enquiries', { enquiriesTab: tab })}
              onOpenProfile={handleOpenProfile}
            />
          )}

          {activeView === 'settings' && user && authToken && (
            <AccountSettingsView
              user={user}
              authToken={authToken}
              onNavigate={(v) => navigateTo(v)}
              onUserUpdated={setUser}
              onLogout={handleLogout}
              onAccountDeleted={clearClientSessionState}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
