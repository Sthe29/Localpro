import {
  Activity,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  getConnectedGoogleUser,
  getGmailAccessToken,
  googleSignIn,
  initGoogleAuth,
  logoutGoogle,
  sendGmailMessage,
} from '../services/gmailAuth';
import {
  cancelEmailChange,
  changePasswordRequest,
  confirmEmailChange,
  deleteAccountRequest,
  fetchActiveSessions,
  fetchPendingEmailChange,
  fetchSecurityLogs,
  logoutOtherSessionsRequest,
  requestEmailChange,
  revokeSingleSessionRequest,
} from '../services/securityApi';
import type {
  AppView,
  PendingEmailChange,
  SecurityLogItem,
  SessionInfo,
  UserProfile,
} from '../types/auth';
import { GoogleSignInButton } from './GoogleSignInButton';

interface AccountSettingsViewProps {
  user: UserProfile;
  authToken: string;
  onNavigate: (view: AppView) => void;
  onUserUpdated: (updated: UserProfile) => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
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

function formatSecurityTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeSecurityEvent(eventType: string): string {
  switch (eventType) {
    case 'login_success':
      return 'Signed in successfully';
    case 'login_failed':
      return 'Failed sign-in attempt';
    case 'register_success':
      return 'Account created';
    case 'password_changed':
      return 'Password updated';
    case 'password_change_failed':
      return 'Password change failed (incorrect current password)';
    case 'password_reset_requested':
      return 'Password reset requested';
    case 'password_reset_completed':
      return 'Password reset completed';
    case 'email_change_requested':
      return 'Email change verification requested';
    case 'email_change_failed':
      return 'Email change blocked (incorrect password)';
    case 'email_change_verification_failed':
      return 'Email verification code mismatch';
    case 'email_changed':
      return 'Email address verified & updated';
    case 'email_change_cancelled':
      return 'Pending email change cancelled';
    case 'email_verified':
      return 'Email address verified';
    case 'google_signin_success':
      return 'Signed in with Google';
    case 'google_password_reset_completed':
      return 'Password reset via Gmail verification';
    case 'other_sessions_revoked':
      return 'Logged out all other devices';
    case 'session_revoked':
      return 'Session logged out';
    case 'rate_limit_exceeded':
      return 'Rate limit protection triggered';
    case 'unauthorized_access_attempt':
      return 'Blocked unauthorized action attempt';
    case 'upload_rejected':
      return 'Unsupported file upload blocked';
    case 'report_submitted':
      return 'Safety report submitted';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

export function AccountSettingsView({
  user,
  authToken,
  onNavigate,
  onUserUpdated,
  onLogout,
  onAccountDeleted,
}: AccountSettingsViewProps) {
  const joinedFullDate = new Date(user.createdAt).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [logoutOtherDevices, setLogoutOtherDevices] = useState(true);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Change email state
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [pendingEmailChange, setPendingEmailChange] = useState<PendingEmailChange | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [emailVerifyCode, setEmailVerifyCode] = useState('');
  const [emailRequesting, setEmailRequesting] = useState(false);
  const [emailConfirming, setEmailConfirming] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  // Sessions & security activity state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionActionError, setSessionActionError] = useState('');
  const [sessionActionMessage, setSessionActionMessage] = useState('');
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Connected Gmail recovery state (token held strictly in memory)
  const [gmailConnectedEmail, setGmailConnectedEmail] = useState<string | null>(() =>
    getGmailAccessToken() ? getConnectedGoogleUser()?.email ?? null : null
  );
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailError, setGmailError] = useState('');
  const [gmailSuccess, setGmailSuccess] = useState('');
  const [gmailConfirmOpen, setGmailConfirmOpen] = useState(false);
  const [gmailSendingTest, setGmailSendingTest] = useState(false);

  // Account deletion state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadSecurityState = useCallback(async () => {
    setSessionsLoading(true);
    setLogsLoading(true);
    try {
      const [pendingRes, activeSessions, recentLogs] = await Promise.all([
        fetchPendingEmailChange(authToken),
        fetchActiveSessions(authToken),
        fetchSecurityLogs(authToken),
      ]);
      setPendingEmailChange(pendingRes.pending);
      setSmtpConfigured(pendingRes.smtpConfigured);
      setSessions(activeSessions);
      setSecurityLogs(recentLogs);
    } catch {
      // Keep UI graceful if a background fetch errors
    } finally {
      setSessionsLoading(false);
      setLogsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void loadSecurityState();
  }, [loadSecurityState]);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (googleUser) => {
        setGmailConnectedEmail(googleUser.email ?? null);
      },
      () => {
        setGmailConnectedEmail(null);
      }
    );
    return unsubscribe;
  }, []);

  async function handleConnectGmail() {
    setGmailError('');
    setGmailSuccess('');
    setGmailConnecting(true);
    try {
      const res = await googleSignIn();
      setGmailConnectedEmail(res.email || user.email);
      setGmailSuccess(
        `Connected ${res.email || 'your Google account'} for password recovery in this session.`
      );
    } catch (err) {
      setGmailError(
        err instanceof Error ? err.message : 'Unable to connect Google right now.'
      );
    } finally {
      setGmailConnecting(false);
    }
  }

  async function handleDisconnectGmail() {
    setGmailError('');
    setGmailSuccess('');
    await logoutGoogle();
    setGmailConnectedEmail(null);
    setGmailSuccess('Disconnected Google from this browser session.');
  }

  async function handleSendConfirmedRecoveryCheckEmail() {
    const recipient = gmailConnectedEmail || user.email;
    setGmailError('');
    setGmailSuccess('');
    setGmailSendingTest(true);
    try {
      await sendGmailMessage({
        to: recipient,
        subject: 'LocalPro Gmail recovery connection check',
        body: [
          `Hi ${user.fullName},`,
          '',
          'This email confirms that your Gmail account is connected for LocalPro password recovery and security notifications.',
          `LocalPro account email: ${user.email}`,
          '',
          'You can use "Sign in with Google" on the Reset Password screen whenever you need to recover your account.',
          '',
          'LocalPro Security',
        ].join('\n'),
      });
      setGmailConfirmOpen(false);
      setGmailSuccess(`Recovery confirmation email sent to ${recipient} via Gmail.`);
    } catch (err) {
      setGmailConfirmOpen(false);
      setGmailError(
        err instanceof Error ? err.message : 'Unable to send email through Gmail.'
      );
    } finally {
      setGmailSendingTest(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    const strengthError = validateStrongPasswordClient(newPassword);
    if (strengthError) {
      setPasswordError(strengthError);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation password do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await changePasswordRequest(authToken, {
        currentPassword,
        newPassword,
        confirmPassword: confirmNewPassword,
        logoutOtherDevices,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess(res.message);
      void loadSecurityState();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleRequestEmailChange(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');

    const trimmedEmail = newEmailInput.trim().toLowerCase();
    if (!emailCurrentPassword) {
      setEmailError('Please enter your current password to authorise an email change.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('Please enter a valid new email address.');
      return;
    }

    setEmailRequesting(true);
    try {
      const res = await requestEmailChange(authToken, {
        currentPassword: emailCurrentPassword,
        newEmail: trimmedEmail,
      });
      setPendingEmailChange(res.pending);
      setSmtpConfigured(res.smtpConfigured);
      setEmailCurrentPassword('');
      setNewEmailInput('');
      setEmailSuccess(res.message);
      void loadSecurityState();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unable to request email change.');
    } finally {
      setEmailRequesting(false);
    }
  }

  async function handleConfirmEmailChange(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');

    const trimmedCode = emailVerifyCode.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setEmailError('Please enter the 6-digit verification code.');
      return;
    }

    setEmailConfirming(true);
    try {
      const res = await confirmEmailChange(authToken, trimmedCode);
      setPendingEmailChange(null);
      setEmailVerifyCode('');
      onUserUpdated(res.user);
      setEmailSuccess(res.message);
      void loadSecurityState();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unable to verify email code.');
      void loadSecurityState();
    } finally {
      setEmailConfirming(false);
    }
  }

  async function handleCancelPendingEmailChange() {
    setEmailError('');
    setEmailSuccess('');
    try {
      await cancelEmailChange(authToken);
      setPendingEmailChange(null);
      setEmailVerifyCode('');
      setEmailSuccess('Pending email change cancelled. Your current email address remains active.');
      void loadSecurityState();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unable to cancel email change.');
    }
  }

  async function handleLogoutOtherSessions() {
    setSessionActionError('');
    setSessionActionMessage('');
    setLoggingOutOthers(true);
    try {
      const res = await logoutOtherSessionsRequest(authToken);
      setSessions(res.sessions);
      setSessionActionMessage(
        res.revokedCount > 0
          ? `Logged out ${res.revokedCount} other active ${res.revokedCount === 1 ? 'session' : 'sessions'}.`
          : 'No other active sessions were signed in.'
      );
      void loadSecurityState();
    } catch (err) {
      setSessionActionError(
        err instanceof Error ? err.message : 'Unable to log out other sessions.'
      );
    } finally {
      setLoggingOutOthers(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setSessionActionError('');
    setSessionActionMessage('');
    try {
      const res = await revokeSingleSessionRequest(authToken, sessionId);
      if (res.loggedOutCurrent) {
        onLogout();
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionActionMessage('Selected session has been logged out.');
      void loadSecurityState();
    } catch (err) {
      setSessionActionError(err instanceof Error ? err.message : 'Unable to revoke session.');
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError('');
    if (!deletePassword) {
      setDeleteError('Please enter your current password to confirm deletion.');
      return;
    }

    setDeleteSubmitting(true);
    try {
      await deleteAccountRequest(authToken, deletePassword);
      onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete account.');
      setDeleteSubmitting(false);
    }
  }

  const hasMinLength = newPassword.length >= 10;
  const hasUpperAndLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 space-y-6">
      {/* Account Summary Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span>Account Security &amp; Privacy</span>
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
              Account Settings
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Private account credentials, active sessions, and security controls visible only to
              you.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-white"
          >
            Go to My Profile
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass-subtle flex items-start gap-3.5 rounded-2xl p-4">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Current Email (Private)</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#0B1F3A]">{user.email}</p>
              <p className="mt-1 text-xs text-slate-600">
                {user.emailVerified
                  ? 'Verified email address'
                  : smtpConfigured
                    ? 'Email verification pending'
                    : 'Private login email'}
              </p>
            </div>
          </div>

          <div className="glass-subtle flex items-start gap-3.5 rounded-2xl p-4">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0D9488]" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-slate-500">Account Structure</p>
              <p className="mt-0.5 text-sm font-semibold text-[#0B1F3A]">Unified LocalPro Account</p>
              <p className="mt-1 text-xs text-slate-600">Joined {joinedFullDate}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Gmail for Recovery Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                Gmail Recovery Connection
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Connect your Gmail account to recover your LocalPro password quickly and send
                recovery confirmation notices with your permission.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {gmailConnectedEmail ? (
            <div className="glass-subtle flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0D9488]">Connected in this session</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-[#0B1F3A]">
                  {gmailConnectedEmail}
                </p>
                {gmailConnectedEmail.toLowerCase() !== user.email.toLowerCase() && (
                  <p className="mt-1 text-xs text-amber-700">
                    Note: Password recovery matches your LocalPro login email ({user.email}).
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setGmailConfirmOpen(true)}
                  className="btn-royal inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Send Recovery Check Email</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectGmail}
                  className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-subtle flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">Gmail not connected yet</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Sign in with Google ({user.email}) to verify recovery access or test Gmail
                  delivery.
                </p>
              </div>
              <div className="w-full sm:w-60 shrink-0">
                <GoogleSignInButton
                  label={gmailConnecting ? 'Connecting...' : 'Sign in with Google'}
                  disabled={gmailConnecting}
                  onClick={handleConnectGmail}
                />
              </div>
            </div>
          )}

          {gmailError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
            >
              {gmailError}
            </div>
          )}

          {gmailSuccess && (
            <div
              role="status"
              className="rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F766E]"
            >
              {gmailSuccess}
            </div>
          )}
        </div>
      </section>

      {/* Change Password Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex items-start gap-3 border-b border-slate-200/80 pb-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">Change Password</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Passwords are salted and hashed with scrypt. Your new password cannot match your
              current password.
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} noValidate className="mt-6 space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor="sec-current-password"
                className="block text-sm font-medium text-[#0B1F3A]"
              >
                Current password
              </label>
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                {showPasswords ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Hide passwords</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Show passwords</span>
                  </>
                )}
              </button>
            </div>
            <input
              id="sec-current-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (passwordError) setPasswordError('');
              }}
              placeholder="Enter current password"
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="sec-new-password"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                New password
              </label>
              <input
                id="sec-new-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (passwordError) setPasswordError('');
                }}
                placeholder="10+ chars, upper, lower, number & symbol"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>

            <div>
              <label
                htmlFor="sec-confirm-password"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Confirm new password
              </label>
              <input
                id="sec-confirm-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => {
                  setConfirmNewPassword(e.target.value);
                  if (passwordError) setPasswordError('');
                }}
                placeholder="Re-enter new password"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <span className={`inline-flex items-center gap-1 ${hasMinLength ? 'font-medium text-[#0D9488]' : ''}`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              10+ characters
            </span>
            <span className={`inline-flex items-center gap-1 ${hasUpperAndLower ? 'font-medium text-[#0D9488]' : ''}`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Uppercase &amp; lowercase
            </span>
            <span className={`inline-flex items-center gap-1 ${hasNumber ? 'font-medium text-[#0D9488]' : ''}`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Includes a number
            </span>
            <span className={`inline-flex items-center gap-1 ${hasSpecial ? 'font-medium text-[#0D9488]' : ''}`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Special character
            </span>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-3.5 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={logoutOtherDevices}
              onChange={(e) => setLogoutOtherDevices(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
            />
            <span>Log out all other signed-in devices after changing my password</span>
          </label>

          {passwordError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
            >
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div
              role="status"
              className="rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F766E]"
            >
              {passwordSuccess}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passwordSaving}
              className="btn-royal inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>{passwordSaving ? 'Updating...' : 'Update Password'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Change Email Address Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex items-start gap-3 border-b border-slate-200/80 pb-4">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#0D9488]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">Change Email Address</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Your current email ({user.email}) remains active until the new address is verified via
              a time-limited code.
            </p>
          </div>
        </div>

        <form onSubmit={handleRequestEmailChange} noValidate className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="sec-email-current-pw"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Current password
              </label>
              <input
                id="sec-email-current-pw"
                type="password"
                autoComplete="current-password"
                value={emailCurrentPassword}
                onChange={(e) => {
                  setEmailCurrentPassword(e.target.value);
                  if (emailError) setEmailError('');
                }}
                placeholder="Confirm your password"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>

            <div>
              <label
                htmlFor="sec-new-email"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                New email address
              </label>
              <input
                id="sec-new-email"
                type="email"
                autoComplete="email"
                value={newEmailInput}
                onChange={(e) => {
                  setNewEmailInput(e.target.value);
                  if (emailError) setEmailError('');
                }}
                placeholder="new-address@example.com"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={emailRequesting}
              className="btn-royal inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
            >
              <span>{emailRequesting ? 'Sending verification...' : 'Request Email Change'}</span>
            </button>
          </div>
        </form>

        {pendingEmailChange && (
          <form
            onSubmit={handleConfirmEmailChange}
            className="mt-5 space-y-3 rounded-2xl border border-[#BFDBFE] bg-white/85 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">
                  Pending verification for {pendingEmailChange.newEmail}
                </p>
                <p className="text-xs text-slate-600">
                  Expires {formatSecurityTimestamp(pendingEmailChange.expiresAt)}. Current email
                  remains active until confirmed.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelPendingEmailChange}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                Cancel Request
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={emailVerifyCode}
                onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit verification code"
                aria-label="6-digit email verification code"
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
              />
              <button
                type="submit"
                disabled={emailConfirming}
                className="btn-royal inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-65"
              >
                {emailConfirming ? 'Verifying...' : 'Verify & Update Email'}
              </button>
            </div>
          </form>
        )}

        {emailError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
          >
            {emailError}
          </div>
        )}

        {emailSuccess && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F766E]"
          >
            {emailSuccess}
          </div>
        )}
      </section>

      {/* Active Sessions & Devices Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-start gap-3">
            <MonitorSmartphone
              className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                Active Sessions &amp; Devices
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Sessions expire automatically after inactivity and are protected with HttpOnly
                cookies.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogoutOtherSessions}
            disabled={loggingOutOthers || sessions.filter((s) => !s.isCurrent).length === 0}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-[#0B1F3A] hover:bg-white disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{loggingOutOthers ? 'Signing out...' : 'Log out all other devices'}</span>
          </button>
        </div>

        {sessionActionError && (
          <p role="alert" className="mt-4 text-xs font-medium text-red-700">
            {sessionActionError}
          </p>
        )}
        {sessionActionMessage && (
          <p role="status" className="mt-4 text-xs font-medium text-[#0F766E]">
            {sessionActionMessage}
          </p>
        )}

        <div className="mt-5 space-y-3">
          {sessionsLoading ? (
            <p className="text-sm text-slate-500">Loading active sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-500">No active sessions recorded.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="glass-subtle flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[#0B1F3A]">
                      {session.userAgent}
                    </span>
                    {session.isCurrent && (
                      <span className="text-xs font-semibold text-[#0D9488]">
                        Current session
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 tabular-nums">
                    IP {session.ipAddress} · Last active {formatSecurityTimestamp(session.lastActiveAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRevokeSession(session.id)}
                  className="min-h-[38px] rounded-xl border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  {session.isCurrent ? 'Log out' : 'Revoke'}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recent Security Activity Log */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex items-start gap-3 border-b border-slate-200/80 pb-4">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-[#0D9488]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Recent Security Activity
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Audit trail of authentication events, password updates, email changes, and session
              actions.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {logsLoading ? (
            <p className="text-sm text-slate-500">Loading security activity...</p>
          ) : securityLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No recent security events logged.</p>
          ) : (
            securityLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-[#0B1F3A]">
                    {describeSecurityEvent(entry.eventType)}
                  </p>
                  <p className="mt-0.5 text-slate-500">IP {entry.ipAddress}</p>
                </div>
                <span className="text-slate-600 tabular-nums">
                  {formatSecurityTimestamp(entry.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Account Deletion & Logout Footer */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <ShieldCheck className="h-4 w-4 text-[#0D9488]" aria-hidden="true" />
            Protected stateful session active
          </span>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDeleteOpen((prev) => !prev);
                setDeleteError('');
                setDeletePassword('');
              }}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Delete Account</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {deleteOpen && (
          <form
            onSubmit={handleDeleteAccount}
            className="mt-5 space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-5"
          >
            <div className="flex items-start gap-2.5 text-red-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Permanently delete your LocalPro account</p>
                <p className="mt-1 text-xs leading-relaxed text-red-800">
                  This permanently removes your profile, skills, posts, uploaded images, comments,
                  enquiries, and notifications. Enter your current password to continue.
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="sec-delete-password"
                className="mb-1 block text-xs font-semibold text-red-900"
              >
                Current password
              </label>
              <input
                id="sec-delete-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder="Enter your current password"
                className="min-h-[44px] w-full rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm text-[#0F172A] focus:border-red-500 focus:outline-none"
              />
            </div>

            {deleteError && (
              <p role="alert" className="text-xs font-medium text-red-800">
                {deleteError}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteSubmitting}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleteSubmitting}
                className="min-h-[40px] rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-65"
              >
                {deleteSubmitting ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Explicit confirmation dialog before sending a recovery check email via Gmail */}
      {gmailConfirmOpen && gmailConnectedEmail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-gmail-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
        >
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 sm:p-7 space-y-4">
            <div className="flex items-start gap-3">
              <MailCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
              <div>
                <h2
                  id="settings-gmail-confirm-title"
                  className="font-display text-lg font-bold text-[#0B1F3A]"
                >
                  Confirm Gmail email send
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  LocalPro will send a recovery connection confirmation message through your
                  connected Gmail account.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 text-xs text-slate-700 space-y-1">
              <p>
                <span className="font-semibold text-[#0B1F3A]">To:</span> {gmailConnectedEmail}
              </p>
              <p>
                <span className="font-semibold text-[#0B1F3A]">Subject:</span> LocalPro Gmail
                recovery connection check
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setGmailConfirmOpen(false)}
                disabled={gmailSendingTest}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendConfirmedRecoveryCheckEmail}
                disabled={gmailSendingTest}
                className="btn-royal min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-65"
              >
                {gmailSendingTest ? 'Sending...' : 'Confirm & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
