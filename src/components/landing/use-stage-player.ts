'use client';

import { useCallback, useReducer } from 'react';

export type StageMode = 'auto' | 'paused';

export interface StagePlayerState {
  step: number;
  mode: StageMode;
}

export type StageEvent =
  | { type: 'TICK'; stepCount: number }
  | { type: 'JUMP'; step: number }
  | { type: 'HOLD' }
  | { type: 'RELEASE' };

/**
 * The stage has NO JS timer. The rail's CSS fill animation is the master
 * clock: the component dispatches TICK from the fill's onAnimationEnd, so the
 * fill reaching 100% and the step advancing are frame-locked by construction.
 *
 * The line never stops on its own (Tara's rule: one smooth continuous
 * movement). JUMP restarts the clicked step's fill and the rotation continues
 * from there. HOLD/RELEASE exist for keyboard focus and hidden tabs only.
 */
export function stageReducer(state: StagePlayerState, event: StageEvent): StagePlayerState {
  switch (event.type) {
    case 'TICK':
      if (state.mode !== 'auto') return state;
      return { ...state, step: (state.step + 1) % event.stepCount };
    case 'JUMP':
      return { step: event.step, mode: 'auto' };
    case 'HOLD':
      return state.mode === 'auto' ? { ...state, mode: 'paused' } : state;
    case 'RELEASE':
      return state.mode === 'paused' ? { ...state, mode: 'auto' } : state;
  }
}

export function useStagePlayer({
  stepCount,
  enabled,
}: {
  stepCount: number;
  /** false while out of view or under reduced motion — freezes the clock. */
  enabled: boolean;
}) {
  const [state, dispatch] = useReducer(stageReducer, {
    step: 0,
    mode: 'auto',
  } satisfies StagePlayerState);

  const playing = enabled && state.mode === 'auto';

  const tick = useCallback(() => dispatch({ type: 'TICK', stepCount }), [stepCount]);
  const jump = useCallback((step: number) => dispatch({ type: 'JUMP', step }), []);
  const hold = useCallback(() => dispatch({ type: 'HOLD' }), []);
  const release = useCallback(() => dispatch({ type: 'RELEASE' }), []);

  return { step: state.step, mode: state.mode, playing, tick, jump, hold, release };
}
