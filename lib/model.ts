// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// THE MODEL (version peer-multiple-1)
// -----------------------------------
// A protocol that records no token is priced the way the market already prices its launched peers:
//
//   implied = tvl_usd x category_multiple x growth_mult x maturity_mult x capture_factor
//
// - category_multiple: the median market-cap / TVL ratio of the protocols in the same DefiLlama
//   category whose token already trades (mcap_usd recorded). A category with few trading peers is
//   not trusted on its own: its median is shrunk toward the market-wide median with weight
//   SHRINK_K = 4 phantom peers, and the result is clamped to [MULTIPLE_FLOOR, MULTIPLE_CAP] so no
//   single thin category (one peer at 400x) can price a board row. A category with no trading peer
//   at all uses the market-wide median. Every input is a figure in the snapshot; no protocol name
//   is ever special-cased.
// - growth_mult = 1 + clamp(change_7d, -60, +120) / 100 x 0.5: a protocol whose TVL grew 40% in a
//   week is priced 20% above its static multiple; one that shrank 40% is priced 20% below. An
//   unreported change counts as 0.
// - maturity_mult = 0.6 + min(age_days, 1095) / 1095 x 0.4: a protocol that has run three years
//   with no token has a proven record and earns the full factor; a newly tracked one starts at
//   0.6. An unknown listing date counts as 365 days.
// - capture_factor: 1 for a protocol in its own right. A row that the watchlist's own screens set
//   aside as a wrapped, staked or bridged product of another protocol, a versioned pool, or an
//   exchange house product gets 0.10: if such a product ever issued a token of its own, the token
//   would capture a fee slice on the underlying assets, not the assets themselves, so it is priced
//   on a tenth of the peer value. The screens are the snapshot README's own: category in
//   {Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX}, a name ending
//   in a version marker, a name carrying the whole word wrapped, staked or staking, or a name
//   beginning with an exchange's name.
//
// The board ranks EVERY protocol that records no token (342 in this snapshot), not only the 40 the
// house watchlist kept: the watchlist is the floor, and the radar's job is the other 302 as well.
// Protocols whose token already trades are never ranked: they are the peer set, shown apart with
// the market's own values, and they are what prices the board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  product_capture: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 4,
  multiple_floor: 0.02,
  multiple_cap: 3,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  product_capture: 0.1,
};

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'peer-multiple-1';

/** How a board row stands to the watchlist's screens. */
export type RowKind = 'watchlist' | 'candidate' | 'product';

/** One row of board.json: the ranked board's row, with the model's whole working shown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  kind: RowKind;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    version: string;
    category_multiple: number;
    peer_count: number;
    category_median: number | null;
    market_median: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    capture_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A category's peer evidence: how many of its protocols already trade, and what the market pays. */
export interface CategoryStat {
  category: string;
  peers: number;
  median: number | null;
  multiple: number;
}

