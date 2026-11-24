import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  confirmPasswordReset,
  fetchRecoveryStatus,
  loginAccount,
  requestPasswordReset,
  resetPasswordWithGoogleToken,
  signInWithGoogleToken,
  verifyEmailToken,
} from '../services/authApi';
import {
  getGmailAccessToken,
  googleSignIn,
  logoutGoogle,
  sendGmailMessage,
} from '../services/gmailAuth';
import type { AuthResponse, AuthView } from '../types/auth';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LoginPageProps {
  onNavigate: (view: AuthView) => void;
  onAuthSuccess: (response: AuthResponse) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateStrongPasswordClient(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters long.';
  }
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'Password must include uppercase, lowercase, a number, and a special character.';
  }
  return null;
}

export function LoginPage({ onNavigate, onAuthSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset' | 'google-reset'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [infoBanner, setInfoBanner] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetSmtpConfigured, setResetSmtpConfigured] = useState<boolean | null>(null);
  const [resetError, setResetError] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Complete password reset state (email token)
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [completeResetError, setCompleteResetError] = useState('');
  const [isCompletingReset, setIsCompletingReset] = useState(false);

  // Google-verified Gmail recovery reset state
  const [verifiedGoogleEmail, setVerifiedGoogleEmail] = useState('');
  const [googleNewPassword, setGoogleNewPassword] = useState('');
  const [googleConfirmPassword, setGoogleConfirmPassword] = useState('');
  const [showGooglePassword, setShowGooglePassword] = useState(false);
  const [googleResetError, setGoogleResetError] = useState('');
  const [isGoogleResetting, setIsGoogleResetting] = useState(false);

  // Explicit confirmation modal state before calling Gmail send API
  const [gmailNoticeModal, setGmailNoticeModal] = useState<{
    email: string;
    fullName: string;
    resetMessage: string;
  } | null>(null);
  const [isSendingGmailNotice, setIsSendingGmailNotice] = useState(false);
  const [gmailNoticeError, setGmailNoticeError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetTokenParam = params.get('resetToken')?.trim();
    const verifyTokenParam = params.get('verifyToken')?.trim();

    if (resetTokenParam) {
      setResetTokenInput(resetTokenParam);
      setMode('reset');
      return;
    }

    if (verifyTokenParam) {
      verifyEmailToken(verifyTokenParam)
        .then((res) => {
          setInfoBanner(res.message);
        })
        .catch((err) => {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to verify your email address.'
          );
        });
    }
  }, []);

  useEffect(() => {
    if (mode !== 'forgot') return;
    let cancelled = false;
    fetchRecoveryStatus()
      .then((status) => {
        if (!cancelled) {
          setResetSmtpConfigured(status.emailDeliveryConfigured);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage('');
    setInfoBanner('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await loginAccount({
        email: trimmedEmail,
        password,
      });
      onAuthSuccess(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to sign in right now. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setErrorMessage('');
    setInfoBanner('');
    setIsGoogleSigningIn(true);
    try {
      const googleAuth = await googleSignIn();
      const response = await signInWithGoogleToken(googleAuth.accessToken);
      onAuthSuccess(response);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to complete Google sign-in right now.'
      );
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  async function handleStartGoogleRecovery() {
    setResetError('');
    setResetStatus('');
    setGoogleResetError('');
    setIsGoogleSigningIn(true);
    try {
      const googleAuth = await googleSignIn();
      if (!googleAuth.email) {
        throw new Error('Google did not return an email address for this account.');
      }
      setVerifiedGoogleEmail(googleAuth.email);
      setGoogleNewPassword('');
      setGoogleConfirmPassword('');
      setMode('google-reset');
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : 'Unable to verify your Gmail account right now.'
      );
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  async function handleGoogleRecoveryResetSubmit(e: FormEvent) {
    e.preventDefault();
    setGoogleResetError('');

    const googleToken = getGmailAccessToken();
    if (!googleToken) {
      setGoogleResetError('Your Gmail verification session expired. Please verify with Google again.');
      return;
    }

    const strengthErr = validateStrongPasswordClient(googleNewPassword);
    if (strengthErr) {
      setGoogleResetError(strengthErr);
      return;
    }

    if (googleNewPassword !== googleConfirmPassword) {
      setGoogleResetError('New password and confirmation password do not match.');
      return;
    }

    setIsGoogleResetting(true);
    try {
      const res = await resetPasswordWithGoogleToken(googleToken, {
        newPassword: googleNewPassword,
        confirmPassword: googleConfirmPassword,
      });
      setGoogleNewPassword('');
      setGoogleConfirmPassword('');
      setEmail(res.email);
      setGmailNoticeError('');
      setGmailNoticeModal({
        email: res.email,
        fullName: res.fullName || 'LocalPro member',
        resetMessage: res.message,
      });
    } catch (err) {
      setGoogleResetError(
        err instanceof Error ? err.message : 'Unable to reset your password right now.'
      );
    } finally {
      setIsGoogleResetting(false);
    }
  }

  async function handleConfirmSendGmailNotice() {
    if (!gmailNoticeModal) return;
    setGmailNoticeError('');
    setIsSendingGmailNotice(true);
    try {
      const timestamp = new Date().toLocaleString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      await sendGmailMessage({
        to: gmailNoticeModal.email,
        subject: 'LocalPro security confirmation: Password updated',
        body: [
          `Hi ${gmailNoticeModal.fullName},`,
          '',
          `Your LocalPro account password was reset via Gmail verification on ${timestamp}.`,
          'All previous active sessions on other devices have been logged out for your security.',
          '',
          'If you did not make this change, sign in immediately and secure your Google and LocalPro accounts.',
          '',
          'LocalPro Security',
        ].join('\n'),
      });
      const doneMessage = `${gmailNoticeModal.resetMessage} Confirmation email sent to ${gmailNoticeModal.email}.`;
      setGmailNoticeModal(null);
      setMode('login');
      setInfoBanner(doneMessage);
    } catch (err) {
      setGmailNoticeError(
        err instanceof Error ? err.message : 'Unable to send confirmation email via Gmail.'
      );
    } finally {
      setIsSendingGmailNotice(false);
    }
  }

  function handleSkipGmailNotice() {
    if (!gmailNoticeModal) return;
    const doneMessage = gmailNoticeModal.resetMessage;
    setGmailNoticeModal(null);
    setMode('login');
    setInfoBanner(doneMessage);
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetStatus('');
    setResetSmtpConfigured(null);

    const trimmed = resetEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setIsSendingReset(true);
    try {
      const result = await requestPasswordReset(trimmed);
      setResetStatus(result.message);
      setResetSmtpConfigured(result.smtpConfigured ?? null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to process password reset right now.';
      setResetError(message);
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleCompleteReset(e: FormEvent) {
    e.preventDefault();
    setCompleteResetError('');

    const trimmedToken = resetTokenInput.trim();
    if (!trimmedToken) {
      setCompleteResetError('Please paste the reset token sent to your email.');
      return;
    }

    const strengthErr = validateStrongPasswordClient(newResetPassword);
    if (strengthErr) {
      setCompleteResetError(strengthErr);
      return;
    }

    if (newResetPassword !== confirmResetPassword) {
      setCompleteResetError('New password and confirmation password do not match.');
      return;
    }

    setIsCompletingReset(true);
    try {
      const res = await confirmPasswordReset({
        token: trimmedToken,
        newPassword: newResetPassword,
        confirmPassword: confirmResetPassword,
      });
      setResetTokenInput('');
      setNewResetPassword('');
      setConfirmResetPassword('');
      setMode('login');
      setInfoBanner(res.message);
    } catch (err) {
      setCompleteResetError(
        err instanceof Error ? err.message : 'Unable to reset your password.'
      );
    } finally {
      setIsCompletingReset(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
      <div className="glass-panel rounded-3xl p-6 sm:p-10">
        {mode === 'login' && (
          <>
            <div className="space-y-2 border-b border-slate-200/80 pb-6">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[#0D9488]">Welcome back</span>
                <button
                  type="button"
                  onClick={() => onNavigate('landing')}
                  className="text-xs font-semibold text-slate-500 transition-colors hover:text-[#0B1F3A]"
                >
                  Back to home
                </button>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
                Sign in to LocalPro
              </h1>
              <p className="text-sm text-slate-600">
                Access your account and manage your local skills profile.
              </p>
            </div>

            {infoBanner && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F766E]"
              >
                {infoBanner}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="you@example.com"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-[#0B1F3A]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetError('');
                      setResetStatus('');
                      setResetSmtpConfigured(null);
                      setMode('forgot');
                    }}
                    className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    placeholder="Enter your password"
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 py-2.5 pl-3.5 pr-11 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-[#0B1F3A]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || isGoogleSigningIn}
                className="btn-royal inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <span>{isSubmitting ? 'Signing in...' : 'Login'}</span>
                {!isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200/80" />
              <span className="text-xs font-medium text-slate-500">or continue with</span>
              <div className="h-px flex-1 bg-slate-200/80" />
            </div>

            <GoogleSignInButton
              label={isGoogleSigningIn ? 'Connecting Google...' : 'Sign in with Google'}
              disabled={isSubmitting || isGoogleSigningIn}
              onClick={handleGoogleLogin}
            />

            <div className="mt-7 border-t border-slate-200/80 pt-6 text-center text-sm text-slate-600">
              New to LocalPro?{' '}
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="font-semibold text-[#1D4ED8] hover:underline"
              >
                Create an account
              </button>
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <div className="space-y-2 border-b border-slate-200/80 pb-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                <span>Account recovery</span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                Reset your password
              </h1>
              <p className="text-sm text-slate-600">
                Recover quickly with your Gmail account or request a single-use reset link by email.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-[#BFDBFE] bg-white/85 p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3A]">
                    Instant recovery with Gmail
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    Verify ownership of your registered Gmail address via Google to choose a new
                    password immediately.
                  </p>
                </div>
              </div>
              <GoogleSignInButton
                label={isGoogleSigningIn ? 'Verifying Gmail...' : 'Sign in with Google'}
                disabled={isGoogleSigningIn || isSendingReset}
                onClick={handleStartGoogleRecovery}
              />
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200/80" />
              <span className="text-xs font-medium text-slate-500">or email a reset link</span>
              <div className="h-px flex-1 bg-slate-200/80" />
            </div>

            {resetSmtpConfigured === false && !resetStatus && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-950">
                Email link delivery requires <span className="font-semibold">GMAIL_USER</span> and{' '}
                <span className="font-semibold">GMAIL_APP_PASSWORD</span> in{' '}
                <span className="font-semibold">Settings → Secrets</span>. Until those are added,
                use <span className="font-semibold">Sign in with Google</span> above to reset your
                password immediately.
              </div>
            )}

            <form onSubmit={handleForgotSubmit} noValidate className="space-y-5">
              <div>
                <label
                  htmlFor="reset-email"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    if (resetError) setResetError('');
                  }}
                  placeholder="you@example.com"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>

              {resetError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
                >
                  {resetError}
                </div>
              )}

              {resetStatus && (
                <div
                  role="status"
                  className={
                    resetSmtpConfigured === false
                      ? 'space-y-3 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950'
                      : 'rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm text-[#0F766E]'
                  }
                >
                  <p>{resetStatus}</p>
                  {resetSmtpConfigured === false && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200/80 pt-2.5 text-xs">
                      <span className="font-medium text-amber-900">
                        Tip: Use Google Sign-In above to reset your password right away without SMTP.
                      </span>
                      <button
                        type="button"
                        onClick={handleStartGoogleRecovery}
                        disabled={isGoogleSigningIn}
                        className="font-semibold text-[#1D4ED8] hover:underline disabled:opacity-60"
                      >
                        {isGoogleSigningIn ? 'Verifying...' : 'Recover with Google now'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Login</span>
                </button>

                <button
                  type="submit"
                  disabled={isSendingReset || isGoogleSigningIn}
                  className="btn-royal inline-flex min-h-[46px] items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
                >
                  {isSendingReset ? 'Submitting...' : 'Request Reset Link'}
                </button>
              </div>

              <div className="border-t border-slate-200/80 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setCompleteResetError('');
                    setMode('reset');
                  }}
                  className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                >
                  Already have a reset token? Set a new password
                </button>
              </div>
            </form>
          </>
        )}

        {mode === 'google-reset' && (
          <>
            <div className="space-y-2 border-b border-slate-200/80 pb-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Gmail verified</span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                Choose a new password
              </h1>
              <p className="text-sm text-slate-600">
                Verified Google account:{' '}
                <span className="font-semibold text-[#0B1F3A]">{verifiedGoogleEmail}</span>
              </p>
            </div>

            <form onSubmit={handleGoogleRecoveryResetSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="google-reset-new-password"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="google-reset-new-password"
                    type={showGooglePassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={googleNewPassword}
                    onChange={(e) => {
                      setGoogleNewPassword(e.target.value);
                      if (googleResetError) setGoogleResetError('');
                    }}
                    placeholder="10+ chars, upper, lower, number & symbol"
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 py-2.5 pl-3.5 pr-11 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGooglePassword((prev) => !prev)}
                    aria-label={showGooglePassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-[#0B1F3A]"
                  >
                    {showGooglePassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="google-reset-confirm-password"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  Confirm new password
                </label>
                <input
                  id="google-reset-confirm-password"
                  type={showGooglePassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={googleConfirmPassword}
                  onChange={(e) => {
                    setGoogleConfirmPassword(e.target.value);
                    if (googleResetError) setGoogleResetError('');
                  }}
                  placeholder="Re-enter new password"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>

              {googleResetError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
                >
                  {googleResetError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    void logoutGoogle();
                    setMode('forgot');
                  }}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={isGoogleResetting}
                  className="btn-royal inline-flex min-h-[46px] items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
                >
                  {isGoogleResetting ? 'Updating Password...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </>
        )}

        {mode === 'reset' && (
          <>
            <div className="space-y-2 border-b border-slate-200/80 pb-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>Single-use token verification</span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                Set a new password
              </h1>
              <p className="text-sm text-slate-600">
                Enter your time-limited reset token and choose a strong new password.
              </p>
            </div>

            <form onSubmit={handleCompleteReset} noValidate className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="reset-token-input"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  Reset token
                </label>
                <input
                  id="reset-token-input"
                  type="text"
                  value={resetTokenInput}
                  onChange={(e) => {
                    setResetTokenInput(e.target.value);
                    if (completeResetError) setCompleteResetError('');
                  }}
                  placeholder="Paste single-use reset token"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="reset-new-password"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="reset-new-password"
                    type={showResetPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newResetPassword}
                    onChange={(e) => {
                      setNewResetPassword(e.target.value);
                      if (completeResetError) setCompleteResetError('');
                    }}
                    placeholder="10+ chars, upper, lower, number & symbol"
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 py-2.5 pl-3.5 pr-11 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((prev) => !prev)}
                    aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-[#0B1F3A]"
                  >
                    {showResetPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-confirm-password"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  Confirm new password
                </label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmResetPassword}
                  onChange={(e) => {
                    setConfirmResetPassword(e.target.value);
                    if (completeResetError) setCompleteResetError('');
                  }}
                  placeholder="Re-enter new password"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>

              {completeResetError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
                >
                  {completeResetError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-white"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Login</span>
                </button>

                <button
                  type="submit"
                  disabled={isCompletingReset}
                  className="btn-royal inline-flex min-h-[46px] items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
                >
                  {isCompletingReset ? 'Updating...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Explicit confirmation dialog before sending a confirmation email via Gmail */}
      {gmailNoticeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gmail-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
        >
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 sm:p-7 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#0D9488]" aria-hidden="true" />
              <div>
                <h2 id="gmail-confirm-title" className="font-display text-lg font-bold text-[#0B1F3A]">
                  Send recovery confirmation email?
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Your LocalPro password has been updated. Would you like to send a security
                  confirmation email to your Gmail inbox?
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 text-xs text-slate-700 space-y-1">
              <p>
                <span className="font-semibold text-[#0B1F3A]">To:</span> {gmailNoticeModal.email}
              </p>
              <p>
                <span className="font-semibold text-[#0B1F3A]">Subject:</span> LocalPro security
                confirmation: Password updated
              </p>
            </div>

            {gmailNoticeError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {gmailNoticeError}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleSkipGmailNotice}
                disabled={isSendingGmailNotice}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
              >
                Skip &amp; Continue
              </button>
              <button
                type="button"
                onClick={handleConfirmSendGmailNotice}
                disabled={isSendingGmailNotice}
                className="btn-royal min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-65"
              >
                {isSendingGmailNotice ? 'Sending via Gmail...' : 'Confirm & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
