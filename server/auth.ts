import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { promisify } from 'node:util';
import {
  findUserById,
  getActiveSessionById,
  logSecurityEvent,
  touchSessionActivity,
} from './db.ts';

const scryptAsync = promisify(crypto.scrypt);

// Read signing key from environment or generate an ephemeral per-process 256-bit key
const SESSION_SECRET: Buffer = process.env.SESSION_SECRET
  ? Buffer.from(process.env.SESSION_SECRET, 'utf8')
  : crypto.randomBytes(32);

export const SESSION_COOKIE_NAME = 'localpro_session';
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days absolute expiration
export const SESSION_TTL_MS = TOKEN_TTL_SECONDS * 1000;

const configuredIdleMins = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES);
export const SESSION_IDLE_TIMEOUT_MS =
  Number.isFinite(configuredIdleMins) && configuredIdleMins > 0
    ? configuredIdleMins * 60_000
    : 24 * 60 * 60_000; // 24 hours inactivity timeout

export interface AuthenticatedRequest extends Request {
  authUserId?: string;
  authSessionId?: string;
  authMethod?: 'bearer' | 'cookie';
}

interface TokenPayload {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

export function hashSha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function validateStrongPassword(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g. !@#$%^&*).';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signAuthToken(userId: string, sessionId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: userId,
      sid: sessionId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    } satisfies TokenPayload)
  );
  const data = `${header}.${payload}`;
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) {
    return null;
  }
  const data = `${header}.${payload}`;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payload)) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.sub || !decoded.sid || typeof decoded.exp !== 'number' || decoded.exp < now) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawValue = part.slice(eqIndex + 1).trim();
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch {
      out[key] = rawValue;
    }
  }
  return out;
}

export function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const protoHeader = req.headers['x-forwarded-proto'];
  if (typeof protoHeader === 'string') {
    const firstProto = protoHeader.split(',')[0].trim().toLowerCase();
    if (firstProto === 'https') return true;
  }
  return process.env.NODE_ENV === 'production';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const https = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${TOKEN_TTL_SECONDS}`,
  ];
  if (https) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (https) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function extractAuthTokenFromRequest(req: Request): {
  token: string;
  method: 'bearer' | 'cookie';
} | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return { token, method: 'bearer' };
    }
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    return { token: cookieToken, method: 'cookie' };
  }

  return null;
}

export function getAllowedOriginSet(req: Request): Set<string> {
  const allowed = new Set<string>();
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of envOrigins) {
    try {
      allowed.add(new URL(origin).origin);
    } catch {
      // Ignore malformed env origin
    }
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && appUrl !== 'MY_APP_URL') {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      // Ignore invalid placeholder URL
    }
  }

  const rawHost =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    req.headers.host;
  if (rawHost) {
    const firstHost = rawHost.split(',')[0].trim();
    allowed.add(`https://${firstHost}`);
    allowed.add(`http://${firstHost}`);
  }

  return allowed;
}

export function requireCsrfForCookieAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  // Explicit Bearer authorization is not sent automatically by browsers (not vulnerable to CSRF)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // For cookie-authenticated or browser-triggered state-changing requests, verify origin + custom header
  const cookies = parseCookieHeader(req.headers.cookie);
  const hasSessionCookie = Boolean(cookies[SESSION_COOKIE_NAME]);

  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer : '';
  const allowedOrigins = getAllowedOriginSet(req);

  if (originHeader) {
    if (!allowedOrigins.has(originHeader)) {
      logSecurityEvent({
        eventType: 'csrf_blocked',
        ipAddress: req.ip || null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { reason: 'origin_mismatch', path: req.path },
      });
      res.status(403).json({ error: 'Request origin is not permitted.' });
      return;
    }
  } else if (refererHeader && hasSessionCookie) {
    try {
      const refOrigin = new URL(refererHeader).origin;
      if (!allowedOrigins.has(refOrigin)) {
        logSecurityEvent({
          eventType: 'csrf_blocked',
          ipAddress: req.ip || null,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
          metadata: { reason: 'referer_mismatch', path: req.path },
        });
        res.status(403).json({ error: 'Request origin is not permitted.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid request referer.' });
      return;
    }
  }

  if (hasSessionCookie) {
    const requestedWith = req.headers['x-requested-with'];
    if (!requestedWith || typeof requestedWith !== 'string') {
      logSecurityEvent({
        eventType: 'csrf_blocked',
        ipAddress: req.ip || null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { reason: 'missing_csrf_header', path: req.path },
      });
      res.status(403).json({ error: 'CSRF protection check failed. Missing request header.' });
      return;
    }
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const extracted = extractAuthTokenFromRequest(req);
  if (!extracted) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const payload = verifyAuthToken(extracted.token);
  if (!payload) {
    if (extracted.method === 'cookie') {
      clearSessionCookie(req, res);
    }
    res.status(401).json({ error: 'Your session has expired or is invalid. Please sign in again.' });
    return;
  }

  const activeSession = getActiveSessionById(payload.sid, SESSION_IDLE_TIMEOUT_MS);
  if (!activeSession || activeSession.user_id !== payload.sub) {
    if (extracted.method === 'cookie') {
      clearSessionCookie(req, res);
    }
    res.status(401).json({ error: 'Your session has expired or been logged out. Please sign in again.' });
    return;
  }

  const user = findUserById(payload.sub);
  if (!user) {
    if (extracted.method === 'cookie') {
      clearSessionCookie(req, res);
    }
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }

  touchSessionActivity(payload.sid);
  req.authUserId = payload.sub;
  req.authSessionId = payload.sid;
  req.authMethod = extracted.method;
  next();
}
