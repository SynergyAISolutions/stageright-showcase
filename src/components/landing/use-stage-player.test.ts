// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { stageReducer, useStagePlayer } from './use-stage-player';
import type { StagePlayerState } from './use-stage-player';

const auto: StagePlayerState = { step: 0, mode: 'auto' };

describe('stageReducer', () => {
  it('TICK advances and wraps 3 -> 0', () => {
    expect(stageReducer({ ...auto, step: 2 }, { type: 'TICK', stepCount: 4 }).step).toBe(3);
    expect(stageReducer({ ...auto, step: 3 }, { type: 'TICK', stepCount: 4 }).step).toBe(0);
  });

  it('TICK is ignored while paused (a paused fill never advances the step)', () => {
    expect(stageReducer({ step: 1, mode: 'paused' }, { type: 'TICK', stepCount: 4 }).step).toBe(1);
  });

  it('JUMP sets the step and keeps the rotation running', () => {
    expect(stageReducer(auto, { type: 'JUMP', step: 2 })).toEqual({ step: 2, mode: 'auto' });
    // Jumping while paused (e.g. keyboard focus) resumes the show at that step.
    expect(stageReducer({ step: 0, mode: 'paused' }, { type: 'JUMP', step: 3 })).toEqual({
      step: 3,
      mode: 'auto',
    });
  });

  it('HOLD pauses; RELEASE resumes', () => {
    const held = stageReducer(auto, { type: 'HOLD' });
    expect(held.mode).toBe('paused');
    expect(stageReducer(held, { type: 'RELEASE' }).mode).toBe('auto');
    expect(stageReducer(auto, { type: 'RELEASE' })).toEqual(auto);
  });
});

describe('useStagePlayer', () => {
  it('tick advances while in auto mode', () => {
    const { result } = renderHook(() => useStagePlayer({ stepCount: 4, enabled: true }));
    expect(result.current.step).toBe(0);
    act(() => result.current.tick());
    expect(result.current.step).toBe(1);
    act(() => result.current.tick());
    expect(result.current.step).toBe(2);
  });

  it('playing stays true after a jump (the line keeps moving)', () => {
    const { result } = renderHook(() => useStagePlayer({ stepCount: 4, enabled: true }));
    act(() => result.current.jump(3));
    expect(result.current.step).toBe(3);
    expect(result.current.playing).toBe(true);
    act(() => result.current.tick());
    expect(result.current.step).toBe(0);
  });

  it('playing is false when disabled or held; hold/release keep the step', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useStagePlayer({ stepCount: 4, enabled }),
      { initialProps: { enabled: true } }
    );
    rerender({ enabled: false });
    expect(result.current.playing).toBe(false);
    rerender({ enabled: true });
    act(() => result.current.tick());
    act(() => result.current.hold());
    expect(result.current.playing).toBe(false);
    expect(result.current.step).toBe(1);
    act(() => result.current.release());
    expect(result.current.playing).toBe(true);
    expect(result.current.step).toBe(1);
  });
});
