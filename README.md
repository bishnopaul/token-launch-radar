# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bishnopaul/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bishnopaul/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Launch Radar**: every protocol in the sealed DefiLlama snapshot that records no token (342 of 758), ranked by what a token would be worth if the protocol's record stayed as it is. The model (`peer-multiple-1`) prices each row as TVL x the median market-cap/TVL multiple of its category's already-trading peers (shrunk toward the market median of 0.214x and clamped, so thin categories cannot explode) x a seven-day growth factor x a tokenless-age maturity factor x a capture factor (wrapped/staked/bridged products priced at a tenth). The dashboard shows the ranked board with search and filters, a detail view per protocol with the full step-by-step math and the peer evidence, the 128 trading peers kept visibly separate, and a model page stating the formula, every constant and all 53 category multiples. Each row carries a concrete plan for farming the protocol before it issues a token.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>   # writes board.json, data.js, dashboard/, screenshots/, dossier.json
# in the grader's container it reads /input/snapshot.json and writes /output with no arguments
```

{description}

## Run it

```sh
{run}
```

---

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
