import {
  Camera,
  Check,
  Edit3,
  Flag,
  Heart,
  ImageOff,
  MapPin,
  MessageCircle,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { PROVINCE_LIST, SOUTH_AFRICA_LOCATIONS } from '../data/locations';
import {
  createCommentRequest,
  deleteCommentRequest,
  deletePostRequest,
  fetchPostComments,
  togglePostLikeRequest,
  updateCommentRequest,
  updatePostRequest,
  uploadPostImage,
} from '../services/postApi';
import { submitReportRequest } from '../services/securityApi';
import type { CategoryItem, CommentItem, PostItem } from '../types/auth';
import { ProfileAvatar } from './ProfileAvatar';

interface PostCardProps {
  post: PostItem;
  authToken: string;
  categories: CategoryItem[];
  initialCommentsOpen?: boolean;
  onOpenProfile: (userId: string) => void;
  onPostUpdated: (updatedPost: PostItem) => void;
  onPostDeleted: (postId: string) => void;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function formatPostTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PostImage({
  src,
  alt,
  onClick,
  className = '',
}: {
  src: string;
  alt: string;
  onClick?: () => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-[#EFF6FF] p-6 text-slate-500 ${className}`}
      >
        <ImageOff className="h-6 w-6 text-[#1D4ED8]" aria-hidden="true" />
        <span className="text-xs font-medium">Image unavailable</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block w-full overflow-hidden bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${className}`}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
      />
    </button>
  );
}

export function PostCard({
  post,
  authToken,
  categories,
  initialCommentsOpen = false,
  onOpenProfile,
  onPostUpdated,
  onPostDeleted,
}: PostCardProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Like state
  const [isLiking, setIsLiking] = useState(false);

  // Comments state
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentFormError, setCommentFormError] = useState('');

  // Inline comment edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  // Inline post edit / delete state
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [actionError, setActionError] = useState('');

  // Report post state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or misleading content');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  // Edit post fields
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editDescription, setEditDescription] = useState(post.description);
  const [editCategoryId, setEditCategoryId] = useState(post.categoryId);
  const [editProvince, setEditProvince] = useState(
    PROVINCE_LIST.includes(post.province) ? post.province : 'KwaZulu-Natal'
  );
  const initialCities = SOUTH_AFRICA_LOCATIONS[post.province] ?? [];
  const cityIsPreset = initialCities.includes(post.city);
  const [editCityOption, setEditCityOption] = useState(cityIsPreset ? post.city : '__other__');
  const [editCustomCity, setEditCustomCity] = useState(cityIsPreset ? '' : post.city);
  const [editSuburb, setEditSuburb] = useState(post.suburb);
  const [editPriceText, setEditPriceText] = useState(post.priceText);
  const [editExistingImages, setEditExistingImages] = useState<string[]>(post.images);
  const [editNewFiles, setEditNewFiles] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [editError, setEditError] = useState('');
  const [isSavingPost, setIsSavingPost] = useState(false);

  useEffect(() => {
    return () => {
      for (const item of editNewFiles) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [editNewFiles]);

  useEffect(() => {
    if (!initialCommentsOpen || commentsLoaded) return;
    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError('');
    fetchPostComments(authToken, post.id)
      .then((fetched) => {
        if (!cancelled) {
          setComments(fetched);
          setCommentsLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCommentsError(err instanceof Error ? err.message : 'Unable to load comments.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCommentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialCommentsOpen, commentsLoaded, authToken, post.id]);

  const locationDisplay = [post.suburb, post.city, post.province].filter(Boolean).join(', ');
  const availableEditCities = SOUTH_AFRICA_LOCATIONS[editProvince] ?? [];
  const effectiveEditCity =
    editCityOption === '__other__' ? editCustomCity.trim() : editCityOption;

  function openEditMode() {
    setEditDescription(post.description);
    setEditCategoryId(post.categoryId);
    const prov = PROVINCE_LIST.includes(post.province) ? post.province : 'KwaZulu-Natal';
    setEditProvince(prov);
    const cities = SOUTH_AFRICA_LOCATIONS[prov] ?? [];
    const preset = cities.includes(post.city);
    setEditCityOption(preset ? post.city : '__other__');
    setEditCustomCity(preset ? '' : post.city);
    setEditSuburb(post.suburb);
    setEditPriceText(post.priceText);
    setEditExistingImages(post.images);
    for (const item of editNewFiles) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setEditNewFiles([]);
    setEditError('');
    setConfirmDeletePost(false);
    setIsEditingPost(true);
  }

  function handleAddEditImages(e: ChangeEvent<HTMLInputElement>) {
    setEditError('');
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const totalCount = editExistingImages.length + editNewFiles.length + files.length;
    if (totalCount > 6) {
      setEditError('You can include up to 6 images per post.');
      e.target.value = '';
      return;
    }

    const nextItems: Array<{ file: File; previewUrl: string }> = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setEditError('Only JPG, PNG, and WebP images are supported.');
        e.target.value = '';
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setEditError('Each image must be 5 MB or smaller.');
        e.target.value = '';
        return;
      }
      nextItems.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    setEditNewFiles((prev) => [...prev, ...nextItems]);
    e.target.value = '';
  }

  async function handleSavePostEdit(e: FormEvent) {
    e.preventDefault();
    setEditError('');

    const trimmedDesc = editDescription.trim();
    if (trimmedDesc.length < 5 || trimmedDesc.length > 1500) {
      setEditError('Post description must be between 5 and 1500 characters.');
      return;
    }
    if (!editProvince || !effectiveEditCity) {
      setEditError('Please specify the province and city/town.');
      return;
    }

    setIsSavingPost(true);
    try {
      const uploadedUrls: string[] = [];
      for (const item of editNewFiles) {
        const url = await uploadPostImage(authToken, item.file);
        uploadedUrls.push(url);
      }

      const updated = await updatePostRequest(authToken, post.id, {
        description: trimmedDesc,
        categoryId: editCategoryId,
        province: editProvince,
        city: effectiveEditCity,
        suburb: editSuburb.trim(),
        priceText: editPriceText.trim(),
        images: [...editExistingImages, ...uploadedUrls],
      });

      for (const item of editNewFiles) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setEditNewFiles([]);
      setIsEditingPost(false);
      onPostUpdated(updated);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save post changes.');
    } finally {
      setIsSavingPost(false);
    }
  }

  async function handleConfirmDeletePost() {
    setActionError('');
    setIsDeletingPost(true);
    try {
      await deletePostRequest(authToken, post.id);
      onPostDeleted(post.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete post.');
      setIsDeletingPost(false);
    }
  }

  async function handleToggleLike() {
    if (isLiking) return;
    setActionError('');
    setIsLiking(true);
    try {
      const result = await togglePostLikeRequest(authToken, post.id);
      onPostUpdated({
        ...post,
        likedByMe: result.liked,
        likeCount: result.likeCount,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update like.');
    } finally {
      setIsLiking(false);
    }
  }

  async function handleToggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen && !commentsLoaded) {
      setCommentsLoading(true);
      setCommentsError('');
      try {
        const fetched = await fetchPostComments(authToken, post.id);
        setComments(fetched);
        setCommentsLoaded(true);
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Unable to load comments.');
      } finally {
        setCommentsLoading(false);
      }
    }
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    setCommentFormError('');
    const trimmed = newCommentText.trim();
    if (!trimmed) {
      setCommentFormError('Please write a comment before posting.');
      return;
    }
    if (trimmed.length > 600) {
      setCommentFormError('Comment must be 600 characters or fewer.');
      return;
    }

    setIsPostingComment(true);
    try {
      const result = await createCommentRequest(authToken, post.id, trimmed);
      setComments((prev) => [...prev, result.comment]);
      setCommentsLoaded(true);
      setNewCommentText('');
      onPostUpdated({
        ...post,
        commentCount: result.commentCount,
      });
    } catch (err) {
      setCommentFormError(err instanceof Error ? err.message : 'Unable to add comment.');
    } finally {
      setIsPostingComment(false);
    }
  }

  async function handleSaveCommentEdit(commentId: string) {
    const trimmed = editingCommentText.trim();
    if (!trimmed) {
      setCommentsError('Comment cannot be empty.');
      return;
    }
    if (trimmed.length > 600) {
      setCommentsError('Comment must be 600 characters or fewer.');
      return;
    }

    setSavingCommentId(commentId);
    setCommentsError('');
    try {
      const updated = await updateCommentRequest(authToken, commentId, trimmed);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : 'Unable to update comment.');
    } finally {
      setSavingCommentId(null);
    }
  }

  async function handleDeleteComment(commentId: string) {
    setCommentsError('');
    try {
      const result = await deleteCommentRequest(authToken, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onPostUpdated({
        ...post,
        commentCount: result.commentCount,
      });
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : 'Unable to delete comment.');
    }
  }

  async function handleSubmitPostReport(e: FormEvent) {
    e.preventDefault();
    setReportError('');
    setReportSuccess('');
    setReportSubmitting(true);
    try {
      const res = await submitReportRequest(authToken, {
        targetType: 'post',
        targetId: post.id,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportOpen(false);
      setReportDetails('');
      setReportSuccess(res.message);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setReportSubmitting(false);
    }
  }

  return (
    <article className="glass-panel rounded-3xl p-5 sm:p-7">
      {/* Author Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => onOpenProfile(post.authorId)}
            aria-label={`View ${post.authorName} profile`}
            className="shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <ProfileAvatar src={post.authorAvatarUrl} fullName={post.authorName} size="md" />
          </button>

          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpenProfile(post.authorId)}
              className="truncate font-display text-base font-bold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
            >
              {post.authorName}
            </button>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0D9488]" aria-hidden="true" />
                <span>{locationDisplay}</span>
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>{formatPostTimestamp(post.createdAt)}</span>
              {post.updatedAt !== post.createdAt && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="text-slate-500">Edited</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Header Actions: View Profile + Author Edit/Delete */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenProfile(post.authorId)}
            className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-white/85 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] transition-colors hover:border-[#93C5FD] hover:bg-white"
          >
            <User className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
            <span>View Profile</span>
          </button>

          {!post.isAuthor && (
            <button
              type="button"
              onClick={() => {
                setReportError('');
                setReportOpen((prev) => !prev);
              }}
              aria-label="Report post"
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Report</span>
            </button>
          )}

          {post.isAuthor && !isEditingPost && (
            <>
              <button
                type="button"
                onClick={openEditMode}
                aria-label="Edit post"
                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-white"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeletePost((prev) => !prev)}
                aria-label="Delete post"
                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200/90 bg-white/85 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline Report Post Form */}
      {reportOpen && !post.isAuthor && (
        <form
          onSubmit={handleSubmitPostReport}
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#0B1F3A]">Report this post</span>
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="text-slate-500 hover:text-[#0B1F3A]"
            >
              Cancel
            </button>
          </div>
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            aria-label="Report reason"
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A]"
          >
            <option value="Spam or misleading content">Spam or misleading content</option>
            <option value="Scam or fraudulent service">Scam or fraudulent service</option>
            <option value="Harassment or abusive behaviour">Harassment or abusive behaviour</option>
            <option value="Inappropriate or unsafe content">Inappropriate or unsafe content</option>
            <option value="Other safety concern">Other safety concern</option>
          </select>
          <textarea
            rows={2}
            maxLength={500}
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            placeholder="Optional details for our safety team..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A]"
          />
          {reportError && (
            <p role="alert" className="font-medium text-red-700">
              {reportError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={reportSubmitting}
              className="rounded-xl bg-[#0B1F3A] px-3.5 py-2 font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-60"
            >
              {reportSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      )}

      {reportSuccess && (
        <p role="status" className="mt-3 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-3.5 py-2 text-xs font-medium text-[#0F766E]">
          {reportSuccess}
        </p>
      )}

      {/* Inline Delete Confirmation */}
      {confirmDeletePost && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900">
          <span className="font-medium">Delete this post and its images permanently?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeletePost(false)}
              disabled={isDeletingPost}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeletePost}
              disabled={isDeletingPost}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isDeletingPost ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2 text-xs font-medium text-red-800"
        >
          {actionError}
        </div>
      )}

      {/* Body: Either Edit Post Form or Standard Display */}
      {isEditingPost ? (
        <form onSubmit={handleSavePostEdit} className="mt-5 space-y-4 border-t border-slate-200/80 pt-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`edit-cat-${post.id}`}
                className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
              >
                Skill / service category
              </label>
              <select
                id={`edit-cat-${post.id}`}
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(Number(e.target.value))}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`edit-price-${post.id}`}
                className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
              >
                Optional price or range
              </label>
              <input
                id={`edit-price-${post.id}`}
                type="text"
                maxLength={60}
                value={editPriceText}
                onChange={(e) => setEditPriceText(e.target.value)}
                placeholder="e.g. R850 or R1,200 – R2,500"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor={`edit-prov-${post.id}`}
                className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
              >
                Province
              </label>
              <select
                id={`edit-prov-${post.id}`}
                value={editProvince}
                onChange={(e) => {
                  const nextProv = e.target.value;
                  setEditProvince(nextProv);
                  const nextCities = SOUTH_AFRICA_LOCATIONS[nextProv] ?? [];
                  setEditCityOption(nextCities[0] ?? '__other__');
                  setEditCustomCity('');
                }}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
              >
                {PROVINCE_LIST.map((prov) => (
                  <option key={prov} value={prov}>
                    {prov}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`edit-city-${post.id}`}
                className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
              >
                City / town
              </label>
              <select
                id={`edit-city-${post.id}`}
                value={editCityOption}
                onChange={(e) => setEditCityOption(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
              >
                {availableEditCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__other__">Other city or town...</option>
              </select>
            </div>

            {editCityOption === '__other__' && (
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={editCustomCity}
                  onChange={(e) => setEditCustomCity(e.target.value)}
                  placeholder="Enter city or town"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label
                htmlFor={`edit-suburb-${post.id}`}
                className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
              >
                Suburb (optional)
              </label>
              <input
                id={`edit-suburb-${post.id}`}
                type="text"
                maxLength={100}
                value={editSuburb}
                onChange={(e) => setEditSuburb(e.target.value)}
                placeholder="e.g. Durban North"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`edit-desc-${post.id}`}
              className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
            >
              Description
            </label>
            <textarea
              id={`edit-desc-${post.id}`}
              rows={3}
              maxLength={1500}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
            />
          </div>

          {/* Manage Post Images */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0B1F3A]">
                Images ({editExistingImages.length + editNewFiles.length}/6)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAddEditImages}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Images</span>
              </button>
            </div>

            {(editExistingImages.length > 0 || editNewFiles.length > 0) && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {editExistingImages.map((url) => (
                  <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200">
                    <img src={url} alt="Post attachment" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        setEditExistingImages((prev) => prev.filter((item) => item !== url))
                      }
                      aria-label="Remove image"
                      className="absolute right-1.5 top-1.5 rounded-lg bg-[#07152B]/80 p-1 text-white hover:bg-[#07152B]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {editNewFiles.map((item, idx) => (
                  <div
                    key={item.previewUrl}
                    className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#93C5FD]"
                  >
                    <img
                      src={item.previewUrl}
                      alt={`New image preview ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(item.previewUrl);
                        setEditNewFiles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      aria-label="Remove new image"
                      className="absolute right-1.5 top-1.5 rounded-lg bg-[#07152B]/80 p-1 text-white hover:bg-[#07152B]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {editError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditingPost(false)}
              disabled={isSavingPost}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingPost}
              className="btn-royal inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-65"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isSavingPost ? 'Saving...' : 'Save Post'}</span>
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Category & Optional Price Metadata (Clean unboxed text) */}
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-[#0D9488]">
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

          {/* Post Description */}
          <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-slate-800 sm:text-[15px]">
            {post.description}
          </p>

          {/* Prominent Image Showcase */}
          {post.images.length > 0 && (
            <div className="mt-4">
              {post.images.length === 1 && (
                <PostImage
                  src={post.images[0]}
                  alt={`Work showcased by ${post.authorName}`}
                  onClick={() => setLightboxImage(post.images[0])}
                  className="max-h-[460px] rounded-2xl border border-slate-200/80 aspect-[16/10]"
                />
              )}

              {post.images.length === 2 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {post.images.map((url, idx) => (
                    <PostImage
                      key={url}
                      src={url}
                      alt={`Work photo ${idx + 1} by ${post.authorName}`}
                      onClick={() => setLightboxImage(url)}
                      className="aspect-[4/3] rounded-2xl border border-slate-200/80"
                    />
                  ))}
                </div>
              )}

              {post.images.length >= 3 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {post.images.map((url, idx) => (
                    <PostImage
                      key={url}
                      src={url}
                      alt={`Work photo ${idx + 1} by ${post.authorName}`}
                      onClick={() => setLightboxImage(url)}
                      className="aspect-[4/3] rounded-2xl border border-slate-200/80"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Engagement Bar: Like & Comment Controls */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleToggleLike}
                disabled={isLiking}
                aria-pressed={post.likedByMe}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                  post.likedByMe
                    ? 'border-[#1D4ED8]/40 bg-[#EFF6FF] text-[#1D4ED8]'
                    : 'border-slate-200/90 bg-white/85 text-slate-700 hover:border-[#93C5FD] hover:bg-white'
                }`}
              >
                <Heart
                  className={`h-4 w-4 ${post.likedByMe ? 'fill-[#1D4ED8] text-[#1D4ED8]' : ''}`}
                  aria-hidden="true"
                />
                <span className="tabular-nums">{post.likeCount}</span>
                <span>{post.likeCount === 1 ? 'Like' : 'Likes'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleComments}
                aria-expanded={commentsOpen}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                  commentsOpen
                    ? 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E]'
                    : 'border-slate-200/90 bg-white/85 text-slate-700 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span className="tabular-nums">{post.commentCount}</span>
                <span>{post.commentCount === 1 ? 'Comment' : 'Comments'}</span>
              </button>
            </div>
          </div>

          {/* Expandable Comments Section */}
          {commentsOpen && (
            <div className="mt-4 space-y-4 border-t border-slate-200/70 pt-4">
              {commentsLoading ? (
                <p className="text-xs text-slate-500">Loading comments...</p>
              ) : commentsError ? (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {commentsError}
                </p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No comments yet. Be the first to ask a question or share feedback.
                </p>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => {
                    const isEditingThis = editingCommentId === comment.id;
                    return (
                      <div
                        key={comment.id}
                        className="rounded-2xl border border-slate-200/80 bg-white/75 p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(comment.userId)}
                              className="shrink-0 rounded-xl"
                            >
                              <ProfileAvatar
                                src={comment.authorAvatarUrl}
                                fullName={comment.authorName}
                                size="sm"
                              />
                            </button>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => onOpenProfile(comment.userId)}
                                  className="text-xs font-bold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
                                >
                                  {comment.authorName}
                                </button>
                                <span className="text-[11px] text-slate-500">
                                  {formatPostTimestamp(comment.createdAt)}
                                  {comment.updatedAt !== comment.createdAt ? ' · edited' : ''}
                                </span>
                              </div>

                              {isEditingThis ? (
                                <div className="mt-2 space-y-2">
                                  <textarea
                                    rows={2}
                                    maxLength={600}
                                    value={editingCommentText}
                                    onChange={(e) => setEditingCommentText(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveCommentEdit(comment.id)}
                                      disabled={savingCommentId === comment.id}
                                      className="rounded-lg bg-[#1D4ED8] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1E40AF]"
                                    >
                                      {savingCommentId === comment.id ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCommentId(null);
                                        setEditingCommentText('');
                                      }}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                                  {comment.commentText}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Comment Author Edit / Delete or Post Owner Delete */}
                          {!isEditingThis && (comment.canEdit || comment.canDelete) && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {comment.canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentText(comment.commentText);
                                  }}
                                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-[#0B1F3A]"
                                >
                                  Edit
                                </button>
                              )}
                              {comment.canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(comment.id)}
                                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    maxLength={600}
                    value={newCommentText}
                    onChange={(e) => {
                      setNewCommentText(e.target.value);
                      if (commentFormError) setCommentFormError('');
                    }}
                    placeholder="Write a comment or enquiry note..."
                    aria-label="Write a comment"
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  <button
                    type="submit"
                    disabled={isPostingComment}
                    className="btn-royal inline-flex min-h-[42px] items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-65"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isPostingComment ? 'Posting...' : 'Comment'}</span>
                  </button>
                </div>
                {commentFormError && (
                  <p role="alert" className="text-xs font-medium text-red-700">
                    {commentFormError}
                  </p>
                )}
              </form>
            </div>
          )}
        </>
      )}

      {/* Full-size Image Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full size post image"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#07152B]/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-3xl border border-white/25 bg-white p-2 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close image preview"
              className="absolute right-4 top-4 z-10 rounded-full bg-[#07152B]/80 p-2 text-white hover:bg-[#07152B]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <img
              src={lightboxImage}
              alt="Enlarged work showcase"
              className="max-h-[84vh] w-auto rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </article>
  );
}
