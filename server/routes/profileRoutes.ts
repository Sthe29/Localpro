import crypto from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  findUserById,
  getAllSkills,
  getCategoryCounts,
  getFeedPosts,
  getProvidersInArea,
  getPublicUserProfile,
  getRecentlyActiveProviders,
  logSecurityEvent,
  searchPublicProfiles,
  updateUserAvatarUrl,
  updateUserProfile,
} from '../db.ts';
import {
  AVATAR_UPLOAD_DIR,
  detectImageExtension,
  MAX_IMAGE_BYTES,
  safelyDeleteUploadFile,
} from '../imageUtils.ts';
import { createRateLimiter, getClientIp } from '../rateLimiter.ts';
import { sanitizeCustomSkills, sanitizeSkillIds } from './authRoutes.ts';

const router = Router();

const searchLimiter = createRateLimiter({
  namespace: 'profile-search',
  maxRequests: 60,
  windowMs: 60 * 1000,
  keyBy: 'user',
  message: 'Too many search requests. Please wait a moment before searching again.',
});

const avatarUploadLimiter = createRateLimiter({
  namespace: 'avatar-upload',
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many profile image upload attempts. Please wait a few minutes.',
});

export { AVATAR_UPLOAD_DIR };

// Protected: Search and filter public profiles (Explore & Search - Module 05)
router.get('/profiles', requireAuth, searchLimiter, (req: AuthenticatedRequest, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const province = typeof req.query.province === 'string' ? req.query.province.trim().slice(0, 80) : '';
  const city = typeof req.query.city === 'string' ? req.query.city.trim().slice(0, 80) : '';
  const suburb = typeof req.query.suburb === 'string' ? req.query.suburb.trim().slice(0, 80) : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 80) : '';
  const skill = typeof req.query.skill === 'string' ? req.query.skill.trim().slice(0, 80) : '';

  const profiles = searchPublicProfiles({
    excludeUserId: req.authUserId,
    query: q || undefined,
    province: province || undefined,
    city: city || undefined,
    suburb: suburb || undefined,
    category: category || undefined,
    skill: skill || undefined,
    limit: 60,
  });

  res.json({ profiles });
});

// Protected: Discover section data (genuine DB records only)
router.get('/discover', requireAuth, searchLimiter, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const currentUser = findUserById(userId);
  if (!currentUser) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  const providersInArea = getProvidersInArea({
    userId,
    city: currentUser.city,
    province: currentUser.province,
    limit: 6,
  });
  const recentlyActiveProviders = getRecentlyActiveProviders(6).filter((p) => p.id !== userId);
  const { posts: recentPosts } = getFeedPosts({
    viewerUserId: userId,
    viewerProvince: currentUser.province,
    viewerCity: currentUser.city,
    viewerSuburb: currentUser.suburb ?? '',
    scope: 'everywhere',
    sort: 'recent',
    limit: 6,
    offset: 0,
  });
  const categories = getCategoryCounts();

  res.json({
    providersInArea,
    recentlyActiveProviders,
    recentPosts,
    categories,
  });
});

// Protected: View any user's public profile without exposing private fields
router.get('/profiles/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const targetId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!targetId || targetId.length > 64) {
    res.status(400).json({ error: 'Invalid profile identifier.' });
    return;
  }

  const profile = getPublicUserProfile(targetId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found.' });
    return;
  }

  res.json({ profile });
});

// Protected: Update the authenticated user's own profile (strictly scoped to req.authUserId)
router.put('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const body = req.body ?? {};
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 400) : '';
  const province = typeof body.province === 'string' ? body.province.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const suburb = typeof body.suburb === 'string' ? body.suburb.trim().slice(0, 100) : '';
  const serviceLocation =
    typeof body.serviceLocation === 'string' ? body.serviceLocation.trim().slice(0, 120) : '';
  const hasSkills = Boolean(body.hasSkills);
  const skillDescription =
    typeof body.skillDescription === 'string' ? body.skillDescription.trim().slice(0, 500) : '';

  if (fullName.length < 2 || fullName.length > 100) {
    res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
    return;
  }

  if (!province) {
    res.status(400).json({ error: 'Please select your province.' });
    return;
  }

  if (!city) {
    res.status(400).json({ error: 'Please select or enter your city or town.' });
    return;
  }

  const allSkills = getAllSkills();
  const validSkillIds = new Set(allSkills.map((s) => s.id));
  const skillIds = hasSkills ? sanitizeSkillIds(body.skillIds, validSkillIds) : [];
  const customSkills = hasSkills ? sanitizeCustomSkills(body.customSkills) : [];

  if (hasSkills && skillIds.length === 0 && customSkills.length === 0) {
    res.status(400).json({
      error: 'Please select at least one skill or add a custom skill when offering services.',
    });
    return;
  }

  const updated = updateUserProfile({
    userId,
    fullName,
    bio,
    province,
    city,
    suburb,
    serviceLocation,
    hasSkills,
    skillDescription,
    skillIds,
    customSkills,
  });

  if (!updated) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }

  res.json({ user: updated });
});

// Protected: Upload or replace profile picture (stored on filesystem, path saved in DB)
router.post(
  '/profile/avatar',
  requireAuth,
  avatarUploadLimiter,
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
        metadata: { route: 'avatar', reason: 'oversized_or_unsupported_type' },
      });
      res.status(413).json({
        error: 'Profile picture must be a JPG, PNG, or WebP image under 5 MB.',
      });
      return;
    }
    next();
  },
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      logSecurityEvent({
        eventType: 'upload_rejected',
        userId,
        ipAddress: getClientIp(req),
        metadata: { route: 'avatar', reason: 'empty_or_invalid_buffer' },
      });
      res.status(400).json({ error: 'Please upload a valid JPG, PNG, or WebP image file.' });
      return;
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Profile picture must be 5 MB or smaller.' });
      return;
    }

    const ext = detectImageExtension(buffer);
    if (!ext) {
      logSecurityEvent({
        eventType: 'upload_rejected',
        userId,
        ipAddress: getClientIp(req),
        metadata: { route: 'avatar', reason: 'invalid_magic_bytes' },
      });
      res.status(400).json({
        error: 'Unsupported image format. Please upload a valid JPG, PNG, or WebP image.',
      });
      return;
    }

    const existingUser = findUserById(userId);
    if (!existingUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const destination = path.resolve(AVATAR_UPLOAD_DIR, filename);
    if (!destination.startsWith(AVATAR_UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }

    fs.writeFileSync(destination, buffer);
    const publicAvatarUrl = `/uploads/avatars/${filename}`;
    const updated = updateUserAvatarUrl(userId, publicAvatarUrl);

    if (existingUser.avatar_url && existingUser.avatar_url !== publicAvatarUrl) {
      safelyDeleteUploadFile(existingUser.avatar_url, '/uploads/avatars/', AVATAR_UPLOAD_DIR);
    }

    res.json({ user: updated });
  }
);

// Protected: Remove the authenticated user's profile picture
router.delete('/profile/avatar', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const existingUser = findUserById(userId);
  if (!existingUser) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  safelyDeleteUploadFile(existingUser.avatar_url, '/uploads/avatars/', AVATAR_UPLOAD_DIR);
  const updated = updateUserAvatarUrl(userId, null);
  res.json({ user: updated });
});

export default router;
