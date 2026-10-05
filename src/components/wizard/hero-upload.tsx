'use client';

import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { compressImage } from '@/lib/utils/compress-image';
import type { RoomPhoto } from '@/components/wizard/types';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

async function fileToRoomPhoto(file: File): Promise<RoomPhoto> {
  const isImage = file.type.startsWith('image/') || file.type === '';
  if (!isImage) throw new Error('Please select an image file.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Image must be under 20MB.');
  const compressed = await compressImage(file);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    preview: compressed.preview,
    base64: compressed.base64,
    mimeType: compressed.mimeType,
  };
}

interface HeroUploadProps {
  heroPhoto: RoomPhoto | null;
  onChange: (photo: RoomPhoto | null) => void;
}

export function HeroUpload({ heroPhoto, onChange }: HeroUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setIsProcessing(true);
    try {
      const photo = await fileToRoomPhoto(file);
      onChange(photo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read that photo.';
      setError(msg.includes('Failed to load image') ? 'This photo format is not supported. Try JPG or PNG.' : msg);
    } finally {
      setIsProcessing(false);
    }
  }, [onChange]);

  if (heroPhoto) {
    // Wrapper is centred and bounded; inner div is inline-block so it hugs
    // the img's actual rendered size. The img uses max-w-full + max-h
    // with w-auto/h-auto so the browser picks the correct fit for ANY
    // aspect (portrait, landscape, square) — never cropped, never stretched.
    return (
      <div className="mx-auto w-full max-w-[480px] flex justify-center">
        <div className="relative inline-block rounded-2xl overflow-hidden border border-sr-hairline shadow-soft bg-sr-cream">
          <img
            src={heroPhoto.preview}
            alt="Room to stage"
            className="block max-w-full w-auto h-auto max-h-[65vh] sm:max-h-[70vh]"
          />
          <div className="absolute top-3 left-3 bg-sr-ink/80 backdrop-blur-sm text-[10px] font-bold text-white px-2.5 py-1 rounded-lg uppercase tracking-wider">
            Photo to stage
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/50 to-transparent">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-white/80 hover:text-white bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              Change photo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[480px]">
      <div
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={cn(
          // No fixed aspect ratio — drop zone shrinks to fit available space.
          // Viewport-aware height ensures it never forces a scroll on the
          // wizard card, regardless of container size.
          'relative w-full h-[36vh] min-h-[200px] max-h-[340px] sm:h-[40vh] sm:max-h-[380px] rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-sr-terra/60 bg-sr-terra/[0.08] scale-[1.01]'
            : 'border-sr-terra/40 bg-sr-terra/[0.04] hover:border-sr-terra/60 hover:bg-sr-terra/[0.08]',
          isProcessing && 'pointer-events-none opacity-80',
        )}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {isProcessing ? (
            <>
              <div className="size-10 border-[3px] border-sr-terra border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-base font-medium text-sr-ink">Processing photo&hellip;</p>
            </>
          ) : (
            <>
              <div className="size-14 rounded-2xl bg-sr-cream-soft border border-sr-hairline flex items-center justify-center mb-4">
                <svg viewBox="0 0 24 24" fill="none" className="size-7 text-sr-terra">
                  <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 6V5a2 2 0 012-2h4a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="text-base font-medium text-sr-ink">Tap to take a photo or choose one</p>
              <p className="mt-1.5 text-sm text-sr-ink-mute">This is the photo that will be furnished</p>
            </>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
        className="hidden"
      />
      {error && <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>}
    </div>
  );
}
