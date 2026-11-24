import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import {
  clearSessionCookie,
  hashPassword,
  hashSha256Hex,
  requireAuth,
  SESSION_IDLE_TIMEOUT_MS,
  validateStrongPassword,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import {
  cancelEmailChangeRequest,
  completeEmailChange,
  createEmailChangeRequest,
  createReport,
  deleteUserAccountCascade,
  findUserByEmail,
  findUserById,
  getPendingEmailChange,
  getPrivateUserProfile,
  getRawPostOwner,
  getUserActiveSessions,
  getUserSecurityLogs,
  hasRecentDuplicateReport,
  logSecurityEvent,
  recordFailedEmailChangeAttempt,
  revokeOtherUserSessions,
  revokeSessionById,
  updateUserPasswordHash,
} from '../db.ts';
import {
  AVATAR_UPLOAD_DIR,
  AVATAR_URL_PREFIX,
  POST_UPLOAD_DIR,
  POST_URL_PREFIX,
  safelyDeleteUploadFile,
} from '../imageUtils.ts';
import {
  isSmtpConfigured,
  sendEmailChangeOldEmailNotice,
  sendEmailChangeVerificationCode,
} from '../mailer.ts';
import { createRateLimiter, getClientIp, hashAuditIdentifier } from '../rateLimiter.ts';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_CHANGE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const ALLOWED_REPORT_REASONS = new Set([
  'Spam or misleading content',
  'Scam or fraudulent service',
  'Harassment or abusive behaviour',
  'Inappropriate or unsafe content',
  'Fake profile or impersonation',
  'Other safety concern',
]);

const sensitiveAccountLimiter = createRateLimiter({
  namespace: 'account-sensitive',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many account security attempts. Please wait 15 minutes and try again.',
});

const reportLimiter = createRateLimiter({
  namespace: 'report-create',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  keyBy: 'user',
  message: 'Too many reports submitted recently. Please wait before submitting another report.',
});

function getRequestAuditContext(req: AuthenticatedRequest) {
  return {
    ipAddress: getClientIp(req),
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

// Protected: Change password (requires current password, prevents reuse, revokes other sessions)
router.post(
  '/account/change-password',
  requireAuth,
  sensitiveAccountLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUserId;
      const sessionId = req.authSessionId;
      if (!userId || !sessionId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const body = req.body ?? {};
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
      const logoutOtherDevices = body.logoutOtherDevices !== false;

      if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({
          error: 'Please enter your current password, new password, and confirmation password.',
        });
        return;
      }

      const userRecord = findUserById(userId);
      if (!userRecord) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      const audit = getRequestAuditContext(req);
      const currentMatch = await verifyPassword(currentPassword, userRecord.password_hash);
      if (!currentMatch) {
        logSecurityEvent({
          eventType: 'password_change_failed',
          userId,
          ...audit,
          metadata: { reason: 'incorrect_current_password' },
        });
        res.status(401).json({ error: 'Your current password is incorrect.' });
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

      const isReusedPassword = await verifyPassword(newPassword, userRecord.password_hash);
      if (isReusedPassword) {
        res.status(400).json({
          error: 'Your new password cannot be the same as your current password.',
        });
        return;
      }

      const nextHash = await hashPassword(newPassword);
      updateUserPasswordHash(userId, nextHash);

      let revokedCount = 0;
      if (logoutOtherDevices) {
        revokedCount = revokeOtherUserSessions(userId, sessionId);
      }

      logSecurityEvent({
        eventType: 'password_changed',
        userId,
        ...audit,
        metadata: { loggedOutOtherDevices: logoutOtherDevices, revokedSessions: revokedCount },
      });

      res.json({
        success: true,
        revokedOtherSessions: revokedCount,
        message: logoutOtherDevices
          ? 'Your password has been updated and other active devices have been logged out.'
          : 'Your password has been updated.',
      });
    } catch (err) {
      console.error('Change password error:', err instanceof Error ? err.message : 'Unknown error');
      res.status(500).json({ error: 'Unable to update your password right now.' });
    }
  }
);

// Protected: Get pending email change status (never exposes code_hash)
router.get('/account/email-change', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const pending = getPendingEmailChange(userId);
  if (!pending) {
    res.json({ pending: null, smtpConfigured: isSmtpConfigured() });
    return;
  }
  res.json({
    pending: {
      newEmail: pending.new_email,
      expiresAt: new Date(pending.expires_at).toISOString(),
    },
    smtpConfigured: isSmtpConfigured(),
  });
});

// Protected: Request email address change (requires current password; keeps old email active until verified)
router.post(
  '/account/email-change/request',
  requireAuth,
  sensitiveAccountLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUserId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const body = req.body ?? {};
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';

      if (!currentPassword) {
        res.status(400).json({ error: 'Please enter your current password to authorise this change.' });
        return;
      }
      if (!EMAIL_REGEX.test(newEmail) || newEmail.length > 254) {
        res.status(400).json({ error: 'Please enter a valid new email address.' });
        return;
      }

      const userRecord = findUserById(userId);
      if (!userRecord) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      const audit = getRequestAuditContext(req);
      const currentMatch = await verifyPassword(currentPassword, userRecord.password_hash);
      if (!currentMatch) {
        logSecurityEvent({
          eventType: 'email_change_failed',
          userId,
          ...audit,
          metadata: { reason: 'incorrect_current_password' },
        });
        res.status(401).json({ error: 'Your current password is incorrect.' });
        return;
      }

      if (newEmail === userRecord.email.toLowerCase()) {
        res.status(400).json({ error: 'The new email address must differ from your current email.' });
        return;
      }

      const existingOwner = findUserByEmail(newEmail);
      if (existingOwner) {
        res.status(409).json({
          error: 'That email address is already registered to another LocalPro account.',
        });
        return;
      }

      const rawCode = String(crypto.randomInt(100000, 1000000));
      const codeHash = hashSha256Hex(`${userId}:${newEmail}:${rawCode}`);
      const pending = createEmailChangeRequest({
        userId,
        newEmail,
        codeHash,
        ttlMs: EMAIL_CHANGE_TTL_MS,
      });

      const [verifyMailResult] = await Promise.all([
        sendEmailChangeVerificationCode({
          toNewEmail: newEmail,
          fullName: userRecord.full_name,
          code: rawCode,
          expiresMinutes: 15,
        }),
        sendEmailChangeOldEmailNotice({
          toOldEmail: userRecord.email,
          fullName: userRecord.full_name,
          newEmail,
        }),
      ]);

      logSecurityEvent({
        eventType: 'email_change_requested',
        userId,
        ...audit,
        metadata: {
          newEmailHash: hashAuditIdentifier(newEmail),
          smtpConfigured: verifyMailResult.configured,
          delivered: verifyMailResult.delivered,
        },
      });

      const message = verifyMailResult.delivered
        ? `A 6-digit verification code has been sent to ${newEmail}, and a security alert was sent to your current email. Your email remains unchanged until verified.`
        : `Your email change request to ${newEmail} is pending for 15 minutes (your current email remains active). Automated email delivery requires SMTP configuration in deployment environment variables.`;

      res.json({
        pending,
        smtpConfigured: verifyMailResult.configured,
        delivered: verifyMailResult.delivered,
        message,
      });
    } catch (err) {
      console.error('Email change request error:', err instanceof Error ? err.message : 'Unknown error');
      res.status(500).json({ error: 'Unable to initiate email change right now.' });
    }
  }
);

