import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import {
  clearSessionCookie,
  extractAuthTokenFromRequest,
  hashPassword,
  hashSha256Hex,
  requireAuth,
  SESSION_TTL_MS,
  setSessionCookie,
  signAuthToken,
  validateStrongPassword,
  verifyAuthToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import {
  completeGooglePasswordReset,
  completePasswordResetToken,
  consumeEmailVerificationToken,
  createEmailVerificationToken,
  createPasswordResetToken,
  createSession,
  createUserWithSkills,
  findUserByEmail,
  findUserById,
  getAllSkills,
  getPrivateUserProfile,
  getValidPasswordResetToken,
  logSecurityEvent,
  markUserEmailVerified,
  revokeSessionById,
  updateUserSkills,
} from '../db.ts';
import {
  isSmtpConfigured,
  sendAccountVerificationEmail,
  sendPasswordResetEmail,
} from '../mailer.ts';
import { createRateLimiter, getClientIp, hashAuditIdentifier } from '../rateLimiter.ts';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const loginIpLimiter = createRateLimiter({
  namespace: 'auth-login-ip',
  maxRequests: 12,
  windowMs: 15 * 60 * 1000,
  keyBy: 'ip',
  message: 'Too many login attempts from this network. Please wait 15 minutes and try again.',
});

const loginAccountLimiter = createRateLimiter({
  namespace: 'auth-login-acct',
  maxRequests: 7,
  windowMs: 15 * 60 * 1000,
  keyBy: 'ip_and_body_email',
  message: 'Too many sign-in attempts for this account. Please wait 15 minutes and try again.',
});

const registerLimiter = createRateLimiter({
  namespace: 'auth-register',
  maxRequests: 8,
  windowMs: 30 * 60 * 1000,
  keyBy: 'ip',
  message: 'Too many registration attempts. Please wait before trying again.',
});

const passwordResetLimiter = createRateLimiter({
  namespace: 'auth-reset',
  maxRequests: 12,
  windowMs: 15 * 60 * 1000,
  keyBy: 'ip',
  message: 'Too many password reset requests. Please wait 15 minutes and try again.',
});

function resolveAppOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    try {
      return new URL(configured).origin;
    } catch {
      // Fallback to validated host header
    }
  }
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
  const rawHost =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    req.headers.host ||
    'localhost:3000';
  const firstHost = rawHost.split(',')[0].trim();
  if (/^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(firstHost)) {
    return `${proto}://${firstHost}`;
  }
  return 'http://localhost:3000';
}

interface FirebaseAppletConfig {
  oAuthClientId?: string;
  messagingSenderId?: string;
}

function loadGoogleOAuthConfig(): FirebaseAppletConfig {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as FirebaseAppletConfig;
  } catch {
    return {};
  }
}

function extractGoogleBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length >= 20 && token.length <= 4096) {
      return token;
    }
  }
  return null;
}

async function verifyGoogleOAuthAccessToken(accessToken: string): Promise<{
  email: string;
  emailVerified: boolean;
  fullName: string;
} | null> {
  try {
    const [tokenInfoRes, userInfoRes] = await Promise.all([
      fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
        signal: AbortSignal.timeout(8000),
      }),
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    if (!tokenInfoRes.ok || !userInfoRes.ok) {
      return null;
    }

    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      azp?: string;
      exp?: string;
      expires_in?: string;
      email?: string;
      email_verified?: string | boolean;
    };
    const userInfo = (await userInfoRes.json()) as {
      email?: string;
      email_verified?: boolean | string;
      name?: string;
    };

    const config = loadGoogleOAuthConfig();
    const expectedClientId = config.oAuthClientId?.trim();
    const expectedProjectNumber = config.messagingSenderId?.trim();
    const tokenAud = tokenInfo.aud || tokenInfo.azp || '';

    if (expectedClientId && tokenAud) {
      const matchesExactClient =
        tokenInfo.aud === expectedClientId || tokenInfo.azp === expectedClientId;
      const matchesProjectPrefix =
        Boolean(expectedProjectNumber) && tokenAud.startsWith(`${expectedProjectNumber}-`);
      if (!matchesExactClient && !matchesProjectPrefix) {
        return null;
      }
    }

    if (tokenInfo.exp && Number(tokenInfo.exp) * 1000 <= Date.now()) {
      return null;
    }

    const email = (userInfo.email || tokenInfo.email || '').trim().toLowerCase();
    const isVerified =
      userInfo.email_verified === true ||
      userInfo.email_verified === 'true' ||
      tokenInfo.email_verified === true ||
      tokenInfo.email_verified === 'true';

    if (!EMAIL_REGEX.test(email) || !isVerified) {
      return null;
    }

    return {
      email,
      emailVerified: true,
      fullName: typeof userInfo.name === 'string' ? userInfo.name.trim() : '',
    };
  } catch {
    return null;
  }
}

