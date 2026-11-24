import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { consumeRateLimit, logSecurityEvent } from './db.ts';
import type { AuthenticatedRequest } from './auth.ts';

export function getClientIp(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return ip.slice(0, 64);
}

export function hashAuditIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export interface RateLimitRuleOptions {
  namespace: string;
  maxRequests: number;
  windowMs: number;
  keyBy?: 'ip' | 'user' | 'ip_and_body_email';
  message?: string;
}

export function createRateLimiter(options: RateLimitRuleOptions) {
  const keyMode = options.keyBy ?? 'ip';
  const defaultMessage =
    options.message ?? 'Too many requests. Please wait a moment and try again.';

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const authUserId = (req as AuthenticatedRequest).authUserId;

    let subjectKey = ip;
    if (keyMode === 'user') {
      subjectKey = authUserId ? `u:${authUserId}` : `ip:${ip}`;
    } else if (keyMode === 'ip_and_body_email') {
      const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      subjectKey = rawEmail ? `ip:${ip}:em:${hashAuditIdentifier(rawEmail)}` : `ip:${ip}`;
    } else {
      subjectKey = `ip:${ip}`;
    }

    const bucketKey = `${options.namespace}:${subjectKey}`;
    const result = consumeRateLimit(bucketKey, options.maxRequests, options.windowMs);

    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      logSecurityEvent({
        eventType: 'rate_limit_exceeded',
        userId: authUserId ?? null,
        ipAddress: ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: {
          namespace: options.namespace,
          path: req.path,
          method: req.method,
          retryAfterSeconds: result.retryAfterSeconds,
        },
      });
      res.status(429).json({ error: defaultMessage });
      return;
    }

    next();
  };
}
