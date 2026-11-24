import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Edit3,
  Eye,
  Flag,
  FolderOpen,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { submitEnquiry } from '../services/enquiryApi';
import { fetchFeedPosts } from '../services/postApi';
import { submitReportRequest } from '../services/securityApi';
import type { CategoryItem, PostItem, PublicProfile, SkillItem, UserProfile } from '../types/auth';
import { EditProfilePanel } from './EditProfilePanel';
import { PostCard } from './PostCard';
import { ProfileAvatar } from './ProfileAvatar';

interface ProfileViewProps {
  profile: PublicProfile;
  isOwner: boolean;
  authToken: string;
  allSkills: SkillItem[];
  categories: CategoryItem[];
  viewerLocationDisplay?: string;
  onProfileUpdated?: (updatedUser: UserProfile) => void;
  onOpenProfile: (profileId: string) => void;
  onNavigateToCreatePost?: () => void;
  onNavigateToEnquiries?: () => void;
  onRefreshUserStats?: () => void;
  onBack?: () => void;
  backLabel?: string;
}

export function ProfileView({
  profile,
  isOwner,
  authToken,
  allSkills,
  categories,
  viewerLocationDisplay = '',
  onProfileUpdated,
  onOpenProfile,
  onNavigateToCreatePost,
  onNavigateToEnquiries,
  onRefreshUserStats,
  onBack,
  backLabel = 'Back to Explore',
}: ProfileViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [previewAsPublic, setPreviewAsPublic] = useState(false);
  const [saveBanner, setSaveBanner] = useState('');

  // Service enquiry form state (Module 07)
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [serviceChoice, setServiceChoice] = useState('');
  const [customServiceText, setCustomServiceText] = useState('');
  const [enquiryDescription, setEnquiryDescription] = useState('');
  const [enquiryLocation, setEnquiryLocation] = useState(viewerLocationDisplay);
  const [enquiryDate, setEnquiryDate] = useState('');
  const [enquiryAdditionalInfo, setEnquiryAdditionalInfo] = useState('');
  const [enquirySubmitting, setEnquirySubmitting] = useState(false);
  const [enquiryError, setEnquiryError] = useState('');
  const [enquirySuccessMessage, setEnquirySuccessMessage] = useState('');

  // Real authored posts for Showcased Work
  const [userPosts, setUserPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // Report user state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Fake profile or impersonation');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  const offeredSkillOptions = useMemo(() => {
    const names = [
      ...profile.skills.map((s) => s.name),
      ...profile.customSkills,
    ];
    return Array.from(new Set(names));
  }, [profile.skills, profile.customSkills]);

  useEffect(() => {
    setEnquiryOpen(false);
    setEnquiryError('');
    setEnquirySuccessMessage('');
    setEnquiryLocation(viewerLocationDisplay);
    if (offeredSkillOptions.length > 0) {
      setServiceChoice(offeredSkillOptions[0]);
      setCustomServiceText('');
    } else {
      setServiceChoice('__custom__');
      setCustomServiceText('');
    }
  }, [profile.id, viewerLocationDisplay, offeredSkillOptions]);

  const loadUserPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const result = await fetchFeedPosts(authToken, {
        scope: 'everywhere',
        sort: 'recent',
        authorId: profile.id,
        limit: 20,
        offset: 0,
      });
      setUserPosts(result.posts);
    } catch (err) {
      console.error('Failed to load profile posts:', err);
    } finally {
      setPostsLoading(false);
    }
  }, [authToken, profile.id]);

  useEffect(() => {
    void loadUserPosts();
  }, [loadUserPosts]);

  const showOwnerControls = isOwner && !previewAsPublic;

  function handleToggleEnquiryForm() {
    setEnquiryError('');
    setEnquirySuccessMessage('');
    setEnquiryOpen((prev) => !prev);
  }

  async function handleSubmitEnquiry(e: FormEvent) {
    e.preventDefault();
    if (isOwner) return;
    setEnquiryError('');
    setEnquirySuccessMessage('');

    const resolvedService =
      serviceChoice === '__custom__' || offeredSkillOptions.length === 0
        ? customServiceText.trim()
        : serviceChoice.trim();

    if (resolvedService.length < 2 || resolvedService.length > 120) {
      setEnquiryError('Please select or enter the service you require.');
      return;
    }

    const trimmedDescription = enquiryDescription.trim();
    if (trimmedDescription.length < 5 || trimmedDescription.length > 1500) {
      setEnquiryError('Please describe the work needed (at least 5 characters).');
      return;
    }

    const trimmedLocation = enquiryLocation.trim();
    if (trimmedLocation.length < 2 || trimmedLocation.length > 120) {
      setEnquiryError('Please enter your location so the provider knows where you are based.');
      return;
    }

    setEnquirySubmitting(true);
    try {
      await submitEnquiry(authToken, {
        providerId: profile.id,
        serviceRequested: resolvedService,
        description: trimmedDescription,
        customerLocation: trimmedLocation,
        preferredDate: enquiryDate.trim(),
        additionalInfo: enquiryAdditionalInfo.trim(),
      });
      setEnquiryOpen(false);
      setEnquiryDescription('');
      setEnquiryDate('');
      setEnquiryAdditionalInfo('');
      setEnquirySuccessMessage(
        `Your enquiry for ${resolvedService} was sent to ${profile.fullName}.`
      );
    } catch (err) {
      setEnquiryError(
        err instanceof Error ? err.message : 'Unable to send your enquiry. Please try again.'
      );
    } finally {
      setEnquirySubmitting(false);
    }
  }

  async function handleSubmitUserReport(e: FormEvent) {
    e.preventDefault();
    if (isOwner) return;
    setReportError('');
    setReportSuccess('');
    setReportSubmitting(true);
    try {
      const res = await submitReportRequest(authToken, {
        targetType: 'user',
        targetId: profile.id,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportOpen(false);
      setReportDetails('');
      setReportSuccess(res.message);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setReportSubmitting(false);
    }
  }

  if (isEditing && isOwner) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <EditProfilePanel
          user={profile as UserProfile}
          authToken={authToken}
          allSkills={allSkills}
          onSaved={(updated) => {
            onProfileUpdated?.(updated);
            setIsEditing(false);
            setSaveBanner('Your profile changes have been saved.');
            void loadUserPosts();
          }}
          onCancel={() => setIsEditing(false)}
        />
      </main>
    );
  }

  const joinedDate = new Date(profile.createdAt).toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
  });

  const locationDisplay = [profile.suburb, profile.city, profile.province]
    .filter(Boolean)
    .join(', ');

  const skillsByCategory = profile.skills.reduce<Record<string, string[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item.name);
    return acc;
  }, {});

  const hasListedSkills =
    profile.hasSkills && (profile.skills.length > 0 || profile.customSkills.length > 0);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 space-y-6">
      {/* Top context bar for Public Profile view or Public Preview */}
      {(!isOwner || previewAsPublic) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {previewAsPublic ? (
            <div className="glass-subtle flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <p className="text-xs font-medium text-[#0B1F3A]">
                Public View Preview — private details like your email address are hidden from other
                users.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPreviewAsPublic(false);
                  setEnquiryOpen(false);
                }}
                className="text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                Return to My Profile
              </button>
            </div>
          ) : (
            onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-[#0B1F3A]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>{backLabel}</span>
              </button>
            )
          )}
        </div>
      )}

      {saveBanner && showOwnerControls && (
        <div
          role="status"
          className="rounded-2xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F766E]"
        >
          {saveBanner}
        </div>
      )}

      {enquirySuccessMessage && !showOwnerControls && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3.5 text-sm text-[#0F766E]"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{enquirySuccessMessage}</span>
          </div>
          {onNavigateToEnquiries && (
            <button
              type="button"
              onClick={onNavigateToEnquiries}
              className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] shadow-xs hover:bg-slate-50"
            >
              View in Enquiries
            </button>
          )}
        </div>
      )}

      {/* Personal Information Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <ProfileAvatar src={profile.avatarUrl} fullName={profile.fullName} size="xl" />

            <div className="space-y-2.5">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
                  {profile.fullName}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-[#0D9488]" aria-hidden="true" />
                    <span>{locationDisplay}</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                    <span>Joined {joinedDate}</span>
                  </span>
                </div>
              </div>

              {showOwnerControls && !profile.avatarUrl && (
                <p className="text-xs font-medium text-[#1D4ED8]">
                  Add a profile picture so people can recognise you.
                </p>
              )}
            </div>
          </div>

          {/* Primary Profile Action */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {showOwnerControls ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSaveBanner('');
                    setIsEditing(true);
                  }}
                  className="btn-royal inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-white"
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAsPublic(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-white"
                >
                  <Eye className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <span>Public View</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleToggleEnquiryForm}
                  aria-expanded={enquiryOpen}
                  className="btn-royal inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span>{enquiryOpen ? 'Close Enquiry Form' : 'Contact / Enquire'}</span>
                </button>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportError('');
                      setReportOpen((prev) => !prev);
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white/85 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Report</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {reportOpen && !isOwner && (
          <form
            onSubmit={handleSubmitUserReport}
            className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#0B1F3A]">
                Report {profile.fullName}
              </span>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="text-slate-500 hover:text-[#0B1F3A]"
              >
                Cancel
              </button>
            </div>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              aria-label="Report reason"
              className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A]"
            >
              <option value="Fake profile or impersonation">Fake profile or impersonation</option>
              <option value="Scam or fraudulent service">Scam or fraudulent service</option>
              <option value="Harassment or abusive behaviour">Harassment or abusive behaviour</option>
              <option value="Spam or misleading content">Spam or misleading content</option>
              <option value="Other safety concern">Other safety concern</option>
            </select>
            <textarea
              rows={2}
              maxLength={500}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional details..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A]"
            />
            {reportError && (
              <p role="alert" className="font-medium text-red-700">
                {reportError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={reportSubmitting}
                className="rounded-xl bg-[#0B1F3A] px-3.5 py-2 font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-60"
              >
                {reportSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}

        {reportSuccess && (
          <p role="status" className="mt-4 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-2.5 text-xs font-medium text-[#0F766E]">
            {reportSuccess}
          </p>
        )}

        {/* Service Enquiry Form (Module 07) */}
        {enquiryOpen && !showOwnerControls && (
          <div className="mt-6 rounded-2xl border border-[#BFDBFE] bg-white/85 p-5 sm:p-6">
            {isOwner && previewAsPublic ? (
              <div className="flex items-start justify-between gap-3 text-sm text-[#0B1F3A]">
                <div>
                  <p className="font-semibold">Public Preview Mode</p>
                  <p className="mt-1 text-slate-600">
                    When other LocalPro members view your profile, clicking Contact / Enquire opens
                    a form to request your services directly. You cannot send an enquiry to your own
                    account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnquiryOpen(false)}
                  aria-label="Close preview notice"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitEnquiry} className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                      Send Service Enquiry to {profile.fullName}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Share what you need and your location. {profile.fullName} will be notified
                      and can accept or decline your request.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnquiryOpen(false)}
                    aria-label="Close enquiry form"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="enquiry-service"
                      className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
                    >
                      Service required
                    </label>
                    {offeredSkillOptions.length > 0 ? (
                      <select
                        id="enquiry-service"
                        value={serviceChoice}
                        onChange={(e) => setServiceChoice(e.target.value)}
                        className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                      >
                        {offeredSkillOptions.map((skillName) => (
                          <option key={skillName} value={skillName}>
                            {skillName}
                          </option>
                        ))}
                        <option value="__custom__">Other service...</option>
                      </select>
                    ) : (
                      <input
                        id="enquiry-service"
                        type="text"
                        maxLength={120}
                        value={customServiceText}
                        onChange={(e) => setCustomServiceText(e.target.value)}
                        placeholder="e.g. Custom repair or consultation"
                        className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="enquiry-location"
                      className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
                    >
                      Your location
                    </label>
                    <input
                      id="enquiry-location"
                      type="text"
                      maxLength={120}
                      value={enquiryLocation}
                      onChange={(e) => setEnquiryLocation(e.target.value)}
                      placeholder="e.g. Morningside, Durban"
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                </div>

                {offeredSkillOptions.length > 0 && serviceChoice === '__custom__' && (
                  <div>
                    <label
                      htmlFor="enquiry-custom-service"
                      className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
                    >
                      Specify service required
                    </label>
                    <input
                      id="enquiry-custom-service"
                      type="text"
                      maxLength={120}
                      value={customServiceText}
                      onChange={(e) => setCustomServiceText(e.target.value)}
                      placeholder="Describe the service you need"
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="enquiry-description"
                    className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
                  >
                    Description of the work needed
                  </label>
                  <textarea
                    id="enquiry-description"
                    rows={3}
                    maxLength={1500}
                    value={enquiryDescription}
                    onChange={(e) => setEnquiryDescription(e.target.value)}
                    placeholder="Explain what you need done, dimensions, scope, or key details..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="enquiry-date"
                      className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
                    >
                      Preferred date (optional)
                    </label>
                    <input
                      id="enquiry-date"
                      type="date"
                      value={enquiryDate}
                      onChange={(e) => setEnquiryDate(e.target.value)}
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="enquiry-additional"
                      className="mb-1 block text-xs font-semibold text-[#0B1F3A]"
                    >
                      Additional information (optional)
                    </label>
                    <input
                      id="enquiry-additional"
                      type="text"
                      maxLength={800}
                      value={enquiryAdditionalInfo}
                      onChange={(e) => setEnquiryAdditionalInfo(e.target.value)}
                      placeholder="Access hours, urgency, or helpful notes"
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                </div>

                {enquiryError && (
                  <p role="alert" className="text-xs font-medium text-red-700">
                    {enquiryError}
                  </p>
                )}

                <div className="flex flex-wrap justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setEnquiryOpen(false)}
                    disabled={enquirySubmitting}
                    className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={enquirySubmitting}
                    className="btn-royal inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-65"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>{enquirySubmitting ? 'Sending...' : 'Send Enquiry'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Short Biography */}
        <div className="mt-6 border-t border-slate-200/80 pt-5">
          <h2 className="text-xs font-semibold text-slate-500">About</h2>
          {profile.bio ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-700 sm:text-base">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              {showOwnerControls
                ? 'Tell people a little about yourself.'
                : 'No biography added yet.'}
            </p>
          )}
        </div>
      </section>

      {/* Live Profile Statistics Strip */}
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-4">
          <h2 className="font-display text-base font-semibold text-[#0B1F3A]">Profile Activity</h2>
          <span className="text-xs text-slate-500">
            Calculated from published posts, likes &amp; comments
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-subtle rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">Total posts</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#0B1F3A] tabular-nums">
              {profile.stats.totalPosts}
            </p>
          </div>
          <div className="glass-subtle rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">Total likes received</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#0B1F3A] tabular-nums">
              {profile.stats.totalLikes}
            </p>
          </div>
          <div className="glass-subtle rounded-2xl p-4">
            <p className="text-xs font-medium text-slate-500">Profile engagement</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#0B1F3A] tabular-nums">
              {profile.stats.engagementCount}
            </p>
          </div>
        </div>
      </section>

      {/* Skills and Services Section */}
      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="flex items-start gap-3">
            <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
                Skills &amp; Services
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Service location:{' '}
                <span className="font-medium text-[#0B1F3A]">{profile.serviceLocation}</span>
              </p>
            </div>
          </div>

          {showOwnerControls && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-sm font-semibold text-[#1D4ED8] hover:underline"
            >
              {hasListedSkills ? 'Manage skills' : 'Add skills'}
            </button>
          )}
        </div>

        <div className="mt-6">
          {hasListedSkills ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Object.entries(skillsByCategory).map(([category, skillNames]) => (
                  <div key={category} className="glass-subtle rounded-2xl p-4">
                    <h3 className="text-xs font-semibold text-[#0D9488]">{category}</h3>
                    <p className="mt-1.5 text-sm font-medium text-[#0B1F3A]">
                      {skillNames.join(' · ')}
                    </p>
                  </div>
                ))}

                {profile.customSkills.length > 0 && (
                  <div className="glass-subtle rounded-2xl p-4">
                    <h3 className="text-xs font-semibold text-[#0D9488]">Custom Skills</h3>
                    <p className="mt-1.5 text-sm font-medium text-[#0B1F3A]">
                      {profile.customSkills.join(' · ')}
                    </p>
                  </div>
                )}
              </div>

              {profile.skillDescription && (
                <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 sm:p-5">
                  <h3 className="text-xs font-semibold text-slate-500">Description of Services</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                    {profile.skillDescription}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6">
              {showOwnerControls ? (
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <p className="max-w-lg text-sm leading-relaxed text-slate-600">
                    Have a skill or talent? Add it to your profile and let people discover what you
                    can do.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="btn-royal whitespace-nowrap shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add Skills
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  {profile.fullName} has not listed any services yet.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Showcased Work / User Posts */}
      <section className="space-y-4">
        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-3xl p-6 sm:px-10 sm:py-6">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="h-5 w-5 text-[#0D9488]" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">Showcased Work</h2>
          </div>

          {showOwnerControls && onNavigateToCreatePost && (
            <button
              type="button"
              onClick={onNavigateToCreatePost}
              className="btn-royal inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Create Post</span>
            </button>
          )}
        </div>

        {postsLoading ? (
          <div className="glass-panel rounded-3xl p-8 text-center text-sm text-slate-500">
            Loading showcased work...
          </div>
        ) : userPosts.length === 0 ? (
          <div className="glass-panel rounded-3xl p-8 text-center">
            <p className="mx-auto max-w-md text-sm font-medium text-slate-700">
              {showOwnerControls
                ? 'Your work deserves to be seen. Your showcased projects will appear here.'
                : `No showcased projects published by ${profile.fullName} yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {userPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                authToken={authToken}
                categories={categories}
                onOpenProfile={onOpenProfile}
                onPostUpdated={(updated) => {
                  setUserPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                  onRefreshUserStats?.();
                }}
                onPostDeleted={(postId) => {
                  setUserPosts((prev) => prev.filter((p) => p.id !== postId));
                  onRefreshUserStats?.();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