export function sanitizeSkillIds(rawSkillIds: unknown, validSkillIdSet: Set<number>): number[] {
  if (!Array.isArray(rawSkillIds)) {
    return [];
  }
  const unique = new Set<number>();
  for (const item of rawSkillIds) {
    const num = typeof item === 'number' ? item : Number(item);
    if (Number.isInteger(num) && validSkillIdSet.has(num)) {
      unique.add(num);
    }
  }
  return Array.from(unique);
}

export function sanitizeCustomSkills(rawCustomSkills: unknown): string[] {
  if (!Array.isArray(rawCustomSkills)) {
    return [];
  }
  const seenLower = new Set<string>();
  const cleaned: string[] = [];
  for (const item of rawCustomSkills) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 60) continue;
    const lower = trimmed.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      cleaned.push(trimmed);
    }
  }
  return cleaned.slice(0, 15);
}

// Public: List all predefined LocalPro skills grouped by category
router.get('/skills', (_req: Request, res: Response) => {
  const skills = getAllSkills();
  res.json({ skills });
});

// Public: Register a new unified LocalPro user account
router.post('/auth/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const suburb = typeof body.suburb === 'string' ? body.suburb.trim() : '';
    const hasSkills = Boolean(body.hasSkills);
    const skillDescription =
      typeof body.skillDescription === 'string' ? body.skillDescription.trim().slice(0, 500) : '';

    if (fullName.length < 2 || fullName.length > 100) {
      res.status(400).json({ error: 'Please enter your full name (2 to 100 characters).' });
      return;
    }

    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Password and confirmation password do not match.' });
      return;
    }

    if (!province || province.length > 80) {
      res.status(400).json({ error: 'Please select your province.' });
      return;
    }

    if (!city || city.length > 100) {
      res.status(400).json({ error: 'Please select or enter your city or town.' });
      return;
    }

    const existingUser = findUserByEmail(email);
    if (existingUser) {
      res.status(409).json({
        error: 'An account with this email address already exists. Please log in instead.',
      });
      return;
    }

    const allSkills = getAllSkills();
    const validSkillIds = new Set(allSkills.map((s) => s.id));
    const skillIds = hasSkills ? sanitizeSkillIds(body.skillIds, validSkillIds) : [];
    const customSkills = hasSkills ? sanitizeCustomSkills(body.customSkills) : [];

    if (hasSkills && skillIds.length === 0 && customSkills.length === 0) {
      res.status(400).json({
        error: 'Please select at least one predefined skill or add a custom skill.',
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const user = createUserWithSkills({
      id: userId,
      fullName,
      email,
      passwordHash,
      province,
      city,
      suburb: suburb.slice(0, 100),
      hasSkills,
      skillDescription,
      skillIds,
      customSkills,
      createdAt,
    });

    const ipAddress = getClientIp(req);
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    if (isSmtpConfigured()) {
      const rawVerifyToken = crypto.randomBytes(24).toString('hex');
      createEmailVerificationToken({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: hashSha256Hex(rawVerifyToken),
        ttlMs: EMAIL_VERIFY_TTL_MS,
      });
      const verifyUrl = `${resolveAppOrigin(req)}/login?verifyToken=${encodeURIComponent(rawVerifyToken)}`;
      void sendAccountVerificationEmail({
        to: email,
        fullName,
        verifyUrl,
      });
    }

    const sessionId = crypto.randomUUID();
    createSession({
      id: sessionId,
      userId: user.id,
      userAgent,
      ipAddress,
      ttlMs: SESSION_TTL_MS,
    });

    const token = signAuthToken(user.id, sessionId);
    setSessionCookie(req, res, token);

    logSecurityEvent({
      eventType: 'register_success',
      userId: user.id,
      ipAddress,
      userAgent,
      metadata: { emailHash: hashAuditIdentifier(email) },
    });

    res.status(201).json({ token, user });
  } catch (error) {
    console.error('Registration error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Unable to complete registration right now. Please try again.' });
  }
});

