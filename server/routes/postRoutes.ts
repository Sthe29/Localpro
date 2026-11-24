import crypto from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  createComment,
  createNotification,
  createPost,
  deleteCommentById,
  deletePostById,
  findCategoryById,
  findUserById,
  getAllCategories,
  getCommentsForPost,
  getFeedPosts,
  getPostById,
  getPostCommentCount,
  getRawComment,
  getRawPostOwner,
  hasRecentLikeNotification,
  logSecurityEvent,
  togglePostLike,
  updateCommentText,
  updatePost,
} from '../db.ts';
import {
  detectImageExtension,
  MAX_IMAGE_BYTES,
  POST_UPLOAD_DIR,
  POST_URL_PREFIX,
  safelyDeleteUploadFile,
  verifyStoredUploadPath,
} from '../imageUtils.ts';
import { createRateLimiter, getClientIp } from '../rateLimiter.ts';

const router = Router();

const postUploadLimiter = createRateLimiter({
  namespace: 'post-upload',
  maxRequests: 25,
  windowMs: 10 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many image uploads in a short period. Please wait a few minutes.',
});

const postReadLimiter = createRateLimiter({
  namespace: 'post-read',
  maxRequests: 60,
  windowMs: 60 * 1000,
  keyBy: 'user',
  message: 'Too many feed requests. Please wait a moment.',
});

const postWriteLimiter = createRateLimiter({
  namespace: 'post-write',
  maxRequests: 15,
  windowMs: 10 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many post updates in a short period. Please wait a few minutes.',
});

const likeLimiter = createRateLimiter({
  namespace: 'post-like',
  maxRequests: 60,
  windowMs: 5 * 60 * 1000,
  keyBy: 'user',
  message: 'You are liking posts too quickly. Please wait a moment.',
});

const commentWriteLimiter = createRateLimiter({
  namespace: 'comment-write',
  maxRequests: 30,
  windowMs: 5 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many comments submitted in a short period. Please wait a moment.',
});

export { POST_UPLOAD_DIR };

function sanitizePostImages(rawImages: unknown): string[] {
  if (!Array.isArray(rawImages)) return [];
  const verified: string[] = [];
  const seen = new Set<string>();
  for (const item of rawImages) {
    const validPath = verifyStoredUploadPath(item, POST_URL_PREFIX, POST_UPLOAD_DIR);
    if (validPath && !seen.has(validPath)) {
      seen.add(validPath);
      verified.push(validPath);
    }
    if (verified.length >= 6) break;
  }
  return verified;
}

// Public/Auth: Get available post categories
router.get('/categories', (_req: Request, res: Response) => {
  res.json({ categories: getAllCategories() });
});

// Protected: Upload a single post image (called per selected image before publishing/updating)
router.post(
  '/posts/upload-image',
  requireAuth,
  postUploadLimiter,
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    limit: '5mb',
  }),
  (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err) {
      logSecurityEvent({
        eventType: 'upload_rejected',
        userId: (req as AuthenticatedRequest).authUserId ?? null,
        ipAddress: getClientIp(req),
        metadata: { route: 'post_image', reason: 'oversized_or_unsupported_type' },
      });
      res.status(413).json({
        error: 'Each post image must be a JPG, PNG, or WebP file under 5 MB.',
      });
      return;
    }
    next();
  },
  (req: AuthenticatedRequest, res: Response) => {
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      logSecurityEvent({
        eventType: 'upload_rejected',
        userId: req.authUserId ?? null,
        ipAddress: getClientIp(req),
        metadata: { route: 'post_image', reason: 'empty_or_invalid_buffer' },
      });
      res.status(400).json({ error: 'Please select a valid JPG, PNG, or WebP image.' });
      return;
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Each image must be 5 MB or smaller.' });
      return;
    }

    const ext = detectImageExtension(buffer);
    if (!ext) {
      logSecurityEvent({
        eventType: 'upload_rejected',
        userId: req.authUserId ?? null,
        ipAddress: getClientIp(req),
        metadata: { route: 'post_image', reason: 'invalid_magic_bytes' },
      });
      res.status(400).json({
        error: 'Unsupported image format. Please upload JPG, PNG, or WebP files only.',
      });
      return;
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const destination = path.resolve(POST_UPLOAD_DIR, filename);
    if (!destination.startsWith(POST_UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }

    fs.writeFileSync(destination, buffer);
    res.status(201).json({ imageUrl: `${POST_URL_PREFIX}${filename}` });
  }
);

