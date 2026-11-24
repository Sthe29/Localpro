import type {
  CategoryItem,
  CommentItem,
  DiscoverData,
  ExploreFilters,
  FeedScope,
  FeedSort,
  PostItem,
  PostPayload,
  PublicProfile,
} from '../types/auth';
import { apiFetch, parseApiJson } from './apiClient';

export async function fetchCategories(): Promise<CategoryItem[]> {
  const response = await apiFetch('/api/categories');
  const data = await parseApiJson<{ categories: CategoryItem[] }>(response);
  return data.categories;
}

export async function uploadPostImage(token: string, file: File): Promise<string> {
  const response = await apiFetch('/api/posts/upload-image', {
    method: 'POST',
    token,
    extraHeaders: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  const data = await parseApiJson<{ imageUrl: string }>(response);
  return data.imageUrl;
}

export async function fetchFeedPosts(
  token: string,
  options: {
    scope?: FeedScope;
    categoryId?: number;
    authorId?: string;
    sort?: FeedSort;
    limit?: number;
    offset?: number;
  }
): Promise<{
  posts: PostItem[];
  totalCount: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (options.scope) params.set('scope', options.scope);
  if (options.categoryId) params.set('categoryId', String(options.categoryId));
  if (options.authorId) params.set('authorId', options.authorId);
  if (options.sort) params.set('sort', options.sort);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));

  const response = await apiFetch(`/api/posts?${params.toString()}`, { token });
  return parseApiJson<{ posts: PostItem[]; totalCount: number; hasMore: boolean }>(response);
}

export async function fetchPostById(token: string, postId: string): Promise<PostItem> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}`, { token });
  const data = await parseApiJson<{ post: PostItem }>(response);
  return data.post;
}

export async function createPostRequest(token: string, payload: PostPayload): Promise<PostItem> {
  const response = await apiFetch('/api/posts', {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson<{ post: PostItem }>(response);
  return data.post;
}

export async function updatePostRequest(
  token: string,
  postId: string,
  payload: PostPayload
): Promise<PostItem> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseApiJson<{ post: PostItem }>(response);
  return data.post;
}

export async function deletePostRequest(token: string, postId: string): Promise<void> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    token,
  });
  await parseApiJson<{ success: boolean }>(response);
}

export async function togglePostLikeRequest(
  token: string,
  postId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/like`, {
    method: 'POST',
    token,
  });
  return parseApiJson<{ liked: boolean; likeCount: number }>(response);
}

export async function fetchPostComments(token: string, postId: string): Promise<CommentItem[]> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments`, { token });
  const data = await parseApiJson<{ comments: CommentItem[] }>(response);
  return data.comments;
}

export async function createCommentRequest(
  token: string,
  postId: string,
  commentText: string
): Promise<{ comment: CommentItem; commentCount: number }> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commentText }),
  });
  return parseApiJson<{ comment: CommentItem; commentCount: number }>(response);
}

export async function updateCommentRequest(
  token: string,
  commentId: string,
  commentText: string
): Promise<CommentItem> {
  const response = await apiFetch(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    token,
    extraHeaders: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commentText }),
  });
  const data = await parseApiJson<{ comment: CommentItem }>(response);
  return data.comment;
}

export async function deleteCommentRequest(
  token: string,
  commentId: string
): Promise<{ success: boolean; commentCount: number }> {
  const response = await apiFetch(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    token,
  });
  return parseApiJson<{ success: boolean; commentCount: number }>(response);
}

export async function searchExploreProfiles(
  token: string,
  filters: ExploreFilters
): Promise<PublicProfile[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.province) params.set('province', filters.province);
  if (filters.city) params.set('city', filters.city);
  if (filters.suburb) params.set('suburb', filters.suburb);
  if (filters.category) params.set('category', filters.category);
  if (filters.skill) params.set('skill', filters.skill);

  const response = await apiFetch(`/api/profiles?${params.toString()}`, { token });
  const data = await parseApiJson<{ profiles: PublicProfile[] }>(response);
  return data.profiles;
}

export async function fetchDiscoverOverview(token: string): Promise<DiscoverData> {
  const response = await apiFetch('/api/discover', { token });
  return parseApiJson<DiscoverData>(response);
}