// Public: Authenticate existing user with email and password
router.post(
  '/auth/login',
  loginIpLimiter,
  loginAccountLimiter,
  async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const ipAddress = getClientIp(req);
      const userAgent =
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

      if (!EMAIL_REGEX.test(email) || !password) {
        res.status(400).json({ error: 'Please enter both a valid email address and your password.' });
        return;
      }

      const userRecord = findUserByEmail(email);
      if (!userRecord) {
        logSecurityEvent({
          eventType: 'login_failed',
          userId: null,
          ipAddress,
          userAgent,
          metadata: { emailHash: hashAuditIdentifier(email), reason: 'invalid_credentials' },
        });
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      const isMatch = await verifyPassword(password, userRecord.password_hash);
      if (!isMatch) {
        logSecurityEvent({
          eventType: 'login_failed',
          userId: userRecord.id,
          ipAddress,
          userAgent,
          metadata: { reason: 'invalid_credentials' },
        });
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      const profile = getPrivateUserProfile(userRecord.id);
      if (!profile) {
        res.status(404).json({ error: 'Account profile could not be loaded.' });
        return;
      }

      const sessionId = crypto.randomUUID();
      createSession({
        id: sessionId,
        userId: profile.id,
        userAgent,
        ipAddress,
        ttlMs: SESSION_TTL_MS,
      });

      const token = signAuthToken(profile.id, sessionId);
      setSessionCookie(req, res, token);

      logSecurityEvent({
        eventType: 'login_success',
        userId: profile.id,
        ipAddress,
        userAgent,
      });

      res.json({ token, user: profile });
    } catch (error) {
      console.error('Login error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Unable to sign in right now. Please try again.' });
    }
  }
);

// Public: Non-sensitive check indicating whether server SMTP email delivery is configured
router.get('/auth/recovery-status', (_req: Request, res: Response) => {
  res.json({
    emailDeliveryConfigured: isSmtpConfigured(),
    googleRecoveryEnabled: true,
  });
});

// Public: Password reset request handler (generates single-use 15m hashed token; non-enumerating response)
router.post(
  '/auth/forgot-password',
  passwordResetLimiter,
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const ipAddress = getClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const userRecord = findUserByEmail(email);
    let smtpConfigured = isSmtpConfigured();

    if (userRecord) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = hashSha256Hex(rawToken);
      createPasswordResetToken({
        id: crypto.randomUUID(),
        userId: userRecord.id,
        tokenHash,
        ttlMs: PASSWORD_RESET_TTL_MS,
      });

      const resetUrl = `${resolveAppOrigin(req)}/login?resetToken=${encodeURIComponent(rawToken)}`;
      const sendResult = await sendPasswordResetEmail({
        to: userRecord.email,
        fullName: userRecord.full_name,
        resetUrl,
        rawToken,
        expiresMinutes: 15,
      });
      smtpConfigured = sendResult.configured;

      logSecurityEvent({
        eventType: 'password_reset_requested',
        userId: userRecord.id,
        ipAddress,
        userAgent,
        metadata: { smtpConfigured: sendResult.configured, delivered: sendResult.delivered },
      });
    } else {
      logSecurityEvent({
        eventType: 'password_reset_requested',
        userId: null,
        ipAddress,
        userAgent,
        metadata: { emailHash: hashAuditIdentifier(email), matchedAccount: false },
      });
    }

    res.json({
      smtpConfigured,
      message: smtpConfigured
        ? 'If a LocalPro account is registered with that email address, a single-use password reset link valid for 15 minutes has been sent.'
        : 'If a LocalPro account is registered with that email address, a time-limited reset token was created. Automated email delivery requires SMTP credentials to be configured in deployment.',
    });
  }
);

