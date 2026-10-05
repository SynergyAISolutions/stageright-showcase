'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface RoomAnalysisProps {
  analysis: string;
  onAnalysisChange: (analysis: string) => void;
  isLoading: boolean;
  className?: string;
}

export function RoomAnalysis({
  analysis,
  onAnalysisChange,
  isLoading,
  className,
}: RoomAnalysisProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(analysis);

  if (isLoading) {
    return (
      <div className={cn('bg-white rounded-xl border border-surface-border p-4', className)}>
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-brand-teal/10 flex items-center justify-center">
            <motion.svg
              viewBox="0 0 20 20"
              fill="none"
              className="size-4 text-brand-teal"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 30" />
            </motion.svg>
          </div>
          <div>
            <p className="text-sm font-medium text-brand-navy">Analysing room layout...</p>
            <p className="text-xs text-ink-muted">AI is identifying zones and features</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className={cn('bg-white rounded-xl border border-surface-border overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-secondary/50">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-brand-teal/10 flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-brand-teal">
              <path d="M8 1v14M1 8h14M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-brand-navy">Room Analysis</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isEditing) {
              onAnalysisChange(editText);
              setIsEditing(false);
            } else {
              setEditText(analysis);
              setIsEditing(true);
            }
          }}
          className="text-xs text-ink-muted hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-surface-tertiary"
        >
          {isEditing ? 'Save' : 'Edit'}
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          {isEditing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={6}
                className="w-full text-sm text-ink bg-surface-secondary border border-surface-border rounded-lg px-3 py-2.5 placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal/40 resize-none"
              />
              <p className="mt-2 text-xs text-ink-muted">
                Edit the analysis to guide furniture placement. The AI will follow these instructions.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto"
            >
              {analysis}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
