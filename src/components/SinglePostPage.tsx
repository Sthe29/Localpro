import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchPostById } from '../services/postApi';
import type { CategoryItem, PostItem } from '../types/auth';
import { PostCard } from './PostCard';

interface SinglePostPageProps {
  postId: string;
  authToken: string;
  categories: CategoryItem[];
  onOpenProfile: (profileId: string) => void;
  onBack: () => void;
  onRefreshUserStats: () => void;
}

export function SinglePostPage({
  postId,
  authToken,
  categories,
  onOpenProfile,
  onBack,
  onRefreshUserStats,
}: SinglePostPageProps) {
  const [post, setPost] = useState<PostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPost = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loaded = await fetchPostById(authToken, postId);
      setPost(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this post.');
    } finally {
      setLoading(false);
    }
  }, [authToken, postId]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-[#0B1F3A]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back</span>
      </button>

      {loading ? (
        <div className="glass-panel rounded-3xl p-10 text-center text-sm text-slate-600">
          Loading post...
        </div>
      ) : error || !post ? (
        <div className="glass-panel rounded-3xl p-8 text-center space-y-4">
          <p role="alert" className="text-sm font-medium text-red-700">
            {error || 'This post is no longer available.'}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
          >
            Return
          </button>
        </div>
      ) : (
        <PostCard
          post={post}
          authToken={authToken}
          categories={categories}
          onOpenProfile={onOpenProfile}
          onPostUpdated={(updated) => {
            setPost(updated);
            onRefreshUserStats();
          }}
          onPostDeleted={() => {
            onRefreshUserStats();
            onBack();
          }}
        />
      )}
    </main>
  );
}