// Protected: Confirm email change using 6-digit verification code
router.post(
  '/account/email-change/confirm',
  requireAuth,
  sensitiveAccountLimiter,
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
      return;
    }

    const pending = getPendingEmailChange(userId);
    if (!pending) {
      res.status(400).json({
        error: 'No active or unexpired email change verification request was found.',
      });
      return;
    }

    const expectedBuf = Buffer.from(pending.code_hash, 'hex');
    const providedBuf = Buffer.from(
      hashSha256Hex(`${userId}:${pending.new_email}:${code}`),
      'hex'
    );
    const audit = getRequestAuditContext(req);

    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      const attemptOutcome = recordFailedEmailChangeAttempt(userId, 5);
      logSecurityEvent({
        eventType: 'email_change_verification_failed',
        userId,
        ...audit,
        metadata: { lockedOut: attemptOutcome.lockedOut },
      });
      res.status(400).json({
        error: attemptOutcome.lockedOut
          ? 'Too many incorrect codes. Your email change request was cancelled and your existing email remains active.'
          : 'Invalid verification code. Please check the code and try again.',
      });
      return;
    }

    const outcome = completeEmailChange(userId, pending.new_email);
    if (outcome === 'conflict') {
      cancelEmailChangeRequest(userId);
      res.status(409).json({
        error: 'That email address is already registered to another account. Your existing email remains active.',
      });
      return;
    }
    if (outcome === 'not_found') {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    logSecurityEvent({
      eventType: 'email_changed',
      userId,
      ...audit,
      metadata: { newEmailHash: hashAuditIdentifier(pending.new_email) },
    });

    const user = getPrivateUserProfile(userId);
    res.json({
      user,
      message: 'Your email address has been verified and updated.',
    });
  }
);

// Protected: Cancel pending email change request
router.delete('/account/email-change', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const cancelled = cancelEmailChangeRequest(userId);
  if (cancelled) {
    logSecurityEvent({
      eventType: 'email_change_cancelled',
      userId,
      ...getRequestAuditContext(req),
    });
  }
  res.json({ success: true, cancelled });
});

// Protected: List active sessions for the authenticated user
router.get('/account/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  const sessionId = req.authSessionId;
  if (!userId || !sessionId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const sessions = getUserActiveSessions(userId, sessionId, SESSION_IDLE_TIMEOUT_MS);
  res.json({ sessions });
});

