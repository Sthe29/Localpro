import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Heart,
  ImageOff,
  MapPin,
  MessageCircle,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { PROVINCE_LIST, SOUTH_AFRICA_LOCATIONS } from '../data/locations';
import {
  fetchDiscoverOverview,
  fetchFeedPosts,
  searchExploreProfiles,
  togglePostLikeRequest,
} from '../services/postApi';
import type {
  CategoryItem,
  DiscoverData,
  PostItem,
  PublicProfile,
  SkillItem,
  UserProfile,
} from '../types/auth';
import { PostCard } from './PostCard';
import { ProfileAvatar } from './ProfileAvatar';

interface ExplorePageProps {
  user: UserProfile;
  authToken: string;
  allSkills: SkillItem[];
  categories: CategoryItem[];
  onOpenProfile: (profileId: string) => void;
  onJumpToFeedCategory: (categoryId: number) => void;
  onRefreshUserStats: () => void;
}

const SKILL_CATEGORIES = [
  'Beauty',
  'Construction and Home Services',
  'Technology',
  'Automotive',
  'Education',
  'Creative Services',
  'Other',
];

const KZN_DISCOVERY_CITIES = [
  'Durban',
  'Umhlanga',
  'Pinetown',
  'Pietermaritzburg',
  'Ballito',
  'Richards Bay',
];

function formatPostDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ProviderResultCard({
  provider,
  onOpenProfile,
}: {
  provider: PublicProfile;
  onOpenProfile: (id: string) => void;
}) {
  const locationText = [provider.suburb, provider.city, provider.province]
    .filter(Boolean)
    .join(', ');
  const skillNames = [...provider.skills.map((s) => s.name), ...provider.customSkills];

  return (
    <article className="glass-subtle flex flex-col justify-between gap-4 rounded-2xl p-5 transition-colors hover:bg-white/95">
      <div className="space-y-3">
        <div className="flex items-start gap-3.5">
          <button
            type="button"
            onClick={() => onOpenProfile(provider.id)}
            aria-label={`Open ${provider.fullName}'s profile`}
            className="shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <ProfileAvatar src={provider.avatarUrl} fullName={provider.fullName} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenProfile(provider.id)}
              className="block max-w-full truncate text-left font-display text-base font-bold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
            >
              {provider.fullName}
            </button>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0D9488]" aria-hidden="true" />
              <span className="truncate">{locationText}</span>
            </p>
          </div>
        </div>

        <p className="text-xs font-medium text-[#0D9488]">
          {skillNames.length > 0 ? skillNames.join(' · ') : 'Community Member'}
        </p>

        {provider.bio ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{provider.bio}</p>
        ) : provider.skillDescription ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
            {provider.skillDescription}
          </p>
        ) : null}

        {provider.stats.totalPosts > 0 && (
          <p className="text-[11px] font-medium text-slate-500 tabular-nums">
            {provider.stats.totalPosts} {provider.stats.totalPosts === 1 ? 'post' : 'posts'} ·{' '}
            {provider.stats.totalLikes} {provider.stats.totalLikes === 1 ? 'like' : 'likes'}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpenProfile(provider.id)}
        className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0B1F3A] transition-colors hover:border-[#93C5FD] hover:bg-[#EFF6FF]"
      >
        <span>View Profile</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </article>
  );
}