/** One trading peer of a category, for a detail view's evidence list. */
export interface PeerRow {
  slug: string;
  name: string;
  symbol: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the peer evidence, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  market_median: number;
  counts: {
    protocols: number;
    pre_token: number;
    watchlist: number;
    products: number;
    trading_peers: number;
    token_unpriced: number;
  };
  categories: CategoryStat[];
  peers: Record<string, PeerRow[]>;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The whole words that mark a wrapped or staked product in a name. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
/** The exchange names a house product's name begins with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** The categories the watchlist's rule treats as products of another protocol, or an exchange's own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * Whether the watchlist's product screens set this protocol aside: a wrapped, staked or bridged
 * product of a protocol whose token already trades, a versioned pool, or an exchange house product.
 * The same screens the snapshot README states for the watchlist, applied to every pre-token row.
 */
export function isProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** The peer evidence of the whole snapshot: per-category medians, shrunk multiples, the market median. */
export interface PeerEvidence {
  marketMedian: number;
  categories: Map<string, CategoryStat>;
  peersByCategory: Map<string, PeerRow[]>;
  tradingPeers: number;
}

/** Build the peer evidence from the protocols whose token already trades with a recorded market cap. */
export function peerEvidence(snapshot: Snapshot, model: ModelConstants = MODEL): PeerEvidence {
  const ratiosByCategory = new Map<string, number[]>();
  const peersByCategory = new Map<string, PeerRow[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    const key = p.category ?? 'Uncategorised';
    allRatios.push(ratio);
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
    const peers = peersByCategory.get(key) ?? [];
    peers.push({ slug: p.slug, name: p.name, symbol: p.symbol, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: round4(ratio) });
    peersByCategory.set(key, peers);
  }
  const marketMedian = allRatios.length > 0 ? median(allRatios) : 0;
  const categories = new Map<string, CategoryStat>();
  const keys = new Set<string>([...ratiosByCategory.keys(), ...snapshot.protocols.map((p) => p.category ?? 'Uncategorised')]);
  for (const key of keys) {
    const ratios = ratiosByCategory.get(key) ?? [];
    const med = ratios.length > 0 ? median(ratios) : null;
    const shrunk = med === null ? marketMedian : (ratios.length * med + model.shrink_k * marketMedian) / (ratios.length + model.shrink_k);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    categories.set(key, { category: key, peers: ratios.length, median: med === null ? null : round4(med), multiple: round4(multiple) });
  }
  for (const peers of peersByCategory.values()) peers.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1));
  return { marketMedian: round4(marketMedian), categories, peersByCategory, tradingPeers: allRatios.length };
}

