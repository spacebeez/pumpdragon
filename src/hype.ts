/** Fraternal/brotherly gym-bro hype — bulging muscles, juices flowing, pumping together. */
export const HYPE_PHRASES: string[] = [
  "YUM. that was a lot of power juice. 🐉",
  "the muscles are BULGING, brother. keep it flowing.",
  "absolute unit behavior. the dragon is proud.",
  "the juices are FLOWING today. 💪",
  "we pump as one. the gains are shared.",
  "that's a fat stack of power, big dog.",
  "swole levels critical. the dragon roars.",
  "you just fed the dragon a feast of reps.",
  "muscles? bulging. spirit? soaring. let's GO.",
  "the pump is REAL and it is glorious.",
  "brother... that was beautiful. flex on.",
  "power juice overflowing. somebody get a bucket.",
  "you and me, pumping in harmony. gains everywhere.",
  "the dragon hoards gold AND gains. nice deposit.",
  "certified swole. the council of bros approves.",
  "that's the good stuff. veins like garden hoses.",
  "HUGE. the dragon felt that one from across the lair.",
];

/** Hype lines that weave in the user's own activity words via {detail}. */
export const HYPE_DETAIL_PHRASES: string[] = [
  "🐉 {detail}?? the dragon felt that from across the lair.",
  "BEAST MODE {detail}. the gains are shared, brother.",
  "{detail} like an absolute UNIT. swole council approves. 💪",
  "you fed the dragon a feast of {detail}. glorious.",
  "{detail} and the juices are FLOWING. let's GO.",
];

export type Rng = () => number;

/** Pick a safe in-bounds index for `arr` (clamp guards a pathological rng() === 1). */
function pickIndex(rng: Rng, arr: readonly unknown[]): number {
  return Math.max(0, Math.min(arr.length - 1, Math.floor(rng() * arr.length)));
}

export function randomHypePhrase(rng: Rng = Math.random, detail: string | null = null): string {
  if (detail && detail.trim()) {
    return HYPE_DETAIL_PHRASES[pickIndex(rng, HYPE_DETAIL_PHRASES)]!.replaceAll("{detail}", detail.trim());
  }
  return HYPE_PHRASES[pickIndex(rng, HYPE_PHRASES)]!;
}

const HYPE_REQUEST_RE = /^(hype\b|pump\s+me\b)/i;

/** True if the (mention-stripped) text is a request for hype rather than a log. */
export function isHypeRequest(rest: string): boolean {
  return HYPE_REQUEST_RE.test(rest.trim());
}