// Protected: Log out all other devices while keeping the current session
router.post(
  '/account/sessions/logout-others',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.authUserId;
    const sessionId = req.authSessionId;
    if (!userId || !sessionId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const revokedCount = revokeOtherUserSessions(userId, sessionId);
    logSecurityEvent({
      eventType: 'other_sessions_revoked',
      userId,
      ...getRequestAuditContext(req),
      metadata: { revokedCount },
    });

    const sessions = getUserActiveSessions(userId, sessionId, SESSION_IDLE_TIMEOUT_MS);
    res.json({ revokedCount, sessions });
  }
);

// Protected: Revoke a specific session belonging strictly to the authenticated user
router.delete('/account/sessions/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  const currentSessionId = req.authSessionId;
  if (!userId || !currentSessionId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const targetSessionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!targetSessionId || targetSessionId.length > 64) {
    res.status(400).json({ error: 'Invalid session identifier.' });
    return;
  }

  const revoked = revokeSessionById(targetSessionId, userId);
  if (!revoked) {
    logSecurityEvent({
      eventType: 'unauthorized_session_revoke_attempt',
      userId,
      ...getRequestAuditContext(req),
      metadata: { targetSessionId },
    });
    res.status(403).json({ error: 'You do not have permission to revoke that session.' });
    return;
  }

  if (targetSessionId === currentSessionId) {
    clearSessionCookie(req, res);
  }

  logSecurityEvent({
    eventType: 'session_revoked',
    userId,
    ...getRequestAuditContext(req),
    metadata: { revokedCurrent: targetSessionId === currentSessionId },
  });

  res.json({ success: true, loggedOutCurrent: targetSessionId === currentSessionId });
});

// Protected: Fetch recent security activity logs for the authenticated account
router.get('/account/security-logs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const logs = getUserSecurityLogs(userId, 20);
  res.json({ logs });
});

// Protected: Permanently delete authenticated user's account (requires password reauthentication)
router.post(
  '/account/delete',
  requireAuth,
  sensitiveAccountLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUserId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      if (!currentPassword) {
        res.status(400).json({ error: 'Please enter your current password to confirm account deletion.' });
        return;
      }

      const userRecord = findUserById(userId);
      if (!userRecord) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      const audit = getRequestAuditContext(req);
      const isMatch = await verifyPassword(currentPassword, userRecord.password_hash);
      if (!isMatch) {
        logSecurityEvent({
          eventType: 'account_delete_failed',
          userId,
          ...audit,
          metadata: { reason: 'incorrect_password' },
        });
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const outcome = deleteUserAccountCascade(userId);
      if (!outcome.deleted) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      if (outcome.avatarUrl) {
        safelyDeleteUploadFile(outcome.avatarUrl, AVATAR_URL_PREFIX, AVATAR_UPLOAD_DIR);
      }
      for (const imageUrl of outcome.postImageUrls) {
        safelyDeleteUploadFile(imageUrl, POST_URL_PREFIX, POST_UPLOAD_DIR);
      }

      clearSessionCookie(req, res);
      logSecurityEvent({
        eventType: 'account_deleted',
        userId: null,
        ...audit,
        metadata: { deletedUserHash: hashAuditIdentifier(userId) },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Delete account error:', err instanceof Error ? err.message : 'Unknown error');
      res.status(500).json({ error: 'Unable to delete account right now.' });
    }
  }
);

// Protected: Report inappropriate post or user account
router.post(
  '/reports',
  requireAuth,
  reportLimiter,
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = req.body ?? {};
    const targetType = body.targetType === 'post' || body.targetType === 'user' ? body.targetType : null;
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 500) : '';

    if (!targetType || !targetId || targetId.length > 64) {
      res.status(400).json({ error: 'Invalid report target.' });
      return;
    }

    if (!ALLOWED_REPORT_REASONS.has(reason)) {
      res.status(400).json({ error: 'Please select a valid report reason.' });
      return;
    }

    if (targetType === 'user') {
      if (targetId === userId) {
        res.status(400).json({ error: 'You cannot report your own account.' });
        return;
      }
      if (!findUserById(targetId)) {
        res.status(404).json({ error: 'Reported account not found.' });
        return;
      }
    } else {
      const postOwner = getRawPostOwner(targetId);
      if (!postOwner) {
        res.status(404).json({ error: 'Reported post not found.' });
        return;
      }
      if (postOwner.author_id === userId) {
        res.status(400).json({ error: 'You cannot report your own post.' });
        return;
      }
    }

    if (hasRecentDuplicateReport(userId, targetType, targetId)) {
      res.status(409).json({
        error: 'You have already submitted an open report for this item.',
      });
      return;
    }

    const report = createReport({
      id: crypto.randomUUID(),
      reporterUserId: userId,
      targetType,
      targetId,
      reason,
      details,
      createdAt: new Date().toISOString(),
    });

    logSecurityEvent({
      eventType: 'report_submitted',
      userId,
      ...getRequestAuditContext(req),
      metadata: { targetType, targetId, reason },
    });

    res.status(201).json({
      report,
      message: 'Thank you. Your report has been recorded for review.',
    });
  }
);

export default router;
