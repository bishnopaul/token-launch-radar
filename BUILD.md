# BUILD — Launch Radar (token-radar-01)

## What this is

A token launch radar over the kit's sealed DefiLlama snapshot. `main.ts` prices every protocol
that records no token (342 of 758) with the peer-multiple model in `lib/model.ts`, writes the
ranked board to `/output/board.json`, writes the dashboard's data to `/output/data.js`, copies
`dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json` with the vendored
`vendor/makefun-board.ts` (copied byte-for-byte from the kit starter; sha256
`9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`).

## The model (peer-multiple-1)

```
implied = TVL x category_multiple x growth_mult x maturity_mult x capture_factor
```

- **category_multiple** — median market-cap/TVL of the same category's protocols whose token
  already trades (128 peers; market-wide median 0.214x), shrunk toward the market median with
  K=4 phantom peers and clamped to [0.02x, 3.00x]. No trading peer in a category → market median.
- **growth_mult** — `1 + clamp(change_7d, -60, +120)/100 x 0.5`; unreported change counts as 0.
- **maturity_mult** — `0.6 + min(age_days, 1095)/1095 x 0.4`; unknown listing date counts as 365d.
- **capture_factor** — 1.0 normally; 0.10 for rows the watchlist's own product screens set aside
  (Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / CEX categories,
  version-marker names, the whole words wrapped/staked/staking, exchange-name prefixes).

Every board row carries the full breakdown (`model` object), so the dashboard's detail view shows
the inputs and the arithmetic, and the page recomputes each value from its inputs. All 40 watchlist
slugs are covered; 302 further pre-token protocols are ranked below/above them on the same math.
Farm plans (6 steps each) are generated per protocol from its category, chains, TVL tier and age,
each step carrying a cost and a time.

## Run it

From the repository root, against the kit's dev snapshot:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

In the grader's container the same program reads `/input/snapshot.json` and writes `/output`
with no arguments. Note: `main.ts` refuses to finish (exit 1, after writing board.json, data.js
and dashboard/) while `screenshots/` holds fewer than 3 images — that is the starter's hand-in
contract, kept on purpose.

## Serve the dashboard locally with the dev data

The page loads `../data.js` relative to `dashboard/`, so serve the whole output directory:

```sh
# after a run into out/ (see above; the screenshot refusal at the end is expected at this stage)
cd out && python3 -m http.server 8791
# board:     http://127.0.0.1:8791/dashboard/#/
# detail:    http://127.0.0.1:8791/dashboard/#/p/steakhouse-financial
# filtered:  http://127.0.0.1:8791/dashboard/#/?category=Dexs&kind=candidate
# peers:     http://127.0.0.1:8791/dashboard/#/live
# model:     http://127.0.0.1:8791/dashboard/#/model
```

Hash routes render identically from the dev snapshot and the sealed one (same code path, same
data shape). Filters also accept `#/?category=<name>&kind=<watchlist|candidate|product>&band=<b1|m100|m10|u10>&q=<text>`.

## Screenshots (parent step)

`screenshots/` is intentionally EMPTY in this repository. To finish the hand-in:

1. Run `main.ts` once into `out/` (it writes board.json, data.js, dashboard/ before the
   screenshot check), serve `out/` as above.
2. Take exactly **3** screenshots at 1280x900 (long side ≤1440, short side ≥800), each
   **300–350 KB** (JPEG quality ~80 lands there; the dossier must stay under the gate's
   1.5 MiB, and a 4th image at that size would push it over):
   - `1-board.png` (or .jpg) — `#/` (the cover: name sorts first)
   - `2-detail.png` — `#/p/steakhouse-financial` (rank #1; any detail view works)
   - `3-filtered.png` — `#/?category=Dexs&kind=candidate`
3. Put them in `screenshots/`, re-run `main.ts` — it now completes and writes `dossier.json`.

## Verification (done at build time)

- Two consecutive runs against the dev snapshot produce byte-identical output trees
  (`diff -r` clean), including dossier.json.
- Independent gate-style check of board.json: 342 rows, ranks exactly 1..342, implied values
  non-increasing by rank, all 40 watchlist slugs present, every farm step 20–600 trimmed
  characters, 3–12 steps per row.
- Dashboard source totals 34 KB (index.html 0.6 KB, app.css 7.9 KB, app.js 25.5 KB) — the whole
  source fits inside the dossier's 65,536-byte text cap.
- Headless Chromium smoke test of all five routes (board, detail, filtered, live, model):
  all render, zero JavaScript errors.
- board.json is 645 KB (cap 8 MiB); dossier.json with the starter's placeholder screenshots
  was 710 KB (cap 1.5 MiB at the gate).
