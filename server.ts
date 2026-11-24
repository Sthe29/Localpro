import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getAllowedOriginSet, isHttpsRequest, requireCsrfForCookieAuth } from './server/auth.ts';
import { pruneExpiredSecurityRecords } from './server/db.ts';
import authRoutes from './server/routes/authRoutes.ts';
import enquiryRoutes from './server/routes/enquiryRoutes.ts';
import notificationRoutes from './server/routes/notificationRoutes.ts';
import postRoutes, { POST_UPLOAD_DIR } from './server/routes/postRoutes.ts';
import profileRoutes, { AVATAR_UPLOAD_DIR } from './server/routes/profileRoutes.ts';
import securityRoutes from './server/routes/securityRoutes.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Behind reverse proxies (Cloud Run / Nginx), trust first hop for accurate protocol and client IP
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Production HTTPS enforcement (never open-redirect untrusted hosts)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isProd) {
      const proto = req.headers['x-forwarded-proto'];
      const isHttps = req.secure || (typeof proto === 'string' && proto.split(',')[0].trim() === 'https');
      if (!isHttps) {
        const rawHost =
          (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
          req.headers.host ||
          '';
        const firstHost = rawHost.split(',')[0].trim();
        const isSafeHost = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(firstHost);
        const isLocalHost =
          firstHost.startsWith('localhost') ||
          firstHost.startsWith('127.0.0.1') ||
          firstHost.startsWith('[::1]');
        if (isSafeHost && !isLocalHost) {
          res.redirect(301, `https://${firstHost}${req.originalUrl}`);
          return;
        }
      }
    }
    next();
  });

  // Security headers (CSP with frame-ancestors compatible with AI Studio iframe preview, HSTS, MIME sniffing lock)
  const frameAncestors =
    process.env.CSP_FRAME_ANCESTORS?.trim() ||
    "'self' https://aistudio.google.com https://*.googleusercontent.com";

  app.use((req: Request, res: Response, next: NextFunction) => {
    const scriptSrc = isProd
      ? "script-src 'self' https://apis.google.com https://accounts.google.com https://www.gstatic.com"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com";
    const connectSrc = isProd
      ? "connect-src 'self' https://*.googleapis.com https://accounts.google.com https://*.firebaseapp.com"
      : "connect-src 'self' ws: wss: https://*.googleapis.com https://accounts.google.com https://*.firebaseapp.com";
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      connectSrc,
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${frameAncestors}`,
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    if (isProd && isHttpsRequest(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Strict CORS allowlist (never wildcard '*' on authenticated endpoints)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (originHeader) {
      const allowedOrigins = getAllowedOriginSet(req);
      if (allowedOrigins.has(originHeader)) {
        res.setHeader('Access-Control-Allow-Origin', originHeader);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With'
        );
      } else {
        res.status(403).json({ error: 'Cross-origin request denied.' });
        return;
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Parse JSON payloads (binary image upload routes use their own express.raw parser)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      (req.path === '/api/profile/avatar' || req.path === '/api/posts/upload-image') &&
      req.method === 'POST'
    ) {
      next();
      return;
    }
    express.json({ limit: '100kb' })(req, res, next);
  });

  // Serve uploaded avatar images with sandboxed headers to prevent active content execution
  const uploadStaticHeaders = (res: Response) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  };

  app.use(
    '/uploads/avatars',
    express.static(AVATAR_UPLOAD_DIR, {
      fallthrough: false,
      index: false,
      maxAge: '1h',
      setHeaders: uploadStaticHeaders,
    })
  );
  app.use('/uploads/avatars', (_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(404).json({ error: 'Avatar image not found.' });
  });

  // Serve uploaded post images with sandboxed headers
  app.use(
    '/uploads/posts',
    express.static(POST_UPLOAD_DIR, {
      fallthrough: false,
      index: false,
      maxAge: '1h',
      setHeaders: uploadStaticHeaders,
    })
  );
  app.use('/uploads/posts', (_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(404).json({ error: 'Post image not found.' });
  });

  // Enforce CSRF protection on cookie-authenticated API mutations
  app.use('/api', requireCsrfForCookieAuth);

  // API Routes
  app.use('/api', authRoutes);
  app.use('/api', securityRoutes);
  app.use('/api', profileRoutes);
  app.use('/api', postRoutes);
  app.use('/api', enquiryRoutes);
  app.use('/api', notificationRoutes);

  // Explicit 404 for unknown API endpoints
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Safe JSON error handler for malformed payloads / unexpected server errors (never leaks stack traces)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    if (status === 400 || status === 413) {
      res.status(status).json({
        error: status === 413 ? 'Request payload exceeds maximum allowed size.' : 'Invalid request payload.',
      });
      return;
    }
    console.error('Unhandled LocalPro server error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
  });

  // Periodically prune expired rate limits, tokens, and old revoked sessions
  pruneExpiredSecurityRecords();
  const cleanupTimer = setInterval(() => {
    try {
      pruneExpiredSecurityRecords();
    } catch {
      // Ignore cleanup errors
    }
  }, 6 * 60 * 60 * 1000);
  cleanupTimer.unref();

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LocalPro server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LocalPro server:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