// Public: Consume a single-use password reset token, update password, and revoke all active sessions
router.post('/auth/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
    const ipAddress = getClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    if (!rawToken || rawToken.length < 20 || rawToken.length > 256) {
      res.status(400).json({ error: 'Invalid or expired password reset token.' });
      return;
    }

    const strengthError = validateStrongPassword(newPassword);
    if (strengthError) {
      res.status(400).json({ error: strengthError });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation password do not match.' });
      return;
    }

    const tokenRow = getValidPasswordResetToken(hashSha256Hex(rawToken));
    if (!tokenRow) {
      logSecurityEvent({
        eventType: 'password_reset_failed',
        userId: null,
        ipAddress,
        userAgent,
        metadata: { reason: 'invalid_or_expired_token' },
      });
      res.status(400).json({ error: 'This password reset token is invalid, expired, or already used.' });
      return;
    }

    const userRecord = findUserById(tokenRow.user_id);
    if (!userRecord) {
      res.status(400).json({ error: 'This password reset token is no longer valid.' });
      return;
    }

    const isSameAsCurrent = await verifyPassword(newPassword, userRecord.password_hash);
    if (isSameAsCurrent) {
      res.status(400).json({
        error: 'Your new password cannot be the same as your current password.',
      });
      return;
    }

    const nextHash = await hashPassword(newPassword);
    completePasswordResetToken({
      tokenId: tokenRow.id,
      userId: userRecord.id,
      newPasswordHash: nextHash,
    });

    clearSessionCookie(req, res);
    logSecurityEvent({
      eventType: 'password_reset_completed',
      userId: userRecord.id,
      ipAddress,
      userAgent,
    });

    res.json({
      success: true,
      message: 'Your password has been reset and all previous sessions have been logged out. You can now sign in.',
    });
  } catch (err) {
    console.error('Reset password error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Unable to reset password right now.' });
  }
});

// Public: Sign in to an existing LocalPro account using a verified Google OAuth access token
router.post('/auth/google-signin', loginIpLimiter, async (req: Request, res: Response) => {
  try {
    const googleAccessToken = extractGoogleBearerToken(req);
    const ipAddress = getClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    if (!googleAccessToken) {
      res.status(401).json({ error: 'Missing Google sign-in token. Please sign in with Google again.' });
      return;
    }

    const verifiedGoogle = await verifyGoogleOAuthAccessToken(googleAccessToken);
    if (!verifiedGoogle) {
      logSecurityEvent({
        eventType: 'login_failed',
        userId: null,
        ipAddress,
        userAgent,
        metadata: { method: 'google', reason: 'invalid_google_token' },
      });
      res.status(401).json({
        error: 'Google verification failed or expired. Please sign in with Google again.',
      });
      return;
    }

    const userRecord = findUserByEmail(verifiedGoogle.email);
    if (!userRecord) {
      logSecurityEvent({
        eventType: 'login_failed',
        userId: null,
        ipAddress,
        userAgent,
        metadata: {
          method: 'google',
          emailHash: hashAuditIdentifier(verifiedGoogle.email),
          reason: 'no_localpro_account',
        },
      });
      res.status(404).json({
        error: `No LocalPro account is registered with ${verifiedGoogle.email}. Please create an account first.`,
      });
      return;
    }

    if (!userRecord.email_verified) {
      markUserEmailVerified(userRecord.id);
    }

    const profile = getPrivateUserProfile(userRecord.id);
    if (!profile) {
      res.status(404).json({ error: 'Account profile could not be loaded.' });
      return;
    }

    const sessionId = crypto.randomUUID();
    createSession({
      id: sessionId,
      userId: profile.id,
      userAgent,
      ipAddress,
      ttlMs: SESSION_TTL_MS,
    });

    const token = signAuthToken(profile.id, sessionId);
    setSessionCookie(req, res, token);

    logSecurityEvent({
      eventType: 'google_signin_success',
      userId: profile.id,
      ipAddress,
      userAgent,
    });

    res.json({ token, user: profile });
  } catch (err) {
    console.error('Google sign-in error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Unable to complete Google sign-in right now.' });
  }
});

