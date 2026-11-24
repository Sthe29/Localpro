import { Camera, Check, ImageOff, MapPin, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { PROVINCE_LIST, SOUTH_AFRICA_LOCATIONS } from '../data/locations';
import {
  removeProfileAvatar,
  updateUserProfileDetails,
  uploadProfileAvatar,
} from '../services/profileApi';
import type { SkillItem, UserProfile } from '../types/auth';
import { ProfileAvatar } from './ProfileAvatar';
import { SkillSelector } from './SkillSelector';

interface EditProfilePanelProps {
  user: UserProfile;
  authToken: string;
  allSkills: SkillItem[];
  onSaved: (updatedUser: UserProfile) => void;
  onCancel: () => void;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function EditProfilePanel({
  user,
  authToken,
  allSkills,
  onSaved,
  onCancel,
}: EditProfilePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initialProvinceCities = SOUTH_AFRICA_LOCATIONS[user.province] ?? [];
  const cityIsPredefined = initialProvinceCities.includes(user.city);

  // Personal & Location fields
  const [fullName, setFullName] = useState(user.fullName);
  const [bio, setBio] = useState(user.bio);
  const [province, setProvince] = useState(
    PROVINCE_LIST.includes(user.province) ? user.province : 'KwaZulu-Natal'
  );
  const [selectedCityOption, setSelectedCityOption] = useState(
    cityIsPredefined ? user.city : '__other__'
  );
  const [customCity, setCustomCity] = useState(cityIsPredefined ? '' : user.city);
  const [suburb, setSuburb] = useState(user.suburb);
  const [serviceLocation, setServiceLocation] = useState(user.serviceLocation);

  // Skills fields
  const [hasSkills, setHasSkills] = useState(user.hasSkills);
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>(user.skills.map((s) => s.id));
  const [customSkills, setCustomSkills] = useState<string[]>(user.customSkills);
  const [skillDescription, setSkillDescription] = useState(user.skillDescription);

  // Profile picture staging (preview before saving)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [removeExistingAvatar, setRemoveExistingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Revoke object URL on change or unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  const availableCities = SOUTH_AFRICA_LOCATIONS[province] ?? [];
  const effectiveCity =
    selectedCityOption === '__other__' ? customCity.trim() : selectedCityOption;

  const displayedAvatarUrl = removeExistingAvatar
    ? null
    : pendingPreviewUrl ?? user.avatarUrl;

  function handleProvinceChange(nextProvince: string) {
    setProvince(nextProvince);
    const nextCities = SOUTH_AFRICA_LOCATIONS[nextProvince] ?? [];
    setSelectedCityOption(nextCities[0] ?? '__other__');
    setCustomCity('');
  }

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    setAvatarError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setAvatarError('Please select a JPG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setAvatarError('Profile picture must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }

    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setPendingAvatarFile(file);
    setPendingPreviewUrl(preview);
    setRemoveExistingAvatar(false);
    e.target.value = '';
  }

  function handleStageRemoveAvatar() {
    setAvatarError('');
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingAvatarFile(null);
    setPendingPreviewUrl(null);
    setRemoveExistingAvatar(true);
  }

  function handleUndoAvatarChanges() {
    setAvatarError('');
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingAvatarFile(null);
    setPendingPreviewUrl(null);
    setRemoveExistingAvatar(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      setFormError('Full name must be between 2 and 100 characters.');
      return;
    }
    if (!province) {
      setFormError('Please select your province.');
      return;
    }
    if (!effectiveCity) {
      setFormError('Please select or enter your city or town.');
      return;
    }
    if (hasSkills && selectedSkillIds.length === 0 && customSkills.length === 0) {
      setFormError(
        'Please select at least one skill or add a custom skill when offering services.'
      );
      return;
    }

    setIsSaving(true);
    try {
      let latestUser = await updateUserProfileDetails(authToken, {
        fullName: trimmedName,
        bio: bio.trim(),
        province,
        city: effectiveCity,
        suburb: suburb.trim(),
        serviceLocation: serviceLocation.trim(),
        hasSkills,
        skillIds: hasSkills ? selectedSkillIds : [],
        customSkills: hasSkills ? customSkills : [],
        skillDescription: hasSkills ? skillDescription.trim() : '',
      });

      if (pendingAvatarFile) {
        latestUser = await uploadProfileAvatar(authToken, pendingAvatarFile);
      } else if (removeExistingAvatar && user.avatarUrl) {
        latestUser = await removeProfileAvatar(authToken);
      }

      onSaved(latestUser);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to save profile changes right now.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  }

  const hasStagedAvatarChange = Boolean(pendingAvatarFile) || (removeExistingAvatar && Boolean(user.avatarUrl));

  return (
    <form onSubmit={handleSubmit} noValidate className="glass-panel rounded-3xl p-6 sm:p-10 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <p className="text-xs font-semibold text-[#0D9488]">Profile Management</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
            Edit Profile
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Update your personal details, photo, location, and offered skills.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span>Cancel</span>
        </button>
      </div>

      {/* Section 1: Profile Picture with Preview Before Saving */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">Profile Picture</h2>
          <p className="text-sm text-slate-600">
            Upload a clear photo (JPG, PNG, or WebP up to 5 MB). Preview updates immediately before
            you save.
          </p>
        </div>

        <div className="glass-subtle flex flex-col items-start gap-5 rounded-2xl p-5 sm:flex-row sm:items-center">
          <ProfileAvatar src={displayedAvatarUrl} fullName={fullName || user.fullName} size="xl" />

          <div className="flex-1 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelected}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#13315C]"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                <span>{displayedAvatarUrl ? 'Replace Photo' : 'Upload Photo'}</span>
              </button>

              {displayedAvatarUrl && (
                <button
                  type="button"
                  onClick={handleStageRemoveAvatar}
                  className="inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Remove Picture</span>
                </button>
              )}

              {hasStagedAvatarChange && (
                <button
                  type="button"
                  onClick={handleUndoAvatarChanges}
                  className="inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Revert Photo</span>
                </button>
              )}
            </div>

            {pendingAvatarFile && (
              <p className="text-xs font-medium text-[#0D9488]">
                Preview ready ({pendingAvatarFile.name}) — click Save Profile below to apply.
              </p>
            )}

            {removeExistingAvatar && user.avatarUrl && (
              <p className="text-xs font-medium text-amber-700">
                Picture marked for removal — click Save Profile below to apply.
              </p>
            )}

            {avatarError && (
              <p role="alert" className="text-xs font-medium text-red-700">
                {avatarError}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="h-px bg-slate-200/80" />

      {/* Section 2: Personal Information & Bio */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">
          Personal Information
        </h2>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="edit-fullname"
              className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
            >
              Full name <span className="text-red-600">*</span>
            </label>
            <input
              id="edit-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            />
          </div>

          <div>
            <label htmlFor="edit-bio" className="mb-1.5 block text-sm font-medium text-[#0B1F3A]">
              Short biography <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="edit-bio"
              rows={3}
              maxLength={400}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a little about yourself, your background, and what inspires your work..."
              className="w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            />
            <div className="mt-1 flex justify-end text-xs text-slate-500 tabular-nums">
              {bio.length}/400
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-slate-200/80" />

      {/* Section 3: Location & Service Coverage */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">
              Location &amp; Service Area
            </h2>
            <p className="text-sm text-slate-600">
              Help neighbours find you in their city, town, or surrounding suburbs.
            </p>
          </div>
          <MapPin className="h-5 w-5 shrink-0 text-[#0D9488]" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="edit-province"
              className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
            >
              Province <span className="text-red-600">*</span>
            </label>
            <select
              id="edit-province"
              value={province}
              onChange={(e) => handleProvinceChange(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            >
              {PROVINCE_LIST.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-city" className="mb-1.5 block text-sm font-medium text-[#0B1F3A]">
              City / town <span className="text-red-600">*</span>
            </label>
            <select
              id="edit-city"
              value={selectedCityOption}
              onChange={(e) => setSelectedCityOption(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            >
              {availableCities.map((cityName) => (
                <option key={cityName} value={cityName}>
                  {cityName}
                </option>
              ))}
              <option value="__other__">Other city or town...</option>
            </select>
          </div>

          {selectedCityOption === '__other__' && (
            <div className="sm:col-span-2">
              <label
                htmlFor="edit-custom-city"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Enter your city or town <span className="text-red-600">*</span>
              </label>
              <input
                id="edit-custom-city"
                type="text"
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
                placeholder="Enter city or town name"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="edit-suburb"
              className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
            >
              Suburb <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="edit-suburb"
              type="text"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              maxLength={100}
              placeholder="e.g. Morningside, Glenwood"
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            />
          </div>

          <div>
            <label
              htmlFor="edit-service-location"
              className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
            >
              Service coverage area <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="edit-service-location"
              type="text"
              value={serviceLocation}
              onChange={(e) => setServiceLocation(e.target.value)}
              maxLength={120}
              placeholder="e.g. Greater Durban, Umhlanga & Ballito"
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            />
          </div>
        </div>
      </section>

      <div className="h-px bg-slate-200/80" />

      {/* Section 4: Skills & Services */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">
            Skills &amp; Services
          </h2>
          <p className="text-sm text-slate-600">
            Add new skills, remove skills you no longer offer, or add custom specialties.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setHasSkills(true)}
            aria-pressed={hasSkills}
            className={`min-h-[48px] rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
              hasSkills
                ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#0B1F3A]'
                : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
            }`}
          >
            Yes, I have skills to offer
          </button>

          <button
            type="button"
            onClick={() => setHasSkills(false)}
            aria-pressed={!hasSkills}
            className={`min-h-[48px] rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
              !hasSkills
                ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0B1F3A]'
                : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
            }`}
          >
            Not right now, just exploring LocalPro
          </button>
        </div>

        {hasSkills && (
          <div className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 sm:p-6">
            <SkillSelector
              allSkills={allSkills}
              selectedSkillIds={selectedSkillIds}
              onChangeSkillIds={setSelectedSkillIds}
              customSkills={customSkills}
              onChangeCustomSkills={setCustomSkills}
              skillDescription={skillDescription}
              onChangeSkillDescription={setSkillDescription}
            />
          </div>
        )}
      </section>

      {formError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
        >
          {formError}
        </div>
      )}

      {/* Save / Cancel Footer */}
      <div className="flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSaving}
          className="btn-royal inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>{isSaving ? 'Saving changes...' : 'Save Profile'}</span>
        </button>
      </div>
    </form>
  );
}
