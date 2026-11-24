import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { SkillItem } from '../types/auth';

interface SkillSelectorProps {
  allSkills: SkillItem[];
  selectedSkillIds: number[];
  onChangeSkillIds: (nextIds: number[]) => void;
  customSkills: string[];
  onChangeCustomSkills: (nextCustom: string[]) => void;
  skillDescription: string;
  onChangeSkillDescription: (nextDescription: string) => void;
  errorMessage?: string;
}

const CATEGORY_ORDER = [
  'Beauty',
  'Construction and Home Services',
  'Technology',
  'Automotive',
  'Education',
  'Creative Services',
];

export function SkillSelector({
  allSkills,
  selectedSkillIds,
  onChangeSkillIds,
  customSkills,
  onChangeCustomSkills,
  skillDescription,
  onChangeSkillDescription,
  errorMessage,
}: SkillSelectorProps) {
  const [otherExpanded, setOtherExpanded] = useState(customSkills.length > 0);
  const [customInput, setCustomInput] = useState('');
  const [customInputError, setCustomInputError] = useState('');

  const groupedSkills = CATEGORY_ORDER.map((category) => ({
    category,
    items: allSkills.filter((skill) => skill.category === category),
  })).filter((group) => group.items.length > 0);

  function toggleSkill(skillId: number) {
    if (selectedSkillIds.includes(skillId)) {
      onChangeSkillIds(selectedSkillIds.filter((id) => id !== skillId));
    } else {
      onChangeSkillIds([...selectedSkillIds, skillId]);
    }
  }

  function handleAddCustomSkill() {
    const cleaned = customInput.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2) {
      setCustomInputError('Please enter at least 2 characters for your custom skill.');
      return;
    }
    if (cleaned.length > 60) {
      setCustomInputError('Custom skill name must be 60 characters or fewer.');
      return;
    }
    const alreadyExists = customSkills.some(
      (item) => item.toLowerCase() === cleaned.toLowerCase()
    );
    if (alreadyExists) {
      setCustomInputError('You already added that skill.');
      return;
    }
    if (customSkills.length >= 15) {
      setCustomInputError('You can add up to 15 custom skills.');
      return;
    }

    onChangeCustomSkills([...customSkills, cleaned]);
    setCustomInput('');
    setCustomInputError('');
  }

  function handleRemoveCustomSkill(skillName: string) {
    onChangeCustomSkills(customSkills.filter((item) => item !== skillName));
  }

  const totalSelected = selectedSkillIds.length + customSkills.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[#0B1F3A]">
            Select your skills and services
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Choose one or more categories, or add your own specialty under Other.
          </p>
        </div>
        <span className="text-xs font-medium text-[#0D9488] tabular-nums">
          {totalSelected} {totalSelected === 1 ? 'skill' : 'skills'} selected
        </span>
      </div>

      <div className="space-y-5">
        {groupedSkills.map((group) => (
          <div key={group.category} className="space-y-2.5">
            <h4 className="text-sm font-semibold text-[#0B1F3A]">{group.category}</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.items.map((skill) => {
                const isSelected = selectedSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[44px] items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                      isSelected
                        ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#0B1F3A] shadow-xs'
                        : 'border-slate-200/90 bg-white/80 text-slate-700 hover:border-[#93C5FD] hover:bg-white'
                    }`}
                  >
                    <span className="truncate">{skill.name}</span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        isSelected
                          ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Other / Custom Skill section */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-[#0B1F3A]">Other</h4>
            <button
              type="button"
              onClick={() => setOtherExpanded((prev) => !prev)}
              aria-expanded={otherExpanded}
              className={`min-h-[40px] rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                otherExpanded
                  ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E]'
                  : 'border-slate-200 bg-white/85 text-[#0B1F3A] hover:border-slate-300'
              }`}
            >
              {otherExpanded ? 'Hide custom skill field' : 'Add a skill not listed'}
            </button>
          </div>

          {otherExpanded && (
            <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 space-y-3">
              <label
                htmlFor="custom-skill-input"
                className="block text-sm font-medium text-[#0B1F3A]"
              >
                Enter a skill not included in the list above
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="custom-skill-input"
                  type="text"
                  value={customInput}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    if (customInputError) setCustomInputError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomSkill();
                    }
                  }}
                  placeholder="e.g. Solar installer, Upholsterer, Swimming coach"
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSkill}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#13315C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add Skill</span>
                </button>
              </div>
              {customInputError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {customInputError}
                </p>
              )}

              {customSkills.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium text-slate-600">Added custom skills:</p>
                  <div className="flex flex-wrap gap-2">
                    {customSkills.map((customName) => (
                      <span
                        key={customName}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-3 py-1.5 text-xs font-medium text-[#0F766E]"
                      >
                        <span>{customName}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomSkill(customName)}
                          aria-label={`Remove ${customName}`}
                          className="rounded-md p-0.5 text-[#0F766E] hover:bg-[#CCFBF1] focus-visible:outline-2 focus-visible:outline-[#0D9488]"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Optional description field */}
      <div className="space-y-2 pt-1">
        <label
          htmlFor="skill-description"
          className="block text-sm font-medium text-[#0B1F3A]"
        >
          Describe your skills or services <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          id="skill-description"
          rows={3}
          maxLength={500}
          value={skillDescription}
          onChange={(e) => onChangeSkillDescription(e.target.value)}
          placeholder="Briefly share your experience, tools, or areas around KwaZulu-Natal you serve..."
          className="w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
        />
        <div className="flex justify-end text-xs text-slate-500 tabular-nums">
          {skillDescription.length}/500
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
    </div>
  );
}
