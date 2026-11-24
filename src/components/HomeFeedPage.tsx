import { Compass, MapPin, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchFeedPosts } from '../services/postApi';
import type {
  AppView,
  CategoryItem,
  FeedScope,
  FeedSort,
  PostItem,
  UserProfile,
} from '../types/auth';
import { PostCard } from './PostCard';
import { ProfileAvatar } from './ProfileAvatar';

interface HomeFeedPageProps {
  user: UserProfile;
  authToken: string;
  categories: CategoryItem[];
  initialCategoryFilter?: number | null;
  onNavigate: (view: AppView) => void;
  onOpenProfile: (userId: string) => void;
  onRefreshUserStats: () => void;
}

const SCOPE_OPTIONS: Array<{ value: FeedScope; label: string }> = [
  { value: 'near', label: 'Near My Location' },
  { value: 'city', label: 'My City' },
  { value: 'kzn', label: 'All of KwaZulu-Natal' },
  { value: 'everywhere', label: 'Everywhere' },
];

export function HomeFeedPage({
  user,
  authToken,
  categories,
  initialCategoryFilter = null,
  onNavigate,
  onOpenProfile,
  onRefreshUserStats,
}: HomeFeedPageProps) {
  const [scope, setScope] = useState<FeedScope>('near');
  const [sort, setSort] = useState<FeedSort>('recent');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    initialCategoryFilter
  );

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialCategoryFilter !== undefined && initialCategoryFilter !== null) {
      setSelectedCategoryId(initialCategoryFilter);
    }
  }, [initialCategoryFilter]);

  const loadFeed = useCallback(
    async (offset = 0, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const result = await fetchFeedPosts(authToken, {
          scope,
          sort,
          categoryId: selectedCategoryId ?? undefined,
          limit: 12,
          offset,
        });

        setPosts((prev) => (append ? [...prev, ...result.posts] : result.posts));
        setTotalCount(result.totalCount);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load your LocalPro feed.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [authToken, scope, sort, selectedCategoryId]
  );

  useEffect(() => {
    void loadFeed(0, false);
  }, [loadFeed]);

  function handlePostUpdated(updatedPost: PostItem) {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    onRefreshUserStats();
  }

  function handlePostDeleted(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setTotalCount((prev) => Math.max(0, prev - 1));
    onRefreshUserStats();
  }

  const userLocationLabel = [user.suburb, user.city, user.province].filter(Boolean).join(', ');

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-7 sm:px-8 sm:pt-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Main Center Feed Column */}
        <div className="space-y-6 lg:col-span-8">
          {/* Top Feed Header & Prominent Create Post CTA */}
          <section className="glass-panel rounded-3xl p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0D9488]">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{userLocationLabel}</span>
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                  Local Work &amp; Services Feed
                </h1>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('create-post')}
                className="btn-royal inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Create Post</span>
              </button>
            </div>

            {/* Location Scope Tabs */}
            <div className="mt-5 space-y-3 border-t border-slate-200/80 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label="Location filter"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {SCOPE_OPTIONS.map((option) => {
                    const active = scope === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setScope(option.value)}
                        aria-pressed={active}
                        className={`min-h-[38px] whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                          active
                            ? 'bg-[#0B1F3A] text-white shadow-xs'
                            : 'border border-slate-200/90 bg-white/80 text-slate-700 hover:bg-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {/* Sort Toggle */}
                <div className="flex items-center gap-1.5">
                  <label htmlFor="feed-sort" className="text-xs font-medium text-slate-500">
                    Sort:
                  </label>
                  <select
                    id="feed-sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as FeedSort)}
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] focus:border-[#1D4ED8] focus:outline-none"
                  >
                    <option value="recent">Most Recent</option>
                    <option value="liked">Most Liked</option>
                  </select>
                </div>
              </div>

              {/* Category Filter Strip */}
              <div
                role="group"
                aria-label="Category filter"
                className="flex flex-wrap items-center gap-1.5 pt-1"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  aria-pressed={selectedCategoryId === null}
                  className={`min-h-[36px] whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    selectedCategoryId === null
                      ? 'bg-[#1D4ED8] text-white'
                      : 'border border-slate-200/80 bg-white/75 text-slate-600 hover:bg-white hover:text-[#0B1F3A]'
                  }`}
                >
                  All Categories
                </button>
                {categories.map((cat) => {
                  const active = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      aria-pressed={active}
                      className={`min-h-[36px] whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-[#1D4ED8] text-white'
                          : 'border border-slate-200/80 bg-white/75 text-slate-600 hover:bg-white hover:text-[#0B1F3A]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Feed Stream */}
          {loading ? (
            <div className="glass-panel rounded-3xl p-10 text-center text-sm text-slate-600">
              Loading posts near {user.city}...
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50/90 p-5 text-sm font-medium text-red-800"
            >
              {error}
            </div>
          ) : posts.length === 0 ? (
            <div className="glass-panel rounded-3xl p-8 text-center sm:p-10">
              <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                No posts match this view yet
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                {scope === 'city'
                  ? `No posts found in ${user.city} for this filter yet. Try switching to Near My Location or All of KwaZulu-Natal, or share your own completed work.`
                  : 'Be the first in your community to publish completed work or switch filters to explore nearby areas.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('create-post')}
                  className="btn-royal inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Create First Post</span>
                </button>
                {(scope !== 'everywhere' || selectedCategoryId !== null) && (
                  <button
                    type="button"
                    onClick={() => {
                      setScope('everywhere');
                      setSelectedCategoryId(null);
                    }}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
                  >
                    Show All Locations &amp; Categories
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between px-1 text-xs font-medium text-slate-500">
                <span className="tabular-nums">
                  Showing {posts.length} of {totalCount} {totalCount === 1 ? 'post' : 'posts'}
                </span>
                <span>
                  {scope === 'near'
                    ? `Prioritising ${user.city} and nearby areas`
                    : scope === 'city'
                      ? `Filtered to ${user.city}`
                      : scope === 'kzn'
                        ? 'Filtered to KwaZulu-Natal'
                        : 'All South African locations'}
                </span>
              </div>

              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  authToken={authToken}
                  categories={categories}
                  onOpenProfile={onOpenProfile}
                  onPostUpdated={handlePostUpdated}
                  onPostDeleted={handlePostDeleted}
                />
              ))}

              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void loadFeed(posts.length, true)}
                    disabled={loadingMore}
                    className="glass-subtle min-h-[44px] rounded-xl px-6 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white disabled:opacity-60"
                  >
                    {loadingMore ? 'Loading more...' : 'Load More Posts'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Profile Summary, Search Shortcut & Quick Navigation */}
        <aside className="space-y-5 lg:col-span-4">
          <div className="glass-panel rounded-3xl p-6 space-y-5 lg:sticky lg:top-24">
            <div className="flex items-center gap-3.5">
              <ProfileAvatar src={user.avatarUrl} fullName={user.fullName} size="md" />
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-bold text-[#0B1F3A]">
                  {user.fullName}
                </h2>
                <p className="truncate text-xs text-slate-500">
                  {user.city}, {user.province}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-y border-slate-200/80 py-3.5 text-center">
              <div>
                <p className="font-display text-lg font-bold text-[#0B1F3A] tabular-nums">
                  {user.stats.totalPosts}
                </p>
                <p className="text-[11px] text-slate-500">Posts</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-[#0B1F3A] tabular-nums">
                  {user.stats.totalLikes}
                </p>
                <p className="text-[11px] text-slate-500">Likes</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-[#0B1F3A] tabular-nums">
                  {user.skills.length + user.customSkills.length}
                </p>
                <p className="text-[11px] text-slate-500">Skills</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => onNavigate('explore')}
                className="glass-subtle flex min-h-[44px] w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white"
              >
                <span className="inline-flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                  <span>Search Providers &amp; Skills</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="glass-subtle flex min-h-[44px] w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white"
              >
                <span className="inline-flex items-center gap-2">
                  <Compass className="h-4 w-4 text-[#0D9488]" aria-hidden="true" />
                  <span>View My Profile</span>
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