function ExplorePostCard({
  post,
  onOpenPostDetails,
  onOpenProfile,
  onToggleLike,
  isLiking,
}: {
  post: PostItem;
  onOpenPostDetails: (post: PostItem, expandComments: boolean) => void;
  onOpenProfile: (userId: string) => void;
  onToggleLike: (post: PostItem) => void;
  isLiking: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const locationText = [post.suburb, post.city, post.province].filter(Boolean).join(', ');
  const primaryImage = post.images[0] ?? null;

  return (
    <article className="glass-panel flex flex-col justify-between overflow-hidden rounded-3xl transition-transform duration-200 hover:-translate-y-0.5">
      <div>
        {/* Media Preview */}
        {primaryImage && !imageFailed ? (
          <button
            type="button"
            onClick={() => onOpenPostDetails(post, false)}
            className="group relative block aspect-[16/10] w-full overflow-hidden bg-slate-100 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <img
              src={primaryImage}
              alt={`${post.categoryName} work shared by ${post.authorName}`}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#07152B]/65 via-[#07152B]/20 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2 text-xs font-medium text-white">
              <span className="truncate">{post.categoryName}</span>
              {post.images.length > 1 && (
                <span className="shrink-0 tabular-nums">
                  {post.images.length} photos
                </span>
              )}
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenPostDetails(post, false)}
            className="group flex aspect-[16/10] w-full flex-col justify-between bg-gradient-to-br from-[#EFF6FF] via-[#F8FBFF] to-[#E0F2FE] p-6 text-left transition-colors hover:from-[#E0EEFF] hover:to-[#DBEAFE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#0D9488]">
              <span>{post.categoryName}</span>
              {imageFailed ? (
                <ImageOff className="h-4 w-4 text-slate-400" aria-hidden="true" />
              ) : (
                <Wrench className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
              )}
            </div>
            <p className="line-clamp-3 font-display text-base font-bold leading-snug text-[#0B1F3A]">
              {post.description}
            </p>
            <span className="text-xs font-semibold text-[#1D4ED8] group-hover:underline">
              Open post details
            </span>
          </button>
        )}

        {/* Card Body */}
        <div className="space-y-3 p-5 sm:p-6">
          {/* Author + Location */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => onOpenProfile(post.authorId)}
                aria-label={`Visit ${post.authorName}'s profile`}
                className="shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <ProfileAvatar
                  src={post.authorAvatarUrl}
                  fullName={post.authorName}
                  size="sm"
                />
              </button>

              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenProfile(post.authorId)}
                  className="block max-w-full truncate text-left font-display text-sm font-bold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
                >
                  {post.authorName}
                </button>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0 text-[#0D9488]" aria-hidden="true" />
                  <span className="truncate">{locationText}</span>
                </p>
              </div>
            </div>

            <span className="shrink-0 text-[11px] font-medium text-slate-500">
              {formatPostDate(post.createdAt)}
            </span>
          </div>

          {/* Unboxed Category & Price Metadata */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#0D9488]">
            <span>{post.categoryName}</span>
            {post.priceText && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-[#0B1F3A]">{post.priceText}</span>
              </>
            )}
          </div>

          {/* Description */}
          <p className="line-clamp-3 text-sm leading-relaxed text-slate-700">
            {post.description}
          </p>
        </div>
      </div>

      {/* Interactive Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleLike(post)}
            disabled={isLiking}
            aria-pressed={post.likedByMe}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
              post.likedByMe
                ? 'border-[#1D4ED8]/40 bg-[#EFF6FF] text-[#1D4ED8]'
                : 'border-slate-200/90 bg-white/85 text-slate-700 hover:border-[#93C5FD] hover:bg-white'
            }`}
          >
            <Heart
              className={`h-3.5 w-3.5 ${post.likedByMe ? 'fill-[#1D4ED8] text-[#1D4ED8]' : ''}`}
              aria-hidden="true"
            />
            <span className="tabular-nums">{post.likeCount}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPostDetails(post, true)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">{post.commentCount}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenProfile(post.authorId)}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200/90 bg-white/85 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] transition-colors hover:border-[#93C5FD] hover:bg-white"
          >
            <User className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPostDetails(post, false)}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
          >
            <span>View Details</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function ExplorePage({
  user,
  authToken,
  allSkills,
  categories,
  onOpenProfile,
  onJumpToFeedCategory,
  onRefreshUserStats,
}: ExplorePageProps) {
  // Mode toggle: Default Explore Landing (Latest Content) vs Dedicated Search & Discovery Interface
  const [searchMode, setSearchMode] = useState(false);

  // Recent Community Posts Feed (Main Explore Landing View)
  const [recentPosts, setRecentPosts] = useState<PostItem[]>([]);
  const [recentTotalCount, setRecentTotalCount] = useState(0);
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentLoadingMore, setRecentLoadingMore] = useState(false);
  const [recentError, setRecentError] = useState('');
  const [likingPostIds, setLikingPostIds] = useState<Record<string, boolean>>({});

  // Post Detail Modal
  const [selectedPostModal, setSelectedPostModal] = useState<{
    post: PostItem;
    expandComments: boolean;
  } | null>(null);

  // Bottom Discovery Sections Data (Genuine Database Records)
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [highlightPosts, setHighlightPosts] = useState<PostItem[]>([]);
  const [directoryProviders, setDirectoryProviders] = useState<PublicProfile[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  // Dedicated Search & Combinable Filters State
  const [query, setQuery] = useState('');
  const [locationPreset, setLocationPreset] = useState<
    'all' | 'my-city' | 'my-province' | 'kzn' | 'custom'
  >('all');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [suburb, setSuburb] = useState('');
  const [category, setCategory] = useState('');
  const [specificSkill, setSpecificSkill] = useState('');

  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const citySuggestions = province ? SOUTH_AFRICA_LOCATIONS[province] ?? [] : [];
  const skillSuggestions = category
    ? allSkills.filter((s) => s.category === category).map((s) => s.name)
    : allSkills.map((s) => s.name);

  // Load recent posts immediately when user opens Explore tab (newest first)
  const loadRecentPosts = useCallback(
    async (offset = 0, append = false) => {
      if (append) {
        setRecentLoadingMore(true);
      } else {
        setRecentLoading(true);
      }
      setRecentError('');
      try {
        const result = await fetchFeedPosts(authToken, {
          scope: 'everywhere',
          sort: 'recent',
          limit: 12,
          offset,
        });
        setRecentPosts((prev) => (append ? [...prev, ...result.posts] : result.posts));
        setRecentTotalCount(result.totalCount);
        setRecentHasMore(result.hasMore);
      } catch (err) {
        setRecentError(
          err instanceof Error ? err.message : 'Unable to load recently uploaded content.'
        );
      } finally {
        setRecentLoading(false);
        setRecentLoadingMore(false);
      }
    },
    [authToken]
  );

  useEffect(() => {
    void loadRecentPosts(0, false);
  }, [loadRecentPosts]);

  // Load bottom discovery data (Nearby Talent, Community Highlights, Popular Skills, Discover More)
  useEffect(() => {
    let cancelled = false;
    setDiscoverLoading(true);
    Promise.all([
      fetchDiscoverOverview(authToken),
      fetchFeedPosts(authToken, {
        scope: 'everywhere',
        sort: 'liked',
        limit: 4,
        offset: 0,
      }),
      searchExploreProfiles(authToken, {}),
    ])
      .then(([overview, likedFeed, profiles]) => {
        if (!cancelled) {
          setDiscover(overview);
          setHighlightPosts(likedFeed.posts);
          setDirectoryProviders(profiles);
        }
      })
      .catch((err) => {
        console.error('Failed to load explore discovery sections:', err);
      })
      .finally(() => {
        if (!cancelled) setDiscoverLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  // Close Post Detail Modal on Escape key
  useEffect(() => {
    if (!selectedPostModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedPostModal(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPostModal]);

  // Execute search when Search & Discovery interface is open or filters change
  const runSearch = useCallback(async () => {
    setSearchLoading(true);
    setSearchError('');
    try {
      const profiles = await searchExploreProfiles(authToken, {
        q: query.trim() || undefined,
        province: province || undefined,
        city: city.trim() || undefined,
        suburb: suburb.trim() || undefined,
        category: category || undefined,
        skill: specificSkill.trim() || undefined,
      });
      setSearchResults(profiles);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Unable to search LocalPro profiles.');
    } finally {
      setSearchLoading(false);
    }
  }, [authToken, query, province, city, suburb, category, specificSkill]);

  useEffect(() => {
    if (searchMode) {
      void runSearch();
    }
  }, [searchMode, runSearch]);

  // Compute real Popular Skills from registered providers + category activity
  const popularSkills = useMemo(() => {
    const counts = new Map<string, { name: string; category: string; providerCount: number }>();

    for (const provider of directoryProviders) {
      for (const sk of provider.skills) {
        const key = sk.name.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.providerCount += 1;
        } else {
          counts.set(key, { name: sk.name, category: sk.category, providerCount: 1 });
        }
      }
      for (const custom of provider.customSkills) {
        const key = custom.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.providerCount += 1;
        } else {
          counts.set(key, { name: custom, category: 'Other', providerCount: 1 });
        }
      }
    }

    // Include logged-in user's own skills in platform popularity counts if they offer skills
    if (user.hasSkills) {
      for (const sk of user.skills) {
        const key = sk.name.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.providerCount += 1;
        } else {
          counts.set(key, { name: sk.name, category: sk.category, providerCount: 1 });
        }
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.providerCount - a.providerCount || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [directoryProviders, user]);

  function openSearchWithPreset(overrides?: {
    q?: string;
    province?: string;
    city?: string;
    suburb?: string;
    category?: string;
    skill?: string;
    preset?: 'all' | 'my-city' | 'my-province' | 'kzn' | 'custom';
  }) {
    if (overrides) {
      setQuery(overrides.q ?? '');
      setProvince(overrides.province ?? '');
      setCity(overrides.city ?? '');
      setSuburb(overrides.suburb ?? '');
      setCategory(overrides.category ?? '');
      setSpecificSkill(overrides.skill ?? '');
      setLocationPreset(overrides.preset ?? 'custom');
    }
    setSearchMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLocationPresetChange(
    nextPreset: 'all' | 'my-city' | 'my-province' | 'kzn' | 'custom'
  ) {
    setLocationPreset(nextPreset);
    if (nextPreset === 'all') {
      setProvince('');
      setCity('');
      setSuburb('');
    } else if (nextPreset === 'my-city') {
      setProvince(user.province);
      setCity(user.city);
      setSuburb('');
    } else if (nextPreset === 'my-province') {
      setProvince(user.province);
      setCity('');
      setSuburb('');
    } else if (nextPreset === 'kzn') {
      setProvince('KwaZulu-Natal');
      setCity('');
      setSuburb('');
    }
  }

  function handleResetFilters() {
    setQuery('');
    setLocationPreset('all');
    setProvince('');
    setCity('');
    setSuburb('');
    setCategory('');
    setSpecificSkill('');
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  function syncUpdatedPost(updated: PostItem) {
    setRecentPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setHighlightPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPostModal((prev) =>
      prev && prev.post.id === updated.id ? { ...prev, post: updated } : prev
    );
    onRefreshUserStats();
  }

  function syncDeletedPost(postId: string) {
    setRecentPosts((prev) => prev.filter((p) => p.id !== postId));
    setHighlightPosts((prev) => prev.filter((p) => p.id !== postId));
    setRecentTotalCount((prev) => Math.max(0, prev - 1));
    setSelectedPostModal((prev) => (prev && prev.post.id === postId ? null : prev));
    onRefreshUserStats();
  }

  async function handleQuickToggleLike(post: PostItem) {
    if (likingPostIds[post.id]) return;
    setLikingPostIds((prev) => ({ ...prev, [post.id]: true }));
    try {
      const result = await togglePostLikeRequest(authToken, post.id);
      syncUpdatedPost({
        ...post,
        likedByMe: result.liked,
        likeCount: result.likeCount,
      });
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : 'Unable to update like.');
    } finally {
      setLikingPostIds((prev) => ({ ...prev, [post.id]: false }));
    }
  }

  const userLocationLabel = [user.suburb, user.city, user.province].filter(Boolean).join(', ');
  const hasActiveFilters = Boolean(
    query.trim() || province || city.trim() || suburb.trim() || category || specificSkill.trim()
  );

  // =========================================================================
  // DEDICATED SEARCH & DISCOVERY INTERFACE (Opened via Explore & Search CTA)
  // =========================================================================
  if (searchMode) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8 sm:pt-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSearchMode(false)}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200/90 bg-white/85 px-4 py-2 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Explore Feed</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <section className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200/80 pb-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search &amp; Discovery</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
              Search People, Skills &amp; Locations
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Combine keywords and location or skill filters to find plumbers, nail technicians,
              hairdressers, tutors, mechanics, or creatives across South Africa.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="space-y-4">
            {/* Keyword Search Input */}
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try e.g. plumber in Durban, hairdresser in Pietermaritzburg, nail technician..."
                  aria-label="Search people, skills, services, cities, suburbs, or categories"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/95 pl-10 pr-4 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>
              <button
                type="submit"
                className="btn-royal min-h-[46px] whitespace-nowrap shrink-0 rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
              >
                Search
              </button>
            </div>

            {/* Combinable Filters Grid: Location, Province, City/Town, Suburb, Category, Specific Skill */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <label
                  htmlFor="exp-location-preset"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Location
                </label>
                <select
                  id="exp-location-preset"
                  value={locationPreset}
                  onChange={(e) =>
                    handleLocationPresetChange(
                      e.target.value as 'all' | 'my-city' | 'my-province' | 'kzn' | 'custom'
                    )
                  }
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="all">All locations</option>
                  <option value="my-city">My city ({user.city})</option>
                  <option value="my-province">My province ({user.province})</option>
                  <option value="kzn">All of KwaZulu-Natal</option>
                  {locationPreset === 'custom' && <option value="custom">Custom location</option>}
                </select>
              </div>

              <div>
                <label
                  htmlFor="exp-province"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Province
                </label>
                <select
                  id="exp-province"
                  value={province}
                  onChange={(e) => {
                    setProvince(e.target.value);
                    setCity('');
                    setLocationPreset(e.target.value ? 'custom' : 'all');
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="">All provinces</option>
                  {PROVINCE_LIST.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="exp-city" className="mb-1 block text-xs font-medium text-slate-600">
                  City or town
                </label>
                {citySuggestions.length > 0 ? (
                  <select
                    id="exp-city"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setLocationPreset('custom');
                    }}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                  >
                    <option value="">All cities</option>
                    {citySuggestions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="exp-city"
                    type="text"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setLocationPreset(e.target.value ? 'custom' : 'all');
                    }}
                    placeholder="Any city or town"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none"
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor="exp-suburb"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Suburb
                </label>
                <input
                  id="exp-suburb"
                  type="text"
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  placeholder="Any suburb"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="exp-category"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Service category
                </label>
                <select
                  id="exp-category"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSpecificSkill('');
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="">All categories</option>
                  {SKILL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="exp-skill"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Specific skill
                </label>
                <select
                  id="exp-skill"
                  value={specificSkill}
                  onChange={(e) => setSpecificSkill(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="">Any skill</option>
                  {skillSuggestions.map((sk) => (
                    <option key={sk} value={sk}>
                      {sk}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>

          {/* Search Results */}
          <div className="border-t border-slate-200/80 pt-5">
            <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-[#0B1F3A]">
                {hasActiveFilters ? 'Matching Providers & Community Members' : 'All Community Profiles'}
              </span>
              <span className="tabular-nums">
                {searchResults.length} {searchResults.length === 1 ? 'profile' : 'profiles'} found
              </span>
            </div>

            {searchLoading ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Searching LocalPro profiles...
              </div>
            ) : searchError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
              >
                {searchError}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center">
                <p className="font-display text-base font-semibold text-[#0B1F3A]">
                  {specificSkill
                    ? `No ${specificSkill.toLowerCase()}s found for these filters.`
                    : 'No matching profiles found for these filters.'}
                </p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
                  Try widening your suburb or city selection, or resetting your filters to browse all
                  providers.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((provider) => (
                  <ProviderResultCard
                    key={provider.id}
                    provider={provider}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  // =========================================================================
  // MAIN EXPLORE LANDING VIEW (Immediately Displays Recently Uploaded Content)
  // =========================================================================
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8 sm:pt-10 space-y-10">
      {/* Top Explore Header with Prominent Explore & Search Button */}
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
              <Compass className="h-4 w-4" aria-hidden="true" />
              <span>Explore LocalPro</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl text-balance">
              Discover Recent Work &amp; Local Talent
            </h1>
            <p className="text-sm text-slate-600">
              Showing the newest community uploads first · Your selected area:{' '}
              <span className="font-medium text-[#0B1F3A]">{userLocationLabel}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => openSearchWithPreset()}
            className="btn-royal inline-flex min-h-[46px] items-center justify-center gap-2.5 whitespace-nowrap shrink-0 rounded-xl px-6 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Explore &amp; Search</span>
          </button>
        </div>
      </section>

      {/* SECTION 1: Main Discovery Feed — Recently Uploaded Content (Newest First) */}
      <section aria-labelledby="explore-recent-heading" className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <div>
            <h2
              id="explore-recent-heading"
              className="font-display text-xl font-bold tracking-tight text-[#0B1F3A] sm:text-2xl"
            >
              Recently Uploaded Content
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Latest work shared by service providers and community members
            </p>
          </div>

          {!recentLoading && (
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              Showing {recentPosts.length} of {recentTotalCount}{' '}
              {recentTotalCount === 1 ? 'post' : 'posts'} · Newest first
            </span>
          )}
        </div>

        {recentLoading ? (
          <div className="glass-panel rounded-3xl p-10 text-center text-sm text-slate-600">
            Loading recently uploaded posts...
          </div>
        ) : recentError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50/90 p-5 text-sm font-medium text-red-800"
          >
            {recentError}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="glass-panel rounded-3xl p-10 text-center space-y-3">
            <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
              No posts uploaded yet
            </h3>
            <p className="mx-auto max-w-md text-sm text-slate-600">
              When service providers and community members publish work photos, they will appear
              here immediately.
            </p>
            <button
              type="button"
              onClick={() => openSearchWithPreset()}
              className="btn-royal inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search Providers</span>
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {recentPosts.map((post) => (
                <ExplorePostCard
                  key={post.id}
                  post={post}
                  isLiking={Boolean(likingPostIds[post.id])}
                  onOpenPostDetails={(selected, expandComments) =>
                    setSelectedPostModal({ post: selected, expandComments })
                  }
                  onOpenProfile={onOpenProfile}
                  onToggleLike={(target) => void handleQuickToggleLike(target)}
                />
              ))}
            </div>

            {recentHasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => void loadRecentPosts(recentPosts.length, true)}
                  disabled={recentLoadingMore}
                  className="glass-subtle min-h-[44px] rounded-xl px-6 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white disabled:opacity-60"
                >
                  {recentLoadingMore ? 'Loading more...' : 'Load More Recent Content'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* SECTION 2: Additional Discovery Sections BELOW Recent Content */}
      {!discoverLoading && discover && (
        <div className="space-y-8 border-t border-slate-200/75 pt-8">
          {/* A. Nearby Talent (Uses User's Selected Location, Not GPS) */}
          <section aria-labelledby="discover-nearby-heading" className="glass-panel rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#0D9488]">Nearby Talent</p>
                <h2
                  id="discover-nearby-heading"
                  className="mt-0.5 font-display text-xl font-bold text-[#0B1F3A]"
                >
                  Service Providers in {user.province}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Matched using your selected profile area ({user.city}, {user.province})
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  openSearchWithPreset({
                    province: user.province,
                    city: user.city,
                    preset: 'my-city',
                  })
                }
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                <span>Search in {user.city}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {discover.providersInArea.length === 0 ? (
              <p className="text-sm text-slate-600">
                No other service providers registered in {user.province} yet. Try searching across
                other provinces.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {discover.providersInArea.map((provider) => (
                  <ProviderResultCard
                    key={provider.id}
                    provider={provider}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>
            )}
          </section>

          {/* B. Community Highlights (Noteworthy Posts & Active Contributors) */}
          <section aria-labelledby="discover-highlights-heading" className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Community Highlights</span>
                </p>
                <h2
                  id="discover-highlights-heading"
                  className="mt-0.5 font-display text-xl font-bold text-[#0B1F3A]"
                >
                  Standout Work &amp; Active Contributors
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Highlighted Community Posts */}
              <div className="space-y-3 lg:col-span-7">
                <h3 className="text-xs font-semibold text-slate-500">
                  Most Appreciated Posts
                </h3>
                {highlightPosts.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    Community post highlights will appear as members share and engage with work.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {highlightPosts.map((post) => (
                      <article
                        key={post.id}
                        className="glass-subtle flex flex-col justify-between gap-3 rounded-2xl p-4 sm:flex-row sm:items-center"
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          {post.images[0] ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPostModal({ post, expandComments: false })
                              }
                              className="h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100"
                            >
                              <img
                                src={post.images[0]}
                                alt={`${post.categoryName} highlight`}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#1D4ED8]">
                              <Wrench className="h-5 w-5" aria-hidden="true" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#0D9488]">
                              {post.categoryName} · {post.city}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPostModal({ post, expandComments: false })
                              }
                              className="mt-0.5 line-clamp-2 text-left text-sm font-semibold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
                            >
                              {post.description}
                            </button>
                            <p className="mt-1 text-xs text-slate-500 tabular-nums">
                              By{' '}
                              <button
                                type="button"
                                onClick={() => onOpenProfile(post.authorId)}
                                className="font-semibold text-[#0B1F3A] hover:underline"
                              >
                                {post.authorName}
                              </button>{' '}
                              · {post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'} ·{' '}
                              {post.commentCount}{' '}
                              {post.commentCount === 1 ? 'comment' : 'comments'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedPostModal({ post, expandComments: false })}
                          className="shrink-0 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] hover:border-[#93C5FD] hover:bg-[#EFF6FF] sm:self-center"
                        >
                          Open Post
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {/* Recently Active Individuals */}
              <div className="space-y-3 lg:col-span-5">
                <h3 className="text-xs font-semibold text-slate-500">
                  Recently Active Talent
                </h3>
                {discover.recentlyActiveProviders.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No recently active providers to show yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {discover.recentlyActiveProviders.slice(0, 4).map((provider) => {
                      const primarySkill =
                        provider.skills[0]?.name ?? provider.customSkills[0] ?? 'Service Provider';
                      return (
                        <div
                          key={provider.id}
                          className="glass-subtle flex items-center justify-between gap-3 rounded-2xl p-3.5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <ProfileAvatar
                              src={provider.avatarUrl}
                              fullName={provider.fullName}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenProfile(provider.id)}
                                className="block max-w-full truncate text-left font-display text-sm font-bold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
                              >
                                {provider.fullName}
                              </button>
                              <p className="truncate text-xs text-slate-500">
                                {primarySkill} · {provider.city}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenProfile(provider.id)}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-[#EFF6FF]"
                          >
                            Profile
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* C. Popular Skills (Derived from Real Registered Skills & Category Posts) */}
          <section aria-labelledby="discover-skills-heading" className="glass-panel rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488]">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Popular Skills</span>
                </p>
                <h2
                  id="discover-skills-heading"
                  className="mt-0.5 font-display text-xl font-bold text-[#0B1F3A]"
                >
                  Skills &amp; Services Attracting Attention
                </h2>
              </div>

              <button
                type="button"
                onClick={() => openSearchWithPreset()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                <span>Browse all skills</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {popularSkills.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {popularSkills.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    onClick={() =>
                      openSearchWithPreset({
                        skill: skill.name,
                        category: skill.category === 'Other' ? '' : skill.category,
                        preset: 'all',
                      })
                    }
                    className="glass-subtle flex items-center justify-between gap-3 rounded-2xl p-4 text-left transition-colors hover:border-[#93C5FD] hover:bg-white"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold text-[#0B1F3A]">
                        {skill.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{skill.category}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-[#1D4ED8] tabular-nums">
                      {skill.providerCount}{' '}
                      {skill.providerCount === 1 ? 'provider' : 'providers'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Service Categories with Live Post Counts */}
            <div className="border-t border-slate-200/80 pt-5 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500">
                Service Categories by Post Activity
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {discover.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onJumpToFeedCategory(cat.id)}
                    className="glass-subtle flex items-center justify-between gap-3 rounded-2xl p-4 text-left transition-colors hover:border-[#93C5FD] hover:bg-white"
                  >
                    <span className="font-display text-sm font-semibold text-[#0B1F3A]">
                      {cat.name}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[#0D9488] tabular-nums">
                      {cat.postCount} {cat.postCount === 1 ? 'post' : 'posts'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* D. Discover More Across KwaZulu-Natal */}
          <section aria-labelledby="discover-more-heading" className="glass-panel rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-semibold text-[#0D9488]">Discover More</p>
                <h2
                  id="discover-more-heading"
                  className="mt-0.5 font-display text-xl font-bold text-[#0B1F3A]"
                >
                  Explore Talent Across KwaZulu-Natal
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Jump directly to skilled people in key KZN towns and cities or run a custom
                  multi-filter search.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  openSearchWithPreset({
                    province: 'KwaZulu-Natal',
                    preset: 'kzn',
                  })
                }
                className="btn-royal inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl px-5 py-2 text-sm font-semibold text-white"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Explore All of KZN</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {KZN_DISCOVERY_CITIES.map((kznCity) => (
                <button
                  key={kznCity}
                  type="button"
                  onClick={() =>
                    openSearchWithPreset({
                      province: 'KwaZulu-Natal',
                      city: kznCity,
                      preset: 'custom',
                    })
                  }
                  className="glass-subtle flex min-h-[44px] items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:border-[#93C5FD] hover:bg-white"
                >
                  <span className="truncate font-display text-sm font-semibold text-[#0B1F3A]">
                    {kznCity}
                  </span>
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0D9488]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Post Detail Modal (Opens When Tapping Any Post Preview, View Details, or Comment) */}
      {selectedPostModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Post details by ${selectedPostModal.post.authorName}`}
          onClick={() => setSelectedPostModal(null)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#07152B]/70 px-4 py-8 backdrop-blur-sm sm:py-12"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl space-y-3"
          >
            <div className="flex items-center justify-between rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg">
              <span className="font-display text-sm font-bold text-[#0B1F3A]">
                Post Details · {selectedPostModal.post.authorName}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPostModal(null)}
                aria-label="Close post details"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>

            <PostCard
              key={`${selectedPostModal.post.id}-${selectedPostModal.expandComments ? 'comments' : 'view'}`}
              post={selectedPostModal.post}
              authToken={authToken}
              categories={categories}
              initialCommentsOpen={selectedPostModal.expandComments}
              onOpenProfile={(profileId) => {
                setSelectedPostModal(null);
                onOpenProfile(profileId);
              }}
              onPostUpdated={syncUpdatedPost}
              onPostDeleted={syncDeletedPost}
            />
          </div>
        </div>
      )}
    </main>
  );
}