/** The multipliers and the implied value one protocol gets under `model` and the peer evidence. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  evidence: PeerEvidence,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; stat: CategoryStat; capture: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const stat = evidence.categories.get(protocol.category ?? 'Uncategorised')!;
  const capture = isProduct(protocol) ? model.product_capture : 1;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * stat.multiple * growthMult * maturityMult * capture));
  return { implied, growthPct, growthMult, maturityMult, age, stat, capture };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Every pre-token protocol ranked by implied value, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; evidence: PeerEvidence } {
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const evidence = peerEvidence(snapshot, model);
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p))
    .map((p) => {
      const v = impliedValue(p, snapshot.as_of, evidence, model);
      return { p, ...v };
    });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => {
    const onWatchlist = watchlist.has(s.p.slug);
    const kind: RowKind = onWatchlist ? 'watchlist' : s.capture < 1 ? 'product' : 'candidate';
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      on_watchlist: onWatchlist,
      kind,
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        version: MODEL_VERSION,
        category_multiple: s.stat.multiple,
        peer_count: s.stat.peers,
        category_median: s.stat.median,
        market_median: evidence.marketMedian,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        capture_factor: s.capture,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
  // Coverage is the gate's row and is never gambled: every watchlist slug must be a row.
  const rowSlugs = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!rowSlugs.has(slug) && index.has(slug)) throw new SnapshotError(`watchlist slug ${slug} is not pre-token and cannot be ranked`);
  }
  return { board, evidence };
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A rough gas figure for one transaction on a chain, from the chain's own fee market. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $10 of gas';
  if (chain === 'Solana') return 'under $1 of gas';
  if (chain === 'Bitcoin') return 'about $3 of gas';
  return 'about $2 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 20_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core position and its second signal, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { core: string; second: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and leave it supplied.`,
      second: `Borrow about a third of the supplied value against it, then repay within the week, so the wallet shows both sides of the market.`,
      weekly: `adjust the supply once, or repay and re-borrow a small amount`,
    };
  }
  if (c.includes('dex')) {
    return {
      core: `Provide $${capital} of liquidity to ${name}'s most-used pool on ${chain}, split evenly across the pair.`,
      second: `Route two or three ordinary swaps a week through ${name} itself rather than an aggregator, so the volume is the protocol's own.`,
      weekly: `make two swaps and re-centre the liquidity position once`,
    };
  }
  if (c.includes('derivative') || c.includes('option') || c.includes('perpetual')) {
    return {
      core: `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, long and short the same asset.`,
      second: `Close and reopen the hedge each week so the wallet records real trading days, not one lucky click.`,
      weekly: `roll the hedge once and keep the margin topped up`,
    };
  }
  if (c.includes('bridge')) {
    return {
      core: `Bridge $${capital} of USDC from ${chain} to a second chain through ${name}, then use the bridged funds in one app there.`,
      second: `Bridge a smaller amount back the other way a week later, so the wallet has transfers in both directions.`,
      weekly: `make one small bridge transfer`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      core: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`,
      second: `Claim the staking rewards once and restake them, so the wallet shows a full stake, claim and restake cycle.`,
      weekly: `claim and restake the rewards once`,
    };
  }
  if (c.includes('launchpad')) {
    return {
      core: `Complete ${name}'s own registration or staking step for sale access on ${chain} with about $${capital} held ready.`,
      second: `Take part in one live sale at the smallest tier rather than watching from outside.`,
      weekly: `check the sale calendar and keep the access stake in place`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy about $${capital} of cover from ${name} on ${chain} against a position you actually hold, and keep the policy to expiry.`,
      second: `Stake a smaller amount into the cover pool as well if the protocol offers it, so the wallet sits on both sides.`,
      weekly: `check the policy and the pool once`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund $${capital} on ${name} and take one position in its most liquid market.`,
      second: `Settle the position at expiry and take a second one, so the wallet shows a full trade cycle.`,
      weekly: `place or settle one market position`,
    };
  }
  if (c.includes('rwa')) {
    return {
      core: `Mint or subscribe $${capital} of ${name}'s yield asset on ${chain} after its own onboarding, and hold the asset.`,
      second: `Claim the first yield payment into the same wallet rather than letting it lapse.`,
      weekly: `check the holding and claim any yield once`,
    };
  }
  if (c.includes('chain')) {
    return {
      core: `Bridge $${capital} to ${name}'s chain and make it the wallet's home chain for a month: hold the balance there, not on an exchange.`,
      second: `Use two of the chain's own apps, a swap and a lending market, so the wallet is a resident, not a passer-by.`,
      weekly: `make two transactions in the chain's own apps`,
    };
  }
  return {
    core: `Deposit $${capital} of USDC into a ${name} vault or pool on ${chain} and keep the shares in the wallet.`,
    second: `Claim the first reward or yield payment the position earns, so the wallet shows a deposit and a claim.`,
    weekly: `add a small top-up or claim the rewards once`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const actions = actionsFor(p, capital, chain);
  const multi = p.chains.length > 1 ? ` It counts TVL on ${p.chains.length} chains; the position above on ${chain} is enough, a second chain is optional.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline on paper.`,
      cost: 'nothing to create, and never pay anyone to set one up',
      time: '5 minutes',
    },
    {
      text: `${actions.core}${multi}`,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: actions.second,
      cost: `${gas} each time`,
      time: '10 minutes',
    },
    {
      text: `Come back once a week and ${actions.weekly}, so the wallet reads as a user and not a drive-by.`,
      cost: 'about $2 of gas a week on most chains, more on Ethereum',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity stands in more than one weekly snapshot of the protocol.`,
      cost: `the $${capital} stays in the position and is at the protocol's risk`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, open the protocol's own points or rewards page from its official site and screenshot your balance; claim only from links that page publishes, and write the wallet, dates and transactions in a farm log.`,
      cost: 'no fee to check, and never pay a third party to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap: the peer set, with the market's own values. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : 0,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, evidence } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const categories = [...evidence.categories.values()].sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const peers: Record<string, PeerRow[]> = {};
  for (const [key, list] of evidence.peersByCategory) peers[key] = list.slice(0, 5);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    market_median: evidence.marketMedian,
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: board.length,
      watchlist: snapshot.watchlist.length,
      products: board.filter((r) => r.kind === 'product').length,
      trading_peers: evidence.tradingPeers,
      token_unpriced: snapshot.protocols.filter((p) => !isPreToken(p) && (p.mcap_usd === null || p.mcap_usd <= 0)).length,
    },
    categories,
    peers,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: size, slugs, coverage, ranks, order, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const slugs = new Set<string>();
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (slugs.has(r.slug)) return `${r.slug} appears twice`;
    slugs.add(r.slug);
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} trimmed characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
