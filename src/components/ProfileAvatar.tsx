import { useEffect, useState } from 'react';

interface ProfileAvatarProps {
  src: string | null | undefined;
  fullName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ProfileAvatarProps['size']>, string> = {
  sm: 'h-10 w-10 text-sm rounded-xl',
  md: 'h-12 w-12 text-base rounded-2xl',
  lg: 'h-20 w-20 text-xl rounded-2xl',
  xl: 'h-24 w-24 sm:h-28 sm:w-28 text-2xl sm:text-3xl rounded-3xl',
};

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'LP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function ProfileAvatar({
  src,
  fullName,
  size = 'md',
  className = '',
}: ProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  const sizeClass = SIZE_CLASSES[size];

  if (src && !imageFailed) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden border border-white/80 bg-[#E6F0FD] shadow-sm ${sizeClass} ${className}`}
      >
        <img
          src={src}
          alt={`${fullName} profile picture`}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-label={`${fullName} avatar initials`}
      className={`flex shrink-0 items-center justify-center border border-white/85 bg-gradient-to-br from-[#0B1F3A] via-[#13315C] to-[#1D4ED8] font-display font-bold tracking-tight text-white shadow-sm ${sizeClass} ${className}`}
    >
      {getInitials(fullName)}
    </div>
  );
}
