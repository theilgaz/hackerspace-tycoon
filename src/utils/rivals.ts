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
   * Reputation at which their shipping pace would double. Set effectively out of reach on
   * purpose: the rivals grow **linearly** and the player compounds, because that is the only
   * shape that satisfies both ends at once — a field strong enough to take most of the first
   * awards night, and a back half where a full roster pulls clear. Making them compound too
   * meant either the first night was a walkover or the final table was.
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
    shipPace: 0.054,
    repPerProject: 449,
    cashPerProject: 4200,
    cashPerDay: 90,
    repPerMember: 340,
    paceGrowth: 100000,
  },
  {
    id: 'london-hackspace',
    name: 'London Hackspace',
    blurb: 'Hundreds of members, a room for every craft, and a rota for the washing up.',
    icon: 'users',
    colour: '#7fb2f0',
    startMembers: 10,
    maxMembers: 14,
    startCash: 10000,
    shipPace: 0.131,
    repPerProject: 187,
    cashPerProject: 1500,
    cashPerDay: 170,
    repPerMember: 180,
    paceGrowth: 100000,
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
    shipPace: 0.119,
    repPerProject: 191,
    cashPerProject: 1700,
    cashPerDay: 130,
    repPerMember: 250,
    paceGrowth: 100000,
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
    shipPace: 0.084,
    repPerProject: 233,
    cashPerProject: 900,
    cashPerDay: 90,
    repPerMember: 200,
    paceGrowth: 100000,
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
    shipPace: 0.275,
    repPerProject: 54,
    cashPerProject: 800,
    cashPerDay: 150,
    repPerMember: 300,
    paceGrowth: 100000,
  },
  {
    id: 'noisebridge',
    name: 'Noisebridge',
    blurb: 'San Francisco. Radically open, endlessly improvised, and permanently short of money.',
    icon: 'bot',
    colour: '#a6aebd',
    startMembers: 9,
    maxMembers: 14,
    startCash: 900,
    shipPace: 0.095,
    repPerProject: 266,
    cashPerProject: 500,
    cashPerDay: 25,
    repPerMember: 190,
    paceGrowth: 100000,
  },
  {
    id: 'nyc-resistor',
    name: 'NYC Resistor',
    blurb: 'Brooklyn. Small, influential, and very good at the bit where electronics meets craft.',
    icon: 'lightbulb',
    colour: '#f2d06b',
    startMembers: 6,
    maxMembers: 10,
    startCash: 14000,
    shipPace: 0.071,
    repPerProject: 333,
    cashPerProject: 2200,
    cashPerDay: 180,
    repPerMember: 300,
    paceGrowth: 100000,
  },
  {
    id: 'metalab',
    name: 'Metalab',
    blurb: 'Vienna. One of the originals, and half of Europe learned how to do this from them.',
    icon: 'cog',
    colour: '#8fd88f',
    startMembers: 7,
    maxMembers: 13,
    startCash: 8000,
    shipPace: 0.084,
    repPerProject: 299,
    cashPerProject: 2400,
    cashPerDay: 110,
    repPerMember: 260,
    paceGrowth: 100000,
  },
  {
    id: 'dallas',
    name: 'Dallas Makerspace',
    blurb: 'Enormous. A committee for every room and a room for everything.',
    // Starts big on purpose: it is the one that makes Biggest Crew a contest rather than a
    // formality, and the player's ceiling is a complete roster of fifteen plus themselves.
    icon: 'building',
    colour: '#d99a5c',
    startMembers: 11,
    // Fifteen is the ceiling anything gets: a complete roster is you plus fourteen, so
    // Biggest Crew stays winnable — but only by hiring everybody.
    maxMembers: 15,
    startCash: 9000,
    shipPace: 0.203,
    repPerProject: 116,
    cashPerProject: 1100,
    cashPerDay: 150,
    repPerMember: 170,
    paceGrowth: 100000,
  },
  {
    id: 'xinchejian',
    name: 'Xinchejian',
    blurb: 'Shanghai. Hardware people, an hour from anything you could possibly need.',
    icon: 'wifi',
    colour: '#e06a8a',
    startMembers: 6,
    maxMembers: 12,
    startCash: 9000,
    shipPace: 0.239,
    repPerProject: 103,
    cashPerProject: 950,
    cashPerDay: 120,
    repPerMember: 280,
    paceGrowth: 100000,
  },
  {
    id: 'hacdc',
    name: 'HacDC',
    blurb: 'Washington. Amateur radio, a satellite ground station, and a class every week.',
    icon: 'dish',
    colour: '#b4d45a',
    startMembers: 6,
    maxMembers: 11,
    startCash: 7000,
    shipPace: 0.089,
    repPerProject: 212,
    cashPerProject: 1600,
    cashPerDay: 140,
    repPerMember: 270,
    paceGrowth: 100000,
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
