import type { ScoreRow } from '@/game/types';
import type { IconName } from '@/ui/icons';
import { money } from './format';

export interface RivalDef {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  colour: string;
  startMembers: number;
  maxMembers: number;
  startCash: number;
  /** Fraction of a project finished per day. */
  shipPace: number;
  repPerProject: number;
  cashPerProject: number;
  cashPerDay: number;
  /** Reputation needed to attract each additional member. */
  repPerMember: number;
  /**
   * Reputation at which their shipping pace doubles. Without this they grow linearly while
   * the player compounds — more members, more projects — and by day 200 the leaderboard is
   * a formality.
   */
  paceGrowth: number;
}

/**
 * The competition: real hackerspaces, as a nod rather than a portrait. Their in-game
 * numbers are pure balance — each inherits one of five deliberately different shapes so the
 * leaderboard is not a single ladder — but the tone stays affectionate. These are actual
 * communities, so the blurbs describe what each is known for rather than scoring points off
 * them.
 */
export const RIVALS: RivalDef[] = [
  {
    id: 'c-base',
    name: 'c-base',
    blurb: 'Berlin. Half hackerspace, half crashed space station. Everybody has heard of it.',
    icon: 'antenna',
    colour: '#5ad2e0',
    startMembers: 7,
    maxMembers: 14,
    startCash: 12000,
    shipPace: 0.045,
    repPerProject: 560,
    cashPerProject: 5200,
    cashPerDay: 90,
    repPerMember: 340,
    paceGrowth: 6000,
  },
  {
    id: 'london-hackspace',
    name: 'London Hackspace',
    blurb: 'Hundreds of members, a room for every craft, and a rota for the washing up.',
    icon: 'users',
    colour: '#7fb2f0',
    startMembers: 10,
    // Fifteen, deliberately: a complete roster is you plus fourteen, so Biggest Crew is
    // winnable — but only if you have hired everybody.
    maxMembers: 15,
    startCash: 28000,
    shipPace: 0.11,
    repPerProject: 200,
    cashPerProject: 4000,
    cashPerDay: 320,
    repPerMember: 180,
    paceGrowth: 7000,
  },
  {
    id: 'konya',
    name: 'Konya Hackerspace',
    blurb: 'The other space in town. Practical, steady, and always at the same table.',
    icon: 'cpu',
    colour: '#f0b429',
    startMembers: 5,
    maxMembers: 14,
    startCash: 9000,
    shipPace: 0.1,
    repPerProject: 205,
    cashPerProject: 2100,
    cashPerDay: 130,
    repPerMember: 250,
    paceGrowth: 6500,
  },
  {
    id: 'tokyo',
    name: 'Tokyo HackerSpace',
    blurb: 'Community first. Turns up and builds things when the city needs them.',
    icon: 'wrench',
    colour: '#e2725b',
    startMembers: 7,
    maxMembers: 13,
    startCash: 4000,
    shipPace: 0.07,
    repPerProject: 255,
    cashPerProject: 900,
    cashPerDay: 90,
    repPerMember: 200,
    paceGrowth: 7500,
  },
  {
    id: 'garaj',
    name: 'Garaj',
    blurb: 'A garage, a printer and a lot of enthusiasm. Ships something most weeks.',
    icon: 'printer',
    colour: '#c58ef0',
    startMembers: 5,
    maxMembers: 11,
    startCash: 11000,
    shipPace: 0.2,
    repPerProject: 60,
    cashPerProject: 1400,
    cashPerDay: 150,
    repPerMember: 300,
    paceGrowth: 8000,
  },
];

export const RIVAL_MAP: Record<string, RivalDef> = Object.fromEntries(RIVALS.map((r) => [r.id, r]));

export interface AwardDef {
  label: string;
  blurb: string;
  value: (row: ScoreRow) => number;
  format: (value: number) => string;
  /** Reputation the winner takes home. */
  reputation: number;
}

/** Measured over the year just gone, except the two that are simply a snapshot. */
export const AWARDS: AwardDef[] = [
  {
    label: 'Most Projects',
    blurb: 'Shipped more than anybody else this year',
    value: (row) => row.projectsThisYear,
    format: (v) => `${v} shipped`,
    reputation: 260,
  },
  {
    label: 'Biggest Crew',
    blurb: 'The most people through the door',
    value: (row) => row.members,
    format: (v) => `${v} members`,
    reputation: 180,
  },
  {
    label: 'Deepest Pockets',
    blurb: 'Ended the year with the healthiest balance',
    value: (row) => row.cash,
    format: (v) => money(v),
    reputation: 140,
  },
  {
    label: 'Space of the Year',
    blurb: 'Made the biggest name for itself this year',
    value: (row) => row.reputationThisYear,
    format: (v) => `${v} reputation`,
    reputation: 420,
  },
];

/** Logos offered at the start. Icon plus colour — no uploads, no fuss. */
export const LOGOS: { icon: IconName; colour: string }[] = [
  { icon: 'cpu', colour: '#f0b429' },
  { icon: 'code', colour: '#5aa9f0' },
  { icon: 'cog', colour: '#e2725b' },
  { icon: 'antenna', colour: '#7ac74f' },
  { icon: 'bot', colour: '#c58ef0' },
  { icon: 'wrench', colour: '#cbd3de' },
  { icon: 'gamepad', colour: '#f08fa4' },
  { icon: 'flame', colour: '#e0a83c' },
];

export const NAME_SUGGESTIONS = [
  'Lehim ve Kahve',
  'Garaj 34',
  'Yarım Kalan Projeler Derneği',
  'Katman Sıfır',
  'Voltaj',
  'Talaş',
];

/** One in-game year. Long enough to matter, short enough to see a few ceremonies. */
export const YEAR_DAYS = 90;