// Protected: Location-prioritized, filterable, sortable Home & Profile posts feed
router.get('/posts', requireAuth, postReadLimiter, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const viewer = findUserById(userId);
  if (!viewer) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  const rawScope = typeof req.query.scope === 'string' ? req.query.scope : 'near';
  const scope: 'near' | 'city' | 'kzn' | 'everywhere' =
    rawScope === 'city' || rawScope === 'kzn' || rawScope === 'everywhere' ? rawScope : 'near';

  const rawSort = typeof req.query.sort === 'string' ? req.query.sort : 'recent';
  const sort: 'recent' | 'liked' = rawSort === 'liked' ? 'liked' : 'recent';

  const rawCategoryId = typeof req.query.categoryId === 'string' ? Number(req.query.categoryId) : 0;
  const categoryId = Number.isInteger(rawCategoryId) && rawCategoryId > 0 ? rawCategoryId : undefined;

  const authorId =
    typeof req.query.authorId === 'string' && req.query.authorId.trim().length > 0
      ? req.query.authorId.trim()
      : undefined;

  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 15;
  const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 15;
  const offset = Number.isInteger(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const { posts, totalCount } = getFeedPosts({
    viewerUserId: userId,
    viewerProvince: viewer.province,
    viewerCity: viewer.city,
    viewerSuburb: viewer.suburb ?? '',
    scope,
    categoryId,
    authorId,
    sort,
    limit,
    offset,
  });

  res.json({
    posts,
    totalCount,
    hasMore: offset + posts.length < totalCount,
    viewerLocation: {
      province: viewer.province,
      city: viewer.city,
      suburb: viewer.suburb ?? '',
    },
  });
});

// Protected: Get a single post by ID (used when opening a post from notifications)
router.get('/posts/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!postId || postId.length > 64) {
    res.status(400).json({ error: 'Invalid post identifier.' });
    return;
  }

  const post = getPostById(postId, userId);
  if (!post) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }

  res.json({ post });
});

// Protected: Publish a new work showcase post
router.post('/posts', requireAuth, postWriteLimiter, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const body = req.body ?? {};
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const categoryId = Number(body.categoryId);
  const province = typeof body.province === 'string' ? body.province.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const suburb = typeof body.suburb === 'string' ? body.suburb.trim().slice(0, 100) : '';
  const priceText = typeof body.priceText === 'string' ? body.priceText.trim().slice(0, 60) : '';

  if (description.length < 5 || description.length > 1500) {
    res.status(400).json({
      error: 'Please enter a post description between 5 and 1500 characters.',
    });
    return;
  }

  if (!Number.isInteger(categoryId) || !findCategoryById(categoryId)) {
    res.status(400).json({ error: 'Please select a valid skill or service category.' });
    return;
  }

  if (!province || !city) {
    res.status(400).json({ error: 'Please specify the province and city/town for this post.' });
    return;
  }

  const images = sanitizePostImages(body.images);
  const postId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const post = createPost({
    id: postId,
    authorId: userId,
    categoryId,
    description,
    province,
    city,
    suburb,
    priceText,
    images,
    createdAt,
  });

  res.status(201).json({ post });
});

// Protected: Edit an existing post (strictly original author only)
router.put('/posts/:id', requireAuth, postWriteLimiter, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const ownerRow = getRawPostOwner(postId);
  if (!ownerRow) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }
  if (ownerRow.author_id !== userId) {
    logSecurityEvent({
      eventType: 'unauthorized_access_attempt',
      userId,
      ipAddress: getClientIp(req),
      metadata: { action: 'edit_post', targetId: postId },
    });
    res.status(403).json({ error: 'You can only edit your own posts.' });
    return;
  }

  const body = req.body ?? {};
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const categoryId = Number(body.categoryId);
  const province = typeof body.province === 'string' ? body.province.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const suburb = typeof body.suburb === 'string' ? body.suburb.trim().slice(0, 100) : '';
  const priceText = typeof body.priceText === 'string' ? body.priceText.trim().slice(0, 60) : '';

  if (description.length < 5 || description.length > 1500) {
    res.status(400).json({
      error: 'Post description must be between 5 and 1500 characters.',
    });
    return;
  }
  if (!Number.isInteger(categoryId) || !findCategoryById(categoryId)) {
    res.status(400).json({ error: 'Please select a valid skill or service category.' });
    return;
  }
  if (!province || !city) {
    res.status(400).json({ error: 'Please specify the province and city/town for this post.' });
    return;
  }

  const images = sanitizePostImages(body.images);
  const result = updatePost({
    postId,
    authorId: userId,
    categoryId,
    description,
    province,
    city,
    suburb,
    priceText,
    images,
    updatedAt: new Date().toISOString(),
  });

  if (!result) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }

  for (const removedUrl of result.removedImages) {
    safelyDeleteUploadFile(removedUrl, POST_URL_PREFIX, POST_UPLOAD_DIR);
  }

  res.json({ post: result.post });
});

