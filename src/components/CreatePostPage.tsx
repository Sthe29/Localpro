import { ArrowLeft, Camera, Check, MapPin, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { PROVINCE_LIST, SOUTH_AFRICA_LOCATIONS } from '../data/locations';
import { createPostRequest, uploadPostImage } from '../services/postApi';
import type { CategoryItem, PostItem, UserProfile } from '../types/auth';

interface CreatePostPageProps {
  user: UserProfile;
  authToken: string;
  categories: CategoryItem[];
  onPostCreated: (newPost: PostItem) => void;
  onCancel: () => void;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function CreatePostPage({
  user,
  authToken,
  categories,
  onPostCreated,
  onCancel,
}: CreatePostPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initialProvince = PROVINCE_LIST.includes(user.province) ? user.province : 'KwaZulu-Natal';
  const initialCities = SOUTH_AFRICA_LOCATIONS[initialProvince] ?? [];
  const cityIsPreset = initialCities.includes(user.city);

  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number>(categories[0]?.id ?? 1);
  const [province, setProvince] = useState(initialProvince);
  const [selectedCityOption, setSelectedCityOption] = useState(
    cityIsPreset ? user.city : '__other__'
  );
  const [customCity, setCustomCity] = useState(cityIsPreset ? '' : user.city);
  const [suburb, setSuburb] = useState(user.suburb);
  const [priceText, setPriceText] = useState('');

  const [selectedImages, setSelectedImages] = useState<Array<{ file: File; previewUrl: string }>>(
    []
  );
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // Sync default category once loaded
  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    return () => {
      for (const item of selectedImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [selectedImages]);

  const availableCities = SOUTH_AFRICA_LOCATIONS[province] ?? [];
  const effectiveCity =
    selectedCityOption === '__other__' ? customCity.trim() : selectedCityOption;

  function handleProvinceChange(nextProvince: string) {
    setProvince(nextProvince);
    const nextCities = SOUTH_AFRICA_LOCATIONS[nextProvince] ?? [];
    setSelectedCityOption(nextCities[0] ?? '__other__');
    setCustomCity('');
  }

  function handleSelectFiles(e: ChangeEvent<HTMLInputElement>) {
    setImageError('');
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (selectedImages.length + files.length > 6) {
      setImageError('You can upload up to 6 images per post.');
      e.target.value = '';
      return;
    }

    const added: Array<{ file: File; previewUrl: string }> = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setImageError('Only JPG, PNG, and WebP images are supported.');
        e.target.value = '';
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError(`"${file.name}" exceeds the 5 MB image limit.`);
        e.target.value = '';
        return;
      }
      added.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    setSelectedImages((prev) => [...prev, ...added]);
    e.target.value = '';
  }

  function handleRemoveImage(index: number) {
    const target = selectedImages[index];
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 5 || trimmedDesc.length > 1500) {
      setFormError('Please describe your completed work (5 to 1500 characters).');
      return;
    }
    if (!categoryId) {
      setFormError('Please select a skill or service category.');
      return;
    }
    if (!province || !effectiveCity) {
      setFormError('Please specify the province and city or town for this post.');
      return;
    }

    setIsPublishing(true);
    try {
      const uploadedUrls: string[] = [];
      for (const item of selectedImages) {
        const imageUrl = await uploadPostImage(authToken, item.file);
        uploadedUrls.push(imageUrl);
      }

      const created = await createPostRequest(authToken, {
        description: trimmedDesc,
        categoryId,
        province,
        city: effectiveCity,
        suburb: suburb.trim(),
        priceText: priceText.trim(),
        images: uploadedUrls,
      });

      onPostCreated(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to publish post right now.');
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <form onSubmit={handleSubmit} noValidate className="glass-panel rounded-3xl p-6 sm:p-10 space-y-7">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div>
            <p className="text-xs font-semibold text-[#0D9488]">Showcase Completed Work</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
              Create a Post
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Share photos of work you have completed so nearby customers can discover your skills.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0B1F3A]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Feed</span>
          </button>
        </div>

        {/* Section 1: Image Upload with Preview */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Photos of Your Work
              </h2>
              <p className="text-xs text-slate-600">
                Upload up to 6 JPG, PNG, or WebP images (max 5 MB each). Preview before publishing.
              </p>
            </div>
            <span className="text-xs font-semibold text-[#0D9488] tabular-nums">
              {selectedImages.length}/6
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSelectFiles}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="glass-subtle flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-dashed border-[#93C5FD] px-6 py-8 text-center transition-colors hover:bg-white/90"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#1D4ED8]">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-display text-sm font-semibold text-[#0B1F3A]">
              Click to select work photos
            </span>
            <span className="text-xs text-slate-500">
              Completed installations, before-and-after shots, designs, or craftwork
            </span>
          </button>

          {imageError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {imageError}
            </p>
          )}

          {selectedImages.length > 0 && (
            <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
              {selectedImages.map((item, index) => (
                <div
                  key={item.previewUrl}
                  className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                >
                  <img
                    src={item.previewUrl}
                    alt={`Selected work preview ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    aria-label={`Remove image ${index + 1}`}
                    className="absolute right-2 top-2 rounded-full bg-[#07152B]/80 p-1.5 text-white transition-colors hover:bg-[#07152B]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Description & Category */}
        <section className="space-y-4">
          <div>
            <label
              htmlFor="post-description"
              className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
            >
              Post description <span className="text-red-600">*</span>
            </label>
            <textarea
              id="post-description"
              rows={4}
              maxLength={1500}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="Example: Successfully completed a bathroom plumbing installation in Durban North. Available for new plumbing jobs."
              className="w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            />
            <div className="mt-1 flex justify-end text-xs text-slate-500 tabular-nums">
              {description.length}/1500
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="post-category"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Skill / service category <span className="text-red-600">*</span>
              </label>
              <select
                id="post-category"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="post-price"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Price or price range <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="post-price"
                type="text"
                maxLength={60}
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="e.g. From R450 or R1,200 – R2,500"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Location */}
        <section className="space-y-4 border-t border-slate-200/80 pt-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Work Location
              </h2>
              <p className="text-xs text-slate-600">
                Prefilled from your profile so nearby users discover your work first.
              </p>
            </div>
            <MapPin className="h-5 w-5 text-[#0D9488]" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="post-province"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Province <span className="text-red-600">*</span>
              </label>
              <select
                id="post-province"
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
              <label
                htmlFor="post-city"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                City / town <span className="text-red-600">*</span>
              </label>
              <select
                id="post-city"
                value={selectedCityOption}
                onChange={(e) => setSelectedCityOption(e.target.value)}
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              >
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__other__">Other city or town...</option>
              </select>
            </div>

            {selectedCityOption === '__other__' && (
              <div className="sm:col-span-2">
                <label
                  htmlFor="post-custom-city"
                  className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
                >
                  Enter city or town <span className="text-red-600">*</span>
                </label>
                <input
                  id="post-custom-city"
                  type="text"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                  placeholder="Enter city or town name"
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A]"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label
                htmlFor="post-suburb"
                className="mb-1.5 block text-sm font-medium text-[#0B1F3A]"
              >
                Suburb <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="post-suburb"
                type="text"
                maxLength={100}
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                placeholder="e.g. Durban North, Scottsville, Umhlanga"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              />
            </div>
          </div>
        </section>

        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
          >
            {formError}
          </div>
        )}

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPublishing}
            className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPublishing}
            className="btn-royal inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-65"
          >
            {isPublishing ? (
              <>
                <Camera className="h-4 w-4" aria-hidden="true" />
                <span>Publishing Post...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Publish Post</span>
              </>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}
