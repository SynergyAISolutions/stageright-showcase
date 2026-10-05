import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { BonusCreditEnvelope } from '@/components/staging/bonus-credit-envelope';

describe('BonusCreditEnvelope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the celebration card with editorial copy', () => {
    // Updated for Plan 3 redesign — the envelope now uses the editorial
    // "FREE CREDIT" eyebrow + Fraunces "A gift, on us." headline + a small
    // sub note. ARIA status role is no longer used; tap-to-dismiss is the
    // affordance.
    const onDismiss = vi.fn();
    render(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={onDismiss} />
      </AnimatePresence>,
    );
    expect(screen.getByText(/^Free credit$/i)).toBeInTheDocument();
    expect(screen.getByText(/a gift, on/i)).toBeInTheDocument();
    expect(screen.getByText(/just landed/i)).toBeInTheDocument();
  });

  it('auto-dismisses after ~6 seconds', () => {
    const onDismiss = vi.fn();
    render(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={onDismiss} />
      </AnimatePresence>,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest onDismiss via ref (doesn't reset the timer on parent re-render)", () => {
    const firstOnDismiss = vi.fn();
    const secondOnDismiss = vi.fn();
    const { rerender } = render(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={firstOnDismiss} />
      </AnimatePresence>,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={secondOnDismiss} />
      </AnimatePresence>,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(firstOnDismiss).not.toHaveBeenCalled();
    expect(secondOnDismiss).toHaveBeenCalledTimes(1);
  });
});
