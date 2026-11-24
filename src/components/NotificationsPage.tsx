import {
  BadgeCheck,
  Bell,
  CheckCheck,
  CheckCircle2,
  Heart,
  Inbox,
  MessageCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  deleteNotificationRequest,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationApi';
import type { NotificationItem, NotificationType } from '../types/auth';
import { ProfileAvatar } from './ProfileAvatar';

interface NotificationsPageProps {
  authToken: string;
  onUnreadCountChange: (count: number) => void;
  onOpenPost: (postId: string) => void;
  onOpenEnquiries: (tab: 'received' | 'sent') => void;
  onOpenProfile: (profileId: string) => void;
}

function getNotificationMeta(type: NotificationType): {
  label: string;
  icon: typeof Heart;
  accentClass: string;
} {
  switch (type) {
    case 'post_like':
      return {
        label: 'Post Like',
        icon: Heart,
        accentClass: 'bg-[#EFF6FF] text-[#1D4ED8]',
      };
    case 'post_comment':
      return {
        label: 'Comment',
        icon: MessageCircle,
        accentClass: 'bg-[#F0FDFA] text-[#0D9488]',
      };
    case 'enquiry_received':
      return {
        label: 'New Enquiry',
        icon: Inbox,
        accentClass: 'bg-[#EFF6FF] text-[#1D4ED8]',
      };
    case 'enquiry_accepted':
      return {
        label: 'Enquiry Accepted',
        icon: CheckCircle2,
        accentClass: 'bg-[#F0FDFA] text-[#0F766E]',
      };
    case 'enquiry_completed':
      return {
        label: 'Enquiry Completed',
        icon: BadgeCheck,
        accentClass: 'bg-[#F0FDFA] text-[#0F766E]',
      };
    case 'enquiry_declined':
    case 'enquiry_cancelled':
      return {
        label: type === 'enquiry_declined' ? 'Enquiry Declined' : 'Enquiry Cancelled',
        icon: XCircle,
        accentClass: 'bg-red-50 text-red-700',
      };
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationsPage({
  authToken,
  onUnreadCountChange,
  onOpenPost,
  onOpenEnquiries,
  onOpenProfile,
}: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAll, setBusyAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchNotifications(authToken);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      onUnreadCountChange(data.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [authToken, onUnreadCountChange]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function handleMarkRead(notification: NotificationItem) {
    if (notification.isRead) return;
    try {
      const nextUnread = await markNotificationRead(authToken, notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(nextUnread);
      onUnreadCountChange(nextUnread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark notification as read.');
    }
  }

  async function handleOpenNotification(notification: NotificationItem) {
    if (!notification.isRead) {
      await handleMarkRead(notification);
    }

    if (notification.relatedPostId) {
      onOpenPost(notification.relatedPostId);
      return;
    }

    if (notification.relatedEnquiryId) {
      const targetTab =
        notification.type === 'enquiry_received' || notification.type === 'enquiry_cancelled'
          ? 'received'
          : 'sent';
      onOpenEnquiries(targetTab);
      return;
    }

    onOpenProfile(notification.actorUserId);
  }

  async function handleMarkAllRead() {
    setBusyAll(true);
    setError('');
    try {
      const nextUnread = await markAllNotificationsRead(authToken);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(nextUnread);
      onUnreadCountChange(nextUnread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark all notifications as read.');
    } finally {
      setBusyAll(false);
    }
  }

  async function handleDeleteNotification(notificationId: string) {
    setError('');
    try {
      const nextUnread = await deleteNotificationRequest(authToken, notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      setUnreadCount(nextUnread);
      onUnreadCountChange(nextUnread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete notification.');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 space-y-6">
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
              <Bell className="h-4 w-4" aria-hidden="true" />
              <span>Activity &amp; Enquiry Alerts</span>
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-slate-600 tabular-nums">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'All caught up'}
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              disabled={busyAll}
              onClick={handleMarkAllRead}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-[#0B1F3A] hover:bg-white disabled:opacity-60"
            >
              <CheckCheck className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
              <span>{busyAll ? 'Updating...' : 'Mark All as Read'}</span>
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
          >
            {error}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/90 bg-white/60 px-6 py-12 text-center">
              <p className="font-display text-base font-semibold text-[#0B1F3A]">
                No notifications yet
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
                When someone likes or comments on your posts, or sends or updates a service enquiry,
                alerts will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => {
                const meta = getNotificationMeta(item.type);
                const TypeIcon = meta.icon;

                return (
                  <article
                    key={item.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      item.isRead
                        ? 'border-slate-200/80 bg-white/65'
                        : 'border-[#93C5FD] bg-[#EFF6FF]/75'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(item.actorUserId)}
                          className="shrink-0 rounded-xl"
                        >
                          <ProfileAvatar
                            src={item.actorAvatarUrl}
                            fullName={item.actorName}
                            size="sm"
                          />
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold ${meta.accentClass}`}
                            >
                              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{meta.label}</span>
                            </span>
                            <span className="text-slate-500">
                              {formatTimestamp(item.createdAt)}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span
                              className={`font-semibold ${
                                item.isRead ? 'text-slate-500' : 'text-[#1D4ED8]'
                              }`}
                            >
                              {item.isRead ? 'Read' : 'Unread'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleOpenNotification(item)}
                            className="mt-1.5 block text-left text-sm font-medium text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
                          >
                            {item.message}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pl-2">
                        <button
                          type="button"
                          onClick={() => void handleOpenNotification(item)}
                          className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                        >
                          Open
                        </button>
                        {!item.isRead && (
                          <button
                            type="button"
                            onClick={() => void handleMarkRead(item)}
                            className="min-h-[36px] rounded-xl border border-[#BFDBFE] bg-white px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF]"
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteNotification(item.id)}
                          aria-label="Delete notification"
                          className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
