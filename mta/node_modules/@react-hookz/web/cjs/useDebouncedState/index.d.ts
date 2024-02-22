import { type Dispatch, type SetStateAction } from 'react';
/**
 * Like `useState` but its state setter is debounced.
 *
 * @param initialState Initial state to pass to underlying `useState`.
 * @param delay Debounce delay.
 * @param maxWait Maximum amount of milliseconds that function can be delayed
 * before it's force execution. 0 means no max wait.
 */
export declare function useDebouncedState<S>(initialState: S | (() => S), delay: number, maxWait?: number): [S, Dispatch<SetStateAction<S>>];