// Public: Reset a LocalPro account password using verified Google Gmail ownership
router.post('/auth/google-recovery-reset', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const googleAccessToken = extractGoogleBearerToken(req);
    const body = req.body ?? {};
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
    const ipAddress = getClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    if (!googleAccessToken) {
      res.status(401).json({
        error: 'Please verify your Gmail account with Google before setting a new password.',
      });
      return;
    }

    const strengthError = validateStrongPassword(newPassword);
    if (strengthError) {
      res.status(400).json({ error: strengthError });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation password do not match.' });
      return;
    }

    const verifiedGoogle = await verifyGoogleOAuthAccessToken(googleAccessToken);
    if (!verifiedGoogle) {
      logSecurityEvent({
        eventType: 'password_reset_failed',
        userId: null,
        ipAddress,
        userAgent,
        metadata: { method: 'google', reason: 'invalid_google_token' },
      });
      res.status(401).json({
        error: 'Google verification expired or could not be verified. Please verify with Google again.',
      });
      return;
    }

    const userRecord = findUserByEmail(verifiedGoogle.email);
    if (!userRecord) {
      res.status(404).json({
        error: `No LocalPro account is registered with ${verifiedGoogle.email}.`,
      });
      return;
    }

    const isSameAsCurrent = await verifyPassword(newPassword, userRecord.password_hash);
    if (isSameAsCurrent) {
      res.status(400).json({
        error: 'Your new password cannot be the same as your current password.',
      });
      return;
    }

    const nextHash = await hashPassword(newPassword);
    completeGooglePasswordReset({
      userId: userRecord.id,
      newPasswordHash: nextHash,
    });

    clearSessionCookie(req, res);
    logSecurityEvent({
      eventType: 'google_password_reset_completed',
      userId: userRecord.id,
      ipAddress,
      userAgent,
    });

    res.json({
      success: true,
      email: userRecord.email,
      fullName: userRecord.full_name,
      message:
        'Your LocalPro password has been reset via Gmail verification and all previous sessions have been logged out.',
    });
  } catch (err) {
    console.error('Google recovery reset error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Unable to reset your password via Gmail right now.' });
  }
});

// Public: Verify registration email via single-use verification token
router.post('/auth/verify-email', passwordResetLimiter, (req: Request, res: Response) => {
  const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!rawToken || rawToken.length < 20 || rawToken.length > 256) {
    res.status(400).json({ error: 'Invalid or expired verification link.' });
    return;
  }

  const verifiedUserId = consumeEmailVerificationToken(hashSha256Hex(rawToken));
  if (!verifiedUserId) {
    res.status(400).json({ error: 'This email verification link is invalid, expired, or already used.' });
    return;
  }

  logSecurityEvent({
    eventType: 'email_verified',
    userId: verifiedUserId,
    ipAddress: getClientIp(req),
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  });

  res.json({ success: true, message: 'Your email address has been verified.' });
});

// Protected: Get currently authenticated user's private profile (also works via HttpOnly session cookie)
router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const profile = getPrivateUserProfile(userId);
  if (!profile) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  res.json({ user: profile });
});

// Protected: Add or update user skills and service description after registration
router.put('/profile/skills', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const body = req.body ?? {};
  const hasSkills = Boolean(body.hasSkills);
  const skillDescription =
    typeof body.skillDescription === 'string' ? body.skillDescription.trim().slice(0, 500) : '';

  const allSkills = getAllSkills();
  const validSkillIds = new Set(allSkills.map((s) => s.id));
  const skillIds = hasSkills ? sanitizeSkillIds(body.skillIds, validSkillIds) : [];
  const customSkills = hasSkills ? sanitizeCustomSkills(body.customSkills) : [];

  if (hasSkills && skillIds.length === 0 && customSkills.length === 0) {
    res.status(400).json({
      error: 'Please select at least one predefined skill or add a custom skill.',
    });
    return;
  }

  const updated = updateUserSkills({
    userId,
    hasSkills,
    skillDescription,
    skillIds,
    customSkills,
  });

  if (!updated) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  res.json({ user: updated });
});

// Logout: Revoke server-side session and clear HttpOnly cookie
router.post('/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  const extracted = extractAuthTokenFromRequest(req);
  if (extracted) {
    const payload = verifyAuthToken(extracted.token);
    if (payload) {
      const revoked = revokeSessionById(payload.sid, payload.sub);
      if (revoked) {
        logSecurityEvent({
          eventType: 'session_revoked',
          userId: payload.sub,
          ipAddress: getClientIp(req),
          userAgent:
            typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        });
      }
    }
  }
  clearSessionCookie(req, res);
  res.json({ success: true });
});

export default router;
