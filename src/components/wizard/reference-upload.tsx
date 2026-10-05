'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { compressImage } from '@/lib/utils/compress-image';
import type { RoomPhoto } from '@/components/wizard/types';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REFERENCES = 3;

interface ReferenceUploadProps {
  photos: RoomPhoto[];
  onChange: (photos: RoomPhoto[]) => void;
}

export function ReferenceUpload({ photos, onChange }: ReferenceUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);
    if (photos.length + fileArray.length > MAX_REFERENCES) {
      setError(`Maximum ${MAX_REFERENCES} reference photos.`);
      return;
    }
    setIsProcessing(true);
    try {
      const added: RoomPhoto[] = [];
      for (const f of fileArray) {
        try {
          if (!f.type.startsWith('image/') && f.type !== '') continue;
          if (f.size > MAX_FILE_SIZE) continue;
          const compressed = await compressImage(f);
          added.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file: f,
            preview: compressed.preview,
            base64: compressed.base64,
            mimeType: compressed.mimeType,
          });
        } catch { /* skip bad files */ }
      }
      if (added.length === 0) {
        setError('Could not read any of those photos. Try JPG or PNG.');
        return;
      }
      onChange([...photos, ...added]);
    } finally {
      setIsProcessing(false);
    }
  }, [photos, onChange]);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-5 rounded-xl border border-sr-terra/20 bg-sr-terra/[0.04] p-4 sm:p-5">
        <p className="text-[11px] font-bold tracking-widest uppercase text-sr-terra">When this helps</p>
        <p className="mt-2 text-sm text-sr-ink leading-relaxed">
          Adding <b>up to 3 reference photos</b> from different angles captures all sides of the room — this helps the AI understand the full layout and avoid hallucinating areas it can&apos;t see. Worth adding when:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-sr-ink list-disc pl-5">
          <li>Your main photo <b className="text-sr-ink">cuts off a doorway</b> or connecting room (open-plan)</li>
          <li>A <b className="text-sr-ink">window, alcove, or fireplace</b> is not visible from the main angle</li>
          <li>The room has <b className="text-sr-ink">unusual lighting</b> or multiple light sources</li>
          <li>It is a <b className="text-sr-ink">long or irregular-shaped</b> room the main photo cannot capture in one frame</li>
        </ul>
        <p className="mt-3 text-xs text-sr-ink-mute">The AI only furnishes your main photo &mdash; extra angles are just for context.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {photos.map((photo, i) => (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-24 sm:w-28 aspect-[4/3] rounded-lg overflow-hidden border border-sr-hairline shadow-soft group"
          >
            <img src={photo.preview} alt={`Reference ${i + 1}`} className="size-full object-cover" />
            <div className="absolute top-1 left-1 size-5 rounded-full bg-black/55 backdrop-blur-sm grid place-items-center">
              <span className="text-[9px] font-bold text-white">R{i + 1}</span>
            </div>
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              aria-label="Remove reference image"
              className="absolute top-1 right-1 size-6 rounded-full bg-black/50 backdrop-blur-sm grid place-items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-sr-ink-mute hover:text-red-600"
            >
              <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                <path d="M1 1l6 6M7 1l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        ))}
        {photos.length < MAX_REFERENCES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
            className="w-24 sm:w-28 aspect-[4/3] rounded-xl border-2 border-dashed border-sr-terra/40 hover:border-sr-terra/60 bg-sr-terra/[0.04] hover:bg-sr-terra/[0.08] flex flex-col items-center justify-center gap-1 transition-all duration-200"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4 text-sr-terra">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] text-sr-ink-mute font-medium">Add angle</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />

      {error && <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>}
    </div>
  );
}
