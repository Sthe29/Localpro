import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, MapPin, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DEFAULT_PROVINCE, PROVINCE_LIST, SOUTH_AFRICA_LOCATIONS } from '../data/locations';
import { registerAccount } from '../services/authApi';
import type { AuthResponse, AuthView, SkillItem } from '../types/auth';
import { SkillSelector } from './SkillSelector';

interface RegisterPageProps {
  allSkills: SkillItem[];
  onNavigate: (view: AuthView) => void;
  onAuthSuccess: (response: AuthResponse) => void;
}

interface Step1Errors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  province?: string;
  city?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function RegisterPage({ allSkills, onNavigate, onAuthSuccess }: RegisterPageProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state: Personal Info & Location
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [province, setProvince] = useState(DEFAULT_PROVINCE);
  const [selectedCityOption, setSelectedCityOption] = useState('Durban');
  const [customCity, setCustomCity] = useState('');
  const [suburb, setSuburb] = useState('');
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});

  // Step 2 state: Skills & Talents
  const [hasSkillsChoice, setHasSkillsChoice] = useState<'yes' | 'no' | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [skillDescription, setSkillDescription] = useState('');

  const [step2Error, setStep2Error] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableCities = SOUTH_AFRICA_LOCATIONS[province] ?? [];
  const effectiveCity =
    selectedCityOption === '__other__' ? customCity.trim() : selectedCityOption;

  function handleProvinceChange(nextProvince: string) {
    setProvince(nextProvince);
    const nextCities = SOUTH_AFRICA_LOCATIONS[nextProvince] ?? [];
    setSelectedCityOption(nextCities[0] ?? '__other__');
    setCustomCity('');
    setStep1Errors((prev) => ({ ...prev, province: undefined, city: undefined }));
  }

  function validateStep1(): boolean {
    const errors: Step1Errors = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      errors.fullName = 'Please enter your full name (at least 2 characters).';
    } else if (trimmedName.length > 100) {
      errors.fullName = 'Full name must be 100 characters or fewer.';
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address (for example, name@example.com).';
    }

    if (password.length < 10) {
      errors.password = 'Password must be at least 10 characters long.';
    } else if (
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      errors.password =
        'Password must include uppercase, lowercase, a number, and a special character.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (!province) {
      errors.province = 'Please select your province.';
    }

    if (!effectiveCity) {
      errors.city = 'Please select or enter your city or town.';
    }

    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleNextStep(e: FormEvent) {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function handleSubmitRegistration(e: FormEvent) {
    e.preventDefault();
    setStep2Error('');
    setSubmitError('');

    if (hasSkillsChoice === null) {
      setStep2Error('Please let us know whether you have skills or services to offer.');
      return;
    }

    const hasSkills = hasSkillsChoice === 'yes';
    if (hasSkills && selectedSkillIds.length === 0 && customSkills.length === 0) {
      setStep2Error('Please select at least one skill or add a custom skill under Other.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await registerAccount({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        province,
        city: effectiveCity,
        suburb: suburb.trim(),
        hasSkills,
        skillIds: hasSkills ? selectedSkillIds : [],
        customSkills: hasSkills ? customSkills : [],
        skillDescription: hasSkills ? skillDescription.trim() : '',
      });
      onAuthSuccess(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to create your account right now.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasMinLength = password.length >= 10;
  const hasUpperAndLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="glass-panel rounded-3xl p-6 sm:p-10">
        {/* Top Progress Header */}
        <div className="space-y-4 border-b border-slate-200/80 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#0D9488] tabular-nums">
                Step {step} of 2
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
                Create your LocalPro account
              </h1>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="text-xs font-semibold text-slate-500 transition-colors hover:text-[#0B1F3A]"
            >
              Back to home
            </button>
          </div>

          {/* 2-Step Visual Progress Indicator */}
          <div aria-label="Registration progress" className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="group flex flex-col gap-1.5 text-left"
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-full rounded-full bg-gradient-to-r from-[#1D4ED8] to-[#0D9488]" />
              </div>
              <span
                className={`text-xs font-semibold ${
                  step === 1 ? 'text-[#0B1F3A]' : 'text-[#0D9488]'
                }`}
              >
                1. Personal info &amp; location
              </span>
            </button>

            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-[#1D4ED8] to-[#0D9488] transition-all duration-300 ${
                    step === 2 ? 'w-full' : 'w-0'
                  }`}
                />
              </div>
              <span
                className={`text-xs font-semibold ${
                  step === 2 ? 'text-[#0B1F3A]' : 'text-slate-400'
                }`}
              >
                2. Skills &amp; talents
              </span>
            </div>
          </div>
        </div>

        {/* STEP 1: Personal Information & Location */}
        {step === 1 && (
          <form onSubmit={handleNextStep} noValidate className="mt-7 space-y-7">
            {/* Section 1A: Personal Information */}
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">
                  Personal Information
                </h2>
                <p className="text-sm text-slate-600">
                  One unified account lets you browse local services and showcase your own skills.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="reg-fullname"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    Full name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="reg-fullname"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (step1Errors.fullName) {
                        setStep1Errors((prev) => ({ ...prev, fullName: undefined }));
                      }
                    }}
                    placeholder="e.g. Sipho Ndlovu"
                    aria-invalid={Boolean(step1Errors.fullName)}
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  {step1Errors.fullName && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                      {step1Errors.fullName}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="reg-email"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    Email address <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (step1Errors.email) {
                        setStep1Errors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    placeholder="you@example.com"
                    aria-invalid={Boolean(step1Errors.email)}
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  {step1Errors.email && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                      {step1Errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reg-password"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    Password <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (step1Errors.password) {
                          setStep1Errors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      placeholder="Minimum 10 characters"
                      aria-invalid={Boolean(step1Errors.password)}
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
                  {step1Errors.password && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                      {step1Errors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reg-confirm-password"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    Confirm password <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="reg-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (step1Errors.confirmPassword) {
                          setStep1Errors((prev) => ({ ...prev, confirmPassword: undefined }));
                        }
                      }}
                      placeholder="Re-enter password"
                      aria-invalid={Boolean(step1Errors.confirmPassword)}
                      className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 py-2.5 pl-3.5 pr-11 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={
                        showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'
                      }
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-[#0B1F3A]"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {step1Errors.confirmPassword && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                      {step1Errors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              {/* Password requirements guidance */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                <span
                  className={`inline-flex items-center gap-1 ${
                    hasMinLength ? 'font-medium text-[#0D9488]' : ''
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  10+ characters
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    hasUpperAndLower ? 'font-medium text-[#0D9488]' : ''
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Uppercase &amp; lowercase
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    hasNumber ? 'font-medium text-[#0D9488]' : ''
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Includes a number
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    hasSpecial ? 'font-medium text-[#0D9488]' : ''
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Special character
                </span>
              </div>
            </section>

            <div className="h-px bg-slate-200/80" />

            {/* Section 1B: Location */}
            <section className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">
                    Your Location
                  </h2>
                  <p className="text-sm text-slate-600">
                    LocalPro launches in KwaZulu-Natal, while supporting communities across South Africa.
                  </p>
                </div>
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#0D9488]" aria-hidden="true" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="reg-province"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    Province <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="reg-province"
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
                  {step1Errors.province && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                      {step1Errors.province}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reg-city"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    City / town <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="reg-city"
                    value={selectedCityOption}
                    onChange={(e) => {
                      setSelectedCityOption(e.target.value);
                      if (step1Errors.city) {
                        setStep1Errors((prev) => ({ ...prev, city: undefined }));
                      }
                    }}
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  >
                    {availableCities.map((cityName) => (
                      <option key={cityName} value={cityName}>
                        {cityName}
                      </option>
                    ))}
                    <option value="__other__">Other city or town...</option>
                  </select>
                  {step1Errors.city && selectedCityOption !== '__other__' && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                      {step1Errors.city}
                    </p>
                  )}
                </div>

                {selectedCityOption === '__other__' && (
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="reg-custom-city"
                      className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                    >
                      Enter your city or town <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-custom-city"
                      type="text"
                      value={customCity}
                      onChange={(e) => {
                        setCustomCity(e.target.value);
                        if (step1Errors.city) {
                          setStep1Errors((prev) => ({ ...prev, city: undefined }));
                        }
                      }}
                      placeholder="Enter city or town name"
                      className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                    {step1Errors.city && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                        {step1Errors.city}
                      </p>
                    )}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="reg-suburb"
                    className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                  >
                    Suburb <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    id="reg-suburb"
                    type="text"
                    value={suburb}
                    onChange={(e) => setSuburb(e.target.value)}
                    placeholder="e.g. Morningside, Glenwood, Scottsville, Phoenix"
                    className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                </div>
              </div>
            </section>

            {/* Step 1 Footer Actions */}
            <div className="flex flex-col-reverse items-stretch justify-between gap-4 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-center">
              <p className="text-center text-sm text-slate-600 sm:text-left">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="font-semibold text-[#1D4ED8] hover:underline"
                >
                  Login
                </button>
              </p>

              <button
                type="submit"
                className="btn-royal inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl px-6 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <span>Continue to Skills</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Skills and Talents */}
        {step === 2 && (
          <form onSubmit={handleSubmitRegistration} noValidate className="mt-7 space-y-7">
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0B1F3A]">
                  Do you have any skills or services you&apos;d like to offer?
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  You can always add or update your skills later from your account.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setHasSkillsChoice('yes');
                    setStep2Error('');
                  }}
                  aria-pressed={hasSkillsChoice === 'yes'}
                  className={`flex min-h-[76px] flex-col justify-center rounded-2xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                    hasSkillsChoice === 'yes'
                      ? 'border-[#1D4ED8] bg-[#EFF6FF] shadow-xs'
                      : 'border-slate-200/90 bg-white/80 hover:border-[#93C5FD] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-[#0B1F3A]">
                      Yes, I have skills to offer.
                    </span>
                    <Sparkles
                      className={`h-4 w-4 shrink-0 ${
                        hasSkillsChoice === 'yes' ? 'text-[#1D4ED8]' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="mt-1 text-xs text-slate-600">
                    Select your categories so neighbours can discover your services.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHasSkillsChoice('no');
                    setStep2Error('');
                  }}
                  aria-pressed={hasSkillsChoice === 'no'}
                  className={`flex min-h-[76px] flex-col justify-center rounded-2xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                    hasSkillsChoice === 'no'
                      ? 'border-[#0D9488] bg-[#F0FDFA] shadow-xs'
                      : 'border-slate-200/90 bg-white/80 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <span className="font-display text-sm font-semibold text-[#0B1F3A]">
                    Not right now, I just want to explore LocalPro.
                  </span>
                  <span className="mt-1 text-xs text-slate-600">
                    Discover local talent first and add skills whenever you choose.
                  </span>
                </button>
              </div>
            </section>

            {hasSkillsChoice === 'yes' && (
              <div className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 sm:p-6">
                <SkillSelector
                  allSkills={allSkills}
                  selectedSkillIds={selectedSkillIds}
                  onChangeSkillIds={(nextIds) => {
                    setSelectedSkillIds(nextIds);
                    if (step2Error) setStep2Error('');
                  }}
                  customSkills={customSkills}
                  onChangeCustomSkills={(nextCustom) => {
                    setCustomSkills(nextCustom);
                    if (step2Error) setStep2Error('');
                  }}
                  skillDescription={skillDescription}
                  onChangeSkillDescription={setSkillDescription}
                />
              </div>
            )}

            {step2Error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
              >
                {step2Error}
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
              >
                <p>{submitError}</p>
                {submitError.toLowerCase().includes('already exists') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('login')}
                    className="mt-2 font-semibold text-[#1D4ED8] underline"
                  >
                    Go to Login page
                  </button>
                )}
              </div>
            )}

            {/* Step 2 Footer Actions */}
            <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl border border-slate-200 bg-white/85 px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-white disabled:opacity-60"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Step 1</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-royal inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <span>{isSubmitting ? 'Creating account...' : 'Create Account'}</span>
                {!isSubmitting && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
