/**
 * Like `setInterval` but in the form of a React hook.
 *
 * @param callback Function to call within the interval.
 * @param ms Delay passed to the underlying `setInterval`. If set to `undefined`, the interval will
 * be cancelled. Keep in mind, that changing this parameter will reset the interval.
 */
export declare function useIntervalEffect(callback: () => void, ms?: number): void;
