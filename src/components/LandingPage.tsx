import { ArrowRight, Compass, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { AuthView } from '../types/auth';

interface LandingPageProps {
  onNavigate: (view: AuthView) => void;
}

const LAUNCH_CATEGORIES = [
  {
    name: 'Beauty',
    skills: ['Hairdresser', 'Barber', 'Nail technician', 'Makeup artist'],
  },
  {
    name: 'Construction and Home Services',
    skills: ['Plumber', 'Electrician', 'Painter', 'Carpenter', 'Cleaner'],
  },
  {
    name: 'Technology',
    skills: ['Web developer', 'Graphic designer', 'IT support', 'Computer technician'],
  },
  {
    name: 'Automotive',
    skills: ['Mechanic', 'Car wash', 'Panel beater'],
  },
  {
    name: 'Education',
    skills: ['Tutor', 'Music teacher', 'Academic assistance'],
  },
  {
    name: 'Creative Services',
    skills: ['Photographer', 'Videographer', 'Baker', 'Fashion designer'],
  },
];

interface ResilientImageProps {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
}

function ResilientImage({ src, alt, fallbackTitle, className = '' }: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#DBEAFE] via-[#EFF6FF] to-[#CCFBF1] p-6 text-center ${className}`}
      >
        <Wrench className="h-8 w-8 text-[#1D4ED8]" aria-hidden="true" />
        <p className="font-display text-sm font-semibold text-[#0B1F3A]">{fallbackTitle}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      {/* Hero Split Section */}
      <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col justify-center lg:col-span-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#0D9488]">
            <span>KwaZulu-Natal Launch</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="text-slate-600">South Africa</span>
          </div>

          <h1
            className="mt-4 font-display font-bold tracking-tight text-[#0B1F3A]"
            style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)', lineHeight: 1.08, textWrap: 'balance' }}
          >
            Your skills deserve to be discovered.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            LocalPro is a location-based social platform built to connect skilled individuals
            with people right in their neighbourhood. Showcase your craft, share real completed
            work, and build trusted relationships with customers across KwaZulu-Natal.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="btn-royal inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-2xl px-6 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              <span>Create Account</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="glass-subtle inline-flex min-h-[48px] items-center justify-center whitespace-nowrap shrink-0 rounded-2xl px-6 py-3 text-base font-semibold text-[#0B1F3A] transition-all hover:bg-white hover:border-[#93C5FD] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              Login
            </button>
          </div>

          {/* Clean unboxed trust line (no pills or icons on every line) */}
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/80 pt-5 text-sm text-slate-600">
            <span>One unified account</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>23+ local service categories</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>Durban, Pietermaritzburg &amp; KZN towns</span>
          </div>
        </div>

        {/* Right Hero Visual in Liquid Glass Frame */}
        <div className="lg:col-span-6">
          <div className="glass-panel relative h-full min-h-[320px] overflow-hidden rounded-3xl p-2.5 sm:min-h-[420px]">
            <div className="relative h-full w-full overflow-hidden rounded-[20px]">
              <ResilientImage
                src="/src/assets/images/localpro_kzn_craftsman_1795438668192.jpg"
                alt="Skilled South African carpenter measuring timber in a sunlit KwaZulu-Natal workshop"
                fallbackTitle="Skilled Trades & Craftsmanship in KwaZulu-Natal"
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#07152B]/80 via-[#07152B]/20 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-white">
                <p className="text-xs font-medium text-[#99F6E4]">
                  Construction and Home Services · KwaZulu-Natal
                </p>
                <p className="mt-1 font-display text-lg font-semibold leading-snug">
                  From carpentry and plumbing to photography and web design, local talent belongs in view.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How LocalPro Works - Asymmetric Bento */}
      <section id="how-it-works" className="mt-20 scroll-mt-24 space-y-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[#0D9488]">Built for everyday talent</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
            How LocalPro connects communities and craft
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Primary editorial feature card */}
          <div className="glass-panel flex flex-col justify-between overflow-hidden rounded-3xl p-6 sm:p-8 lg:col-span-7">
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#0B1F3A]">
                  01. One account for exploring and offering services
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Every member joins with a single LocalPro account. Browse nearby talent, save
                  trusted providers, or activate your skills profile whenever you are ready to
                  showcase your work.
                </p>
              </div>

              <div className="h-px bg-slate-200/80" />

              <div>
                <h3 className="font-display text-lg font-semibold text-[#0B1F3A]">
                  02. Location-first discovery in KwaZulu-Natal
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Whether you are in Durban, Umhlanga, Pietermaritzburg, Richards Bay, or
                  Newcastle, LocalPro anchors connections to real cities, towns, and suburbs.
                </p>
              </div>

              <div className="h-px bg-slate-200/80" />

              <div>
                <h3 className="font-display text-lg font-semibold text-[#0B1F3A]">
                  03. Proof through completed work
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Create your authenticated account today and set up your skill profile. Upcoming
                  LocalPro modules will bring photo galleries, community feeds, and direct customer
                  enquiries.
                </p>
              </div>
            </div>
          </div>

          {/* Visual stack of two domain images */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            <div className="glass-subtle overflow-hidden rounded-3xl p-2">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]">
                <ResilientImage
                  src="/src/assets/images/localpro_tech_studio_1795438668049.jpg"
                  alt="South African web developer and designer working at a sunlit Durban studio"
                  fallbackTitle="Technology & Creative Services"
                  className="h-full w-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#07152B]/75 via-transparent to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-xs font-medium text-[#BFDBFE]">Technology · Durban</p>
                  <p className="text-sm font-semibold">Web developers, designers &amp; IT support</p>
                </div>
              </div>
            </div>

            <div className="glass-subtle overflow-hidden rounded-3xl p-2">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]">
                <ResilientImage
                  src="/src/assets/images/localpro_beauty_salon_1795438667878.jpg"
                  alt="Hairstylist and makeup artist preparing tools in a bright contemporary studio"
                  fallbackTitle="Beauty & Personal Care"
                  className="h-full w-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#07152B]/75 via-transparent to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-xs font-medium text-[#99F6E4]">Beauty · Pietermaritzburg</p>
                  <p className="text-sm font-semibold">Hairdressers, barbers &amp; makeup artists</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Skill Categories Directory Preview */}
      <section id="skill-categories" className="mt-20 scroll-mt-24 space-y-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-[#0D9488]">Launch Categories</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
              Skills supported at registration
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-600">
            Choose multiple skills across six categories or enter your own specialty under Other.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LAUNCH_CATEGORIES.map((category) => (
            <div
              key={category.name}
              className="glass-subtle rounded-2xl p-5 transition-colors hover:bg-white/90"
            >
              <h3 className="font-display text-base font-semibold text-[#0B1F3A]">
                {category.name}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                {category.skills.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Conversion Block */}
      <section className="mt-20">
        <div className="glass-panel flex flex-col items-start justify-between gap-6 rounded-3xl p-7 sm:flex-row sm:items-center sm:p-10">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
              Ready to join LocalPro in KwaZulu-Natal?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
              Register in two quick steps with your location and optional skills, or sign in to
              your existing account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="btn-royal inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            >
              <span>Create Account</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="inline-flex min-h-[46px] items-center justify-center whitespace-nowrap shrink-0 rounded-xl border border-slate-200 bg-white/90 px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-white"
            >
              Login
            </button>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-slate-200/80 pt-8 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display font-semibold text-[#0B1F3A]">LocalPro</span>
          <span aria-hidden="true">·</span>
          <span>Your skills deserve to be discovered.</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-[#0D9488]" aria-hidden="true" />
            KwaZulu-Natal, South Africa
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1 text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
            Secure Authentication Module
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            <Compass className="h-3.5 w-3.5 text-[#0D9488]" aria-hidden="true" />
            Authentication Milestone
          </span>
        </div>
      </footer>
    </main>
  );
}
