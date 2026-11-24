import {
  BadgeCheck,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Inbox,
  MapPin,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchEnquiries, updateEnquiryStatusRequest } from '../services/enquiryApi';
import type { EnquiryItem, EnquiryStatus } from '../types/auth';
import { ProfileAvatar } from './ProfileAvatar';

interface EnquiriesPageProps {
  authToken: string;
  initialTab?: 'received' | 'sent';
  onOpenProfile: (profileId: string) => void;
  onExploreProviders: () => void;
  onEnquiryUpdated?: () => void;
}

function StatusIndicator({ status }: { status: EnquiryStatus }) {
  switch (status) {
    case 'Pending':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
          <Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
          <span>Pending</span>
        </span>
      );
    case 'Accepted':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-1 text-xs font-semibold text-[#1E40AF]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
          <span>Accepted</span>
        </span>
      );
    case 'Completed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-2.5 py-1 text-xs font-semibold text-[#0F766E]">
          <BadgeCheck className="h-3.5 w-3.5 text-[#0D9488]" aria-hidden="true" />
          <span>Completed</span>
        </span>
      );
    case 'Declined':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
          <XCircle className="h-3.5 w-3.5 text-red-700" aria-hidden="true" />
          <span>Declined</span>
        </span>
      );
    case 'Cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          <Ban className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
          <span>Cancelled</span>
        </span>
      );
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EnquiriesPage({
  authToken,
  initialTab,
  onOpenProfile,
  onExploreProviders,
  onEnquiryUpdated,
}: EnquiriesPageProps) {
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>(initialTab ?? 'received');
  const [received, setReceived] = useState<EnquiryItem[]>([]);
  const [sent, setSent] = useState<EnquiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyEnquiryId, setBusyEnquiryId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEnquiries(authToken);
      setReceived(data.received);
      setSent(data.sent);
      if (!initialTab && data.received.length === 0 && data.sent.length > 0) {
        setActiveTab('sent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load enquiries.');
    } finally {
      setLoading(false);
    }
  }, [authToken, initialTab]);

  useEffect(() => {
    void loadEnquiries();
  }, [loadEnquiries]);

  async function handleStatusChange(enquiryId: string, nextStatus: EnquiryStatus) {
    setBusyEnquiryId(enquiryId);
    setError('');
    setActionMessage('');
    try {
      const updated = await updateEnquiryStatusRequest(authToken, enquiryId, nextStatus);
      setReceived((prev) => prev.map((e) => (e.id === enquiryId ? updated : e)));
      setSent((prev) => prev.map((e) => (e.id === enquiryId ? updated : e)));
      setConfirmCancelId(null);
      setActionMessage(`Enquiry status updated to ${updated.status}.`);
      onEnquiryUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update enquiry status.');
    } finally {
      setBusyEnquiryId(null);
    }
  }

  const displayedList = activeTab === 'received' ? received : sent;
  const pendingReceivedCount = received.filter((e) => e.status === 'Pending').length;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 space-y-6">
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
              Customer Enquiries &amp; Requests
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Respond to incoming requests for your services or track enquiries you have sent to
              local providers.
            </p>
          </div>
        </div>

        {/* Role Perspective Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200/80 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab('received')}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'received'
                ? 'btn-royal text-white'
                : 'border border-slate-200/90 bg-white/85 text-[#0B1F3A] hover:bg-white'
            }`}
          >
            <Inbox className="h-4 w-4" aria-hidden="true" />
            <span>Received Enquiries</span>
            <span className="tabular-nums opacity-90">({received.length})</span>
            {pendingReceivedCount > 0 && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  activeTab === 'received'
                    ? 'bg-white/20 text-white'
                    : 'bg-[#EFF6FF] text-[#1D4ED8]'
                }`}
              >
                {pendingReceivedCount} pending
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sent')}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'sent'
                ? 'btn-royal text-white'
                : 'border border-slate-200/90 bg-white/85 text-[#0B1F3A] hover:bg-white'
            }`}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>My Enquiries</span>
            <span className="tabular-nums opacity-90">({sent.length})</span>
          </button>
        </div>

        {actionMessage && (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F766E]"
          >
            {actionMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
          >
            {error}
          </div>
        )}
      </section>

      {loading ? (
        <div className="glass-panel rounded-3xl p-10 text-center text-sm text-slate-600">
          Loading enquiries...
        </div>
      ) : displayedList.length === 0 ? (
        <section className="glass-panel rounded-3xl p-8 text-center sm:p-12">
          <p className="font-display text-lg font-bold text-[#0B1F3A]">
            {activeTab === 'received'
              ? 'No received enquiries yet'
              : 'You have not sent any enquiries yet'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            {activeTab === 'received'
              ? 'When customers contact you from your public profile, their service requests will appear here.'
              : 'Browse local service providers in Explore and click Contact / Enquire on any profile to get started.'}
          </p>
          {activeTab === 'sent' && (
            <button
              type="button"
              onClick={onExploreProviders}
              className="btn-royal mt-5 inline-flex min-h-[42px] items-center rounded-xl px-5 py-2 text-sm font-semibold text-white"
            >
              Explore Providers
            </button>
          )}
        </section>
      ) : (
        <div className="space-y-4">
          {displayedList.map((enquiry) => {
            const isProviderView = activeTab === 'received';
            const otherUserId = isProviderView ? enquiry.customerId : enquiry.providerId;
            const otherUserName = isProviderView ? enquiry.customerName : enquiry.providerName;
            const otherAvatarUrl = isProviderView
              ? enquiry.customerAvatarUrl
              : enquiry.providerAvatarUrl;
            const isBusy = busyEnquiryId === enquiry.id;

            return (
              <article key={enquiry.id} className="glass-panel rounded-3xl p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(otherUserId)}
                      className="shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                    >
                      <ProfileAvatar
                        src={otherAvatarUrl}
                        fullName={otherUserName}
                        size="md"
                      />
                    </button>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#0D9488]">
                        {isProviderView ? 'Customer Enquiry' : 'Sent to Service Provider'}
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenProfile(otherUserId)}
                        className="mt-0.5 truncate font-display text-base font-bold text-[#0B1F3A] hover:text-[#1D4ED8] hover:underline"
                      >
                        {otherUserName}
                      </button>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Submitted {formatDateTime(enquiry.createdAt)}
                      </p>
                    </div>
                  </div>

                  <StatusIndicator status={enquiry.status} />
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Service requested</p>
                    <p className="mt-0.5 font-display text-base font-bold text-[#0B1F3A]">
                      {enquiry.serviceRequested}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-500">Work needed</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                      {enquiry.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    <div className="glass-subtle rounded-2xl p-3.5">
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-[#0D9488]" aria-hidden="true" />
                        <span>Customer location</span>
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#0B1F3A]">
                        {enquiry.customerLocation}
                      </p>
                    </div>

                    <div className="glass-subtle rounded-2xl p-3.5">
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <Calendar className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                        <span>Preferred date</span>
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#0B1F3A]">
                        {enquiry.preferredDate || 'Flexible / not specified'}
                      </p>
                    </div>
                  </div>

                  {enquiry.additionalInfo && (
                    <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3.5">
                      <p className="text-xs font-semibold text-slate-500">Additional notes</p>
                      <p className="mt-1 text-sm text-slate-700">{enquiry.additionalInfo}</p>
                    </div>
                  )}
                </div>

                {/* Role-appropriate Enquiry Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(otherUserId)}
                    className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                  >
                    View {isProviderView ? "customer's" : "provider's"} profile
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {isProviderView && enquiry.status === 'Pending' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStatusChange(enquiry.id, 'Declined')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Decline</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStatusChange(enquiry.id, 'Accepted')}
                          className="btn-royal inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{isBusy ? 'Updating...' : 'Accept Enquiry'}</span>
                        </button>
                      </>
                    )}

                    {isProviderView && enquiry.status === 'Accepted' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStatusChange(enquiry.id, 'Completed')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#0D9488] bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E] disabled:opacity-60"
                      >
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isBusy ? 'Updating...' : 'Mark as Completed'}</span>
                      </button>
                    )}

                    {!isProviderView && enquiry.status === 'Pending' && (
                      <>
                        {confirmCancelId === enquiry.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-600">
                              Cancel this request?
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmCancelId(null)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatusChange(enquiry.id, 'Cancelled')}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {isBusy ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(enquiry.id)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Cancel Enquiry</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
