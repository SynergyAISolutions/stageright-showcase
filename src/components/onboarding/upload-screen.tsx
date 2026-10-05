'use client';

import { HeroUpload } from '@/components/wizard/hero-upload';
import type { RoomPhoto } from '@/components/wizard/types';
import type { ListingIntent, PropertyType } from '@/types';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';

interface UploadScreenProps {
  heroPhoto: RoomPhoto | null;
  onChange: (photo: RoomPhoto | null) => void;
  onContinue: () => void;
  listingIntent?: ListingIntent | null;
  propertyType?: PropertyType | null;
  onBack?: () => void;
}

export function UploadScreen({
  heroPhoto,
  onChange,
  onContinue,
  listingIntent,
  propertyType,
}: UploadScreenProps) {
  const isLease = listingIntent === 'lease';
  const isCommercial = propertyType === 'commercial';

  const caption = isCommercial
    ? 'Heads up: the catalogue is residential.'
    : isLease
      ? 'For rentals, use an empty room.'
      : 'Any room, empty or furnished.';

  return (
    <OnboardingShell
      cta={
        <OnboardingCta
          label="Continue"
          onClick={onContinue}
          disabled={!heroPhoto}
        />
      }
    >
      <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center text-center">
        <h1 className="font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
          Upload your photo.
        </h1>
        <p className="mt-3 text-[14px] sm:text-[15px] text-sr-terra font-semibold uppercase tracking-[0.16em]">
          {caption}
        </p>
        <div className="mt-8 w-full flex items-center justify-center min-h-0 [&_img]:!max-h-[44vh] md:[&_img]:!max-h-[50vh] lg:[&_img]:!max-h-[42vh] [&_img]:!w-auto">
          <HeroUpload heroPhoto={heroPhoto} onChange={onChange} />
        </div>
      </div>
    </OnboardingShell>
  );
}
