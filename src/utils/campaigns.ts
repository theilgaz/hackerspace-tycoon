import type { CampaignId } from '@/game/types';

/**
 * Advertising a build once it has shipped (the ship report). **A campaign multiplies the
 * build's own hype**, so what it is worth is decided by the build: a fresh, good build is
 * worth shouting about, a fourth Space Website is not, and the price is the same either way.
 * That is the decision — not "which campaign", but "is this one worth it".
 *
 * Every lira of it is balance, so it lives here rather than at a call site.
 */
export const CAMPAIGN = {
  /** Days after release a campaign can still run — after that it is old news. */
  windowDays: 3,
  /** Share of the reputation gained that also lands on attention (§6's hype). */
  attention: 1,
  /** Hours of your day to set one up, like any other verb (§3a). */
  hours: 1,
  /**
   * **Attention sells.** Every point of reputation a campaign wins brings this much in sales
   * — kits, orders, a sponsor's call — paid over `salesDays`. It is what makes advertising a
   * good build an investment rather than a purchase: done well it pays for itself and the
   * next build's budget, done on a weak or repeated build it does not.
   */
  salesPerRep: 25,
  salesDays: 7,
  /** How far a reviewer's reading of a build can stray from its quality, either way. */
  reviewNoise: 0.1,
};

/**
 * The ship report's verdict against the pitch's forecast. Measured in `era-pace` (2 seeds,
 * 150 days): with +0.03 as the bar, three bigger builds in four "beat the plan", which made
 * it a label rather than news.
 */
export const REPORT = {
  aboveQuality: 0.1,
  abovePay: 1.12,
  belowQuality: 0.05,
  /**
   * Late is past `lateFactor` × the forecast plus `lateSlack` days. The forecast now counts
   * a failed test's cost (`retryDays`); measured over the first 90 days of `era-pace`, one
   * medium or large build in twelve runs that late — a real miss, not the calendar.
   */
  lateFactor: 1.5,
  lateSlack: 2,
};

export interface CampaignDef {
  id: CampaignId;
  icon: 'image' | 'users' | 'star' | 'rocket';
  cost: number;
  /** Multiplier on the build's hype, as a function of the quality it is judged at. May be negative. */
  gain: (quality: number) => number;
  /** A reviewer judges it: the quality it is read at strays by `reviewNoise`. */
  judged?: boolean;
}

export const CAMPAIGNS: CampaignDef[] = [
  // Cheap and safe: a stack of flyers and a talk at the next meetup.
  { id: 'flyers', icon: 'image', cost: 1200, gain: () => 0.25 },
  // Paid posts: more reach, still nobody judging it.
  { id: 'social', icon: 'users', cost: 4500, gain: () => 0.6 },
  // A maker on YouTube reviews it — honestly. **A weak build gets torn apart**: past the
  // middle the review is worth up to ×2.4, under it the space loses up to twice what the build
  // earned, and a reviewer's reading strays a little either way, so the middle is a gamble.
  {
    id: 'review',
    icon: 'star',
    cost: 9000,
    judged: true,
    gain: (quality) => Math.max(-2, Math.min(2.4, 6 * (quality - 0.5))),
  },
  // A launch night with press: the biggest and the dearest.
  { id: 'launch', icon: 'rocket', cost: 20000, gain: () => 1.5 },
];

export const CAMPAIGN_MAP = Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c])) as Record<CampaignId, CampaignDef>;

/**
 * Reputation a campaign adds to (or takes from) a build with this hype and quality. `roll`
 * is the reviewer's reading, −1 to 1; 0 is the build exactly as good as it is.
 */
export function campaignGain(id: CampaignId, hype: number, quality: number, roll = 0): number {
  const def = CAMPAIGN_MAP[id];
  const seen = def.judged ? quality + CAMPAIGN.reviewNoise * roll : quality;
  return Math.round(hype * def.gain(seen));
}

/** The worst and best a campaign could do for this build — the card shows the spread. */
export function campaignRange(id: CampaignId, hype: number, quality: number): [number, number] {
  return [campaignGain(id, hype, quality, -1), campaignGain(id, hype, quality, 1)];
}

/** What a campaign's reputation brings back in sales, in total. Nothing for a loss. */
export function campaignSales(gain: number): number {
  return Math.max(0, Math.round(gain * CAMPAIGN.salesPerRep));
}