// Protected: Delete a post (strictly original author only)
router.delete('/posts/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const ownerRow = getRawPostOwner(postId);
  if (!ownerRow) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }
  if (ownerRow.author_id !== userId) {
    logSecurityEvent({
      eventType: 'unauthorized_access_attempt',
      userId,
      ipAddress: getClientIp(req),
      metadata: { action: 'delete_post', targetId: postId },
    });
    res.status(403).json({ error: 'You can only delete your own posts.' });
    return;
  }

  const { deletedImages } = deletePostById(postId);
  for (const url of deletedImages) {
    safelyDeleteUploadFile(url, POST_URL_PREFIX, POST_UPLOAD_DIR);
  }

  res.json({ success: true });
});

// Protected: Toggle like on a post (1 like per user per post enforced by UNIQUE constraint)
router.post('/posts/:id/like', requireAuth, likeLimiter, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const ownerRow = getRawPostOwner(postId);
  if (!ownerRow) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }

  const result = togglePostLike(userId, postId);

  if (result.liked && ownerRow.author_id !== userId) {
    const alreadyNotified = hasRecentLikeNotification(ownerRow.author_id, userId, postId);
    if (!alreadyNotified) {
      const actor = findUserById(userId);
      if (actor) {
        createNotification({
          id: crypto.randomUUID(),
          recipientUserId: ownerRow.author_id,
          actorUserId: userId,
          type: 'post_like',
          relatedPostId: postId,
          message: `${actor.full_name} liked your showcased work post.`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  res.json(result);
});

// Protected: List comments for a post
router.get('/posts/:id/comments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const ownerRow = getRawPostOwner(postId);
  if (!ownerRow) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }

  const comments = getCommentsForPost(postId, userId);
  res.json({ comments });
});

// Protected: Add a comment to a post
router.post('/posts/:id/comments', requireAuth, commentWriteLimiter, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const ownerRow = getRawPostOwner(postId);
  if (!ownerRow) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }

  const commentText =
    typeof req.body?.commentText === 'string' ? req.body.commentText.trim() : '';

  if (commentText.length === 0) {
    res.status(400).json({ error: 'Comment cannot be empty.' });
    return;
  }
  if (commentText.length > 600) {
    res.status(400).json({ error: 'Comment must be 600 characters or fewer.' });
    return;
  }

  const comment = createComment({
    id: crypto.randomUUID(),
    postId,
    userId,
    commentText,
    createdAt: new Date().toISOString(),
  });
  const commentCount = getPostCommentCount(postId);

  if (ownerRow.author_id !== userId) {
    const actor = findUserById(userId);
    if (actor) {
      createNotification({
        id: crypto.randomUUID(),
        recipientUserId: ownerRow.author_id,
        actorUserId: userId,
        type: 'post_comment',
        relatedPostId: postId,
        message: `${actor.full_name} commented on your post.`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  res.status(201).json({ comment, commentCount });
});

// Protected: Edit a comment (comment author only)
router.put('/comments/:commentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const commentId = typeof req.params.commentId === 'string' ? req.params.commentId.trim() : '';
  const existing = getRawComment(commentId);
  if (!existing) {
    res.status(404).json({ error: 'Comment not found.' });
    return;
  }
  if (existing.user_id !== userId) {
    logSecurityEvent({
      eventType: 'unauthorized_access_attempt',
      userId,
      ipAddress: getClientIp(req),
      metadata: { action: 'edit_comment', targetId: commentId },
    });
    res.status(403).json({ error: 'You can only edit your own comments.' });
    return;
  }

  const commentText =
    typeof req.body?.commentText === 'string' ? req.body.commentText.trim() : '';

  if (commentText.length === 0) {
    res.status(400).json({ error: 'Comment cannot be empty.' });
    return;
  }
  if (commentText.length > 600) {
    res.status(400).json({ error: 'Comment must be 600 characters or fewer.' });
    return;
  }

  const updated = updateCommentText({
    commentId,
    userId,
    commentText,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    res.status(404).json({ error: 'Comment not found.' });
    return;
  }

  res.json({ comment: updated });
});

// Protected: Delete a comment (comment author OR post owner)
router.delete('/comments/:commentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const commentId = typeof req.params.commentId === 'string' ? req.params.commentId.trim() : '';
  const existing = getRawComment(commentId);
  if (!existing) {
    res.status(404).json({ error: 'Comment not found.' });
    return;
  }

  const postOwner = getRawPostOwner(existing.post_id);
  const isCommentAuthor = existing.user_id === userId;
  const isPostOwner = postOwner?.author_id === userId;

  if (!isCommentAuthor && !isPostOwner) {
    logSecurityEvent({
      eventType: 'unauthorized_access_attempt',
      userId,
      ipAddress: getClientIp(req),
      metadata: { action: 'delete_comment', targetId: commentId },
    });
    res.status(403).json({ error: 'You do not have permission to delete this comment.' });
    return;
  }

  deleteCommentById(commentId);
  const commentCount = getPostCommentCount(existing.post_id);
  res.json({ success: true, commentCount });
});

export default router;
