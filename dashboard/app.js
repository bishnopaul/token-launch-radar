// Launch Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts from the same
// board board.json carries) and renders four views by hash route: the ranked board (#/), one
// protocol's detail (#/p/<slug>), the already-trading peer set (#/live) and the model itself
// (#/model). No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;
  var state = { q: '', category: 'all', kind: 'all', band: 'all', sort: 'rank', dir: 1, shown: 120 };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n.toFixed(3) + 'x'; }

  // The model, recomputed in the page from a row's own snapshot figures, so a reader can check
  // that the number on the board is the number this arithmetic gives.
  function impliedOf(row) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var age = row.age_days === null ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.model.category_multiple * growthMult * maturity * row.model.capture_factor));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function bySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  function catStat(category) {
    var key = category === null ? 'Uncategorised' : category;
    for (var i = 0; i < DATA.categories.length; i++) if (DATA.categories[i].category === key) return DATA.categories[i];
    return { category: key, peers: 0, median: null, multiple: DATA.market_median };
  }

  /* ---------------------------------------------------------- shared frame */

  function header(active) {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var frag = document.createDocumentFragment();
    var head = el('div', { 'class': 'masthead' },
      el('div', { 'class': 'scope', 'aria-hidden': 'true' }),
      el('div', null,
        el('h1', null, 'Launch ', el('span', { 'class': 'thin' }, 'Radar')),
        el('p', { 'class': 'lede' },
          'Every protocol in the snapshot that ', el('b', null, 'records no token'), ', ranked by what a token would be worth ',
          'if its record stayed as it is: its TVL priced at the multiple the market already pays its launched peers, ',
          'adjusted for its seven-day growth and for how long it has run tokenless. Each row carries the steps to farm it.'),
        el('div', { 'class': 'dataline', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source })
      )
    );
    frag.appendChild(head);
    var stats = el('div', { 'class': 'stats' },
      stat(DATA.counts.protocols, 'protocols scanned'),
      stat(DATA.counts.pre_token, 'record no token'),
      stat(DATA.counts.watchlist + ' / ' + DATA.counts.watchlist, 'watchlist covered'),
      stat(fmtUsd(total), 'total implied value'),
      stat(DATA.counts.trading_peers, 'trading peers price it')
    );
    frag.appendChild(stats);
    var tabs = el('nav', { 'class': 'tabs' },
      tab('#/', 'The board', active === 'board'),
      tab('#/live', 'Already trading', active === 'live'),
      tab('#/model', 'The model', active === 'model')
    );
    frag.appendChild(tabs);
    return frag;
  }
  function stat(v, k) { return el('div', { 'class': 'stat' }, el('div', { 'class': 'v', text: String(v) }), el('div', { 'class': 'k', text: k })); }
  function tab(href, label, on) { return el('a', { href: href, 'class': on ? 'on' : '' }, label); }
  function footer() {
    return el('footer', null,
      'An implied value is this model\u2019s claim about a token that does not exist yet, not a prediction that one will be issued, ' +
      'and not a promise about any airdrop. A protocol is described as recording no token because that is what the snapshot\u2019s ' +
      'record says; a record can be incomplete. Farm plans carry the protocol\u2019s own risks: capital in a position can be lost.');
  }

  /* ---------------------------------------------------------- the board */

  var BANDS = [
    ['all', 'Any implied value'],
    ['b1', '$1B and above'],
    ['m100', '$100M to $1B'],
    ['m10', '$10M to $100M'],
    ['u10', 'Under $10M']
  ];
  function inBand(v, band) {
    if (band === 'b1') return v >= 1e9;
    if (band === 'm100') return v >= 1e8 && v < 1e9;
    if (band === 'm10') return v >= 1e7 && v < 1e8;
    if (band === 'u10') return v < 1e7;
    return true;
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.kind !== 'all' && r.kind !== state.kind) return false;
      if (!inBand(r.implied_value_usd, state.band)) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
  }
  var SORTS = {
    rank: function (r) { return r.rank; },
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    multiple: function (r) { return r.model.category_multiple; },
    implied: function (r) { return r.implied_value_usd; }
  };
  function sorted(rows) {
    var key = SORTS[state.sort] || SORTS.rank;
    return rows.slice().sort(function (a, b) {
      var va = key(a), vb = key(b);
      var d = typeof va === 'string' ? (va < vb ? -1 : va > vb ? 1 : 0) : va - vb;
      if (d === 0) d = a.rank - b.rank;
      return d * state.dir;
    });
  }

  function boardView(params) {
    if (params.category) state.category = params.category;
    if (params.kind) state.kind = params.kind;
    if (params.band) state.band = params.band;
    if (params.q) state.q = params.q;
    var frag = document.createDocumentFragment();
    frag.appendChild(header('board'));
    frag.appendChild(el('div', { 'class': 'modelstrip' },
      el('div', { 'class': 'formula', text: 'implied value  =  TVL  x  category peer multiple  x  growth  x  maturity  x  capture' }),
      el('p', null,
        'Priced by ', el('b', null, 'model ' + DATA.model_version), ': the multiple is the median market cap / TVL of the protocols in the same category ' +
        'whose token already trades (market-wide median ', el('b', null, fmtMult(DATA.market_median)), '), shrunk toward that median when a category has few peers. ' +
        'Rows marked ', el('b', null, 'product'), ' are wrapped, staked or bridged products of another protocol and are priced at a tenth capture. ',
        el('a', { href: '#/model' }, 'Read the model in full.'))
    ));

    var cats = ['all'].concat(DATA.categories.map(function (c) { return c.category; }));
    var controls = el('div', { 'class': 'controls' },
      ctl('Search', el('input', { type: 'search', placeholder: 'Name or slug', value: state.q, oninput: function (e) { state.q = e.target.value; state.shown = 120; draw(); } })),
      ctl('Category', select(cats.map(function (c) { return [c, c === 'all' ? 'All categories' : c]; }), state.category, function (v) { state.category = v; state.shown = 120; draw(); })),
      ctl('Row kind', select([['all', 'All rows'], ['watchlist', 'House watchlist'], ['candidate', 'Radar candidates'], ['product', 'Products (x0.10)']], state.kind, function (v) { state.kind = v; state.shown = 120; draw(); })),
      ctl('Implied value', select(BANDS, state.band, function (v) { state.band = v; state.shown = 120; draw(); })),
      el('div', { 'class': 'count', id: 'rowcount' })
    );
    frag.appendChild(controls);
    var holder = el('div', { id: 'tableholder' });
    frag.appendChild(holder);
    frag.appendChild(footer());

    function ctl(label, input) { return el('div', { 'class': 'ctl' }, el('label', { text: label }), input); }
    function select(options, value, onpick) {
      var s = el('select', { onchange: function (e) { onpick(e.target.value); } },
        options.map(function (o) {
          var opt = el('option', { value: o[0], text: o[1] });
          if (o[0] === value) opt.setAttribute('selected', 'selected');
          return opt;
        }));
      return s;
    }

    function draw() {
      var rows = sorted(filtered());
      holder.textContent = '';
      var table = el('table', null,
        el('thead', null, el('tr', null,
          th('rank', '#', ''), th('name', 'Protocol', 'name'), th(null, 'Category', 'hideS'), th(null, 'Chains', 'hideS'),
          th('tvl', 'TVL', ''), th('change', '7d %', ''), th('age', 'Age', 'hideS'), th('multiple', 'Multiple', 'hideS'), th('implied', 'Implied value', '')
        )),
        el('tbody', null, rows.slice(0, state.shown).map(rowEl))
      );
      if (rows.length === 0) holder.appendChild(el('div', { 'class': 'empty', text: 'No protocol matches those filters. Loosen one and the radar sweeps again.' }));
      else holder.appendChild(table);
      if (rows.length > state.shown) {
        holder.appendChild(el('button', { 'class': 'more', text: 'Show all ' + rows.length + ' rows', onclick: function () { state.shown = rows.length; draw(); } }));
      }
      var c = document.getElementById('rowcount');
      if (c) { c.textContent = ''; c.appendChild(el('b', { text: String(rows.length) })); c.appendChild(document.createTextNode(' of ' + DATA.rows.length + ' protocols')); }
    }
    function th(key, label, cls) {
      var attrs = { 'class': cls };
      if (key) attrs.onclick = function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; if (key === 'rank') state.dir = 1; }
        draw();
      };
      var t = el('th', attrs, label);
      if (key && state.sort === key) t.appendChild(el('span', { 'class': 'dir', text: state.dir === 1 ? ' \u25B2' : ' \u25BC' }));
      return t;
    }
    function rowEl(r) {
      var badges = [];
      if (r.kind === 'watchlist') badges.push(el('span', { 'class': 'badge wl', text: 'Watchlist' }));
      if (r.kind === 'product') badges.push(el('span', { 'class': 'badge prod', text: 'Product' }));
      var chg = r.change_7d;
      return el('tr', { onclick: function () { location.hash = '#/p/' + r.slug; } },
        el('td', { 'class': 'num', text: String(r.rank) }),
        el('td', { 'class': 'name' }, r.name, badges, el('div', { 'class': 'sub', text: r.slug })),
        el('td', { 'class': 'hideS', text: r.category || 'Uncategorised' }),
        el('td', { 'class': 'chains hideS', text: r.chains.length ? r.chains[0] + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') : 'n/a' }),
        el('td', { 'class': 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { 'class': 'num ' + (chg === null ? 'flat' : chg > 0 ? 'pos' : chg < 0 ? 'neg' : 'flat'), text: fmtPct(chg) }),
        el('td', { 'class': 'num hideS', text: fmtAge(r.age_days) }),
        el('td', { 'class': 'num hideS', text: fmtMult(r.model.category_multiple) }),
        el('td', { 'class': 'num', text: fmtUsd(r.implied_value_usd) })
      );
    }
    // Controls live in the fragment until it is mounted; draw after mount (see render()).
    frag.draw = draw;
    return frag;
  }

  /* ---------------------------------------------------------- detail */

  function detailView(slug) {
    var r = bySlug(slug);
    var frag = document.createDocumentFragment();
    frag.appendChild(header('board'));
    if (!r) {
      frag.appendChild(el('p', { 'class': 'empty', text: 'No protocol with that slug is on the board.' }));
      frag.appendChild(footer());
      return frag;
    }
    var st = catStat(r.category);
    var check = impliedOf(r);
    var prev = byRank(r.rank - 1), next = byRank(r.rank + 1);
    var body = el('section', { 'class': 'detail' },
      el('a', { 'class': 'back', href: '#/' }, '\u2190 Back to the board'),
      el('h2', null, r.name,
        r.kind === 'watchlist' ? el('span', { 'class': 'badge wl', text: 'House watchlist' }) : null,
        r.kind === 'product' ? el('span', { 'class': 'badge prod', text: 'Product of another protocol' }) : null),
      el('div', { 'class': 'meta', text: 'Rank #' + r.rank + ' of ' + DATA.rows.length + ' · ' + (r.category || 'Uncategorised') + ' · slug ' + r.slug }),
      el('div', { style: 'margin-top:10px' }, r.chains.map(function (c) { return el('span', { 'class': 'chip', text: c }); })),
      el('div', { 'class': 'grid' },
        card('TVL (snapshot)', fmtUsd(r.tvl_usd), 'total value locked, whole dollars'),
        card('Implied token value', fmtUsd(r.implied_value_usd), 'model ' + DATA.model_version + ', recomputed below'),
        card('TVL change, 7 days', fmtPct(r.change_7d), r.change_7d === null ? 'unreported in the snapshot, counted as 0' : 'as the snapshot reports it'),
        card('Running tokenless', fmtAge(r.age_days), r.listed_at ? 'tracked since ' + r.listed_at : 'listing date unreported, counted as 365 days'),
        card('Token status', 'Records no token', 'no CoinGecko id, no symbol, no market cap in the snapshot')
      ),
      el('div', { 'class': 'math' },
        el('h3', { text: 'The math, in the open' }),
        mrow('TVL from the snapshot', fmtUsd(r.tvl_usd), 'the protocol\u2019s own figure'),
        mrow('Category peer multiple', fmtMult(r.model.category_multiple),
          st.peers + ' trading peer' + (st.peers === 1 ? '' : 's') + ' in ' + (r.category || 'Uncategorised') +
          (st.median === null ? '; none trades, so the market median applies' : '; category median ' + fmtMult(st.median) + ', shrunk toward the market median ' + fmtMult(DATA.market_median))),
        mrow('Growth multiplier', 'x' + r.model.growth_multiplier.toFixed(3), 'from ' + fmtPct(r.model.growth_pct) + ' over 7 days, clamped to [' + M.growth_floor + '%, +' + M.growth_cap + '%] at half weight'),
        mrow('Maturity multiplier', 'x' + r.model.maturity_multiplier.toFixed(3), 'from ' + fmtAge(r.age_days) + ' tokenless; full weight at 3 years'),
        mrow('Capture factor', 'x' + r.model.capture_factor.toFixed(2), r.kind === 'product' ? 'a wrapped, staked, bridged or house product: its own token would capture a fee slice, not the underlying assets' : 'a protocol in its own right: full capture'),
        mrow('Implied value', fmtUsd(r.implied_value_usd), 'the same figure board.json carries; this page recomputes it as ' + fmtUsd(check), true)
      ),
      peersBlock(r, st),
      el('div', { 'class': 'plan' },
        el('h3', { text: 'How to farm it' }),
        el('ol', null, r.farm_steps.map(function (s) { return el('li', { text: s }); }))
      ),
      el('div', { 'class': 'prevnext' },
        prev ? el('a', { href: '#/p/' + prev.slug }, '\u2190 #' + prev.rank + ' ' + prev.name) : el('span'),
        next ? el('a', { href: '#/p/' + next.slug }, '#' + next.rank + ' ' + next.name + ' \u2192') : el('span')
      )
    );
    frag.appendChild(body);
    frag.appendChild(footer());
    return frag;
  }
  function byRank(rank) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].rank === rank) return DATA.rows[i];
    return null;
  }
  function card(k, v, s) { return el('div', { 'class': 'card' }, el('div', { 'class': 'k', text: k }), el('div', { 'class': 'v', text: v }), el('div', { 'class': 's', text: s })); }
  function mrow(what, val, why, total) {
    return el('div', { 'class': 'mrow' + (total ? ' total' : '') },
      el('span', { 'class': 'what' }, el('b', { text: what }), ' \u2014 ' + why),
      el('span', { 'class': 'val', text: val }));
  }
  function peersBlock(r, st) {
    var peers = (DATA.peers[st.category] || []);
    if (peers.length === 0) {
      return el('div', { 'class': 'peers' }, el('h3', { text: 'The peers that price it' }),
        el('p', { 'class': 'sub', text: 'No protocol in this category has a token trading with a recorded market cap, so the market-wide median multiple of ' + fmtMult(DATA.market_median) + ' prices this row.' }));
    }
    return el('div', { 'class': 'peers' },
      el('h3', { text: 'The peers that price it' }),
      el('table', null,
        el('thead', null, el('tr', null,
          el('th', { 'class': 'name', text: 'Trading peer' }), el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'Cap / TVL' }))),
        el('tbody', null, peers.map(function (p) {
          return el('tr', null,
            el('td', { 'class': 'name' }, p.name, el('div', { 'class': 'sub', text: p.symbol || p.slug })),
            el('td', { 'class': 'num', text: fmtUsd(p.tvl_usd) }),
            el('td', { 'class': 'num', text: fmtUsd(p.mcap_usd) }),
            el('td', { 'class': 'num', text: fmtMult(p.ratio) }));
        })))
    );
  }

  /* ---------------------------------------------------------- already trading */

  function liveView() {
    var frag = document.createDocumentFragment();
    frag.appendChild(header('live'));
    frag.appendChild(el('div', { 'class': 'prose' },
      el('h2', { text: 'Already trading: the peer set' }),
      el('p', null, 'These protocols\u2019 tokens already trade, so the radar never ranks them: it shows the market\u2019s own values. ' +
        'They are also the evidence the board is priced from: each category\u2019s multiple is the median of these ratios in that category. ' +
        DATA.counts.token_unpriced + ' further protocols record a token with no market cap in the snapshot; they are neither ranked nor used as peers.')
    ));
    frag.appendChild(el('table', null,
      el('thead', null, el('tr', null,
        el('th', { 'class': 'name', text: 'Protocol' }), el('th', { 'class': 'hideS', text: 'Category' }),
        el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'Cap / TVL' }), el('th', { 'class': 'hideS', text: '7d %' }))),
      el('tbody', null, DATA.live.map(function (p) {
        return el('tr', null,
          el('td', { 'class': 'name' }, p.name, el('div', { 'class': 'sub', text: (p.symbol || p.slug) })),
          el('td', { 'class': 'hideS', text: p.category || 'Uncategorised' }),
          el('td', { 'class': 'num', text: fmtUsd(p.tvl_usd) }),
          el('td', { 'class': 'num', text: fmtUsd(p.mcap_usd) }),
          el('td', { 'class': 'num', text: fmtMult(p.ratio) }),
          el('td', { 'class': 'num hideS ' + (p.change_7d === null ? 'flat' : p.change_7d > 0 ? 'pos' : p.change_7d < 0 ? 'neg' : 'flat'), text: fmtPct(p.change_7d) }));
      }))));
    frag.appendChild(footer());
    return frag;
  }

  /* ---------------------------------------------------------- the model */

  function modelView() {
    var frag = document.createDocumentFragment();
    frag.appendChild(header('model'));
    var prose = el('div', { 'class': 'prose' },
      el('h2', { text: 'The model: ' + DATA.model_version }),
      el('p', null, 'One question, answered one way for every protocol: ', el('b', null, 'if this protocol issued a token today and the market priced it the way it prices its launched peers, what would the token be worth?'),
        ' Every input is a figure in the snapshot itself; no protocol\u2019s name is ever special-cased, and the page recomputes each row\u2019s value from its inputs in front of you.'),
      el('div', { 'class': 'modelstrip' }, el('div', { 'class': 'formula', text: 'implied = TVL x category multiple x growth x maturity x capture' })),
      el('h3', { text: 'Category multiple' }),
      el('p', null, 'For each DefiLlama category, take the protocols whose token already trades with a recorded market cap and form market cap / TVL for each. ' +
        'The category\u2019s multiple is their median, shrunk toward the market-wide median (' + fmtMult(DATA.market_median) + ' across ' + DATA.counts.trading_peers + ' peers) with ' +
        M.shrink_k + ' phantom peers of weight, then clamped to [' + M.multiple_floor + 'x, ' + M.multiple_cap + 'x]. Shrinkage is the honest answer to thin categories: ' +
        'a category with one peer at 400x does not get to price a board row at 400x. A category with no trading peer uses the market median.'),
      el('h3', { text: 'Growth' }),
      el('p', null, 'The seven-day TVL change, clamped to [' + M.growth_floor + '%, +' + M.growth_cap + '%], at half weight: growth of +40% multiplies value by 1.20, ' +
        'a fall of 40% by 0.80. An unreported change counts as 0. Momentum is evidence about where TVL is heading, not proof, so it moves the price by half its face value.'),
      el('h3', { text: 'Maturity' }),
      el('p', null, 'A protocol that has run for years with real TVL and no token has survived something; a newly tracked one has not yet. The factor runs from ' +
        M.maturity_floor + ' for a brand-new listing to 1.00 at ' + (M.maturity_days / 365) + ' years tokenless, linearly. An unreported listing date counts as one year.'),
      el('h3', { text: 'Capture' }),
      el('p', null, 'A wrapped token, a staking receipt, a bridged asset or an exchange\u2019s house product is a claim on another protocol\u2019s assets: if it ever issued a token of its own, ' +
        'that token would capture a fee slice, not the assets. Such rows, found by the same screens the house watchlist publishes (category, version markers, the words wrapped, staked and staking, exchange name prefixes), ' +
        'are priced at a capture of ' + M.product_capture + '. Everything else is priced at full capture.'),
      el('div', { 'class': 'note' }, el('b', null, 'What this is not. '),
        'It is not a prediction that any protocol will issue a token, or when, or that any airdrop will follow any farm plan. ' +
        'It says what a token would be worth if the protocol\u2019s record stayed as it is and the market priced it like its peers. Records change.'),
      el('h3', { text: 'Every category\u2019s multiple' })
    );
    prose.appendChild(el('table', null,
      el('thead', null, el('tr', null,
        el('th', { 'class': 'name', text: 'Category' }), el('th', { text: 'Trading peers' }), el('th', { text: 'Median cap / TVL' }), el('th', { text: 'Multiple used' }))),
      el('tbody', null, DATA.categories.map(function (c) {
        return el('tr', null,
          el('td', { 'class': 'name', text: c.category }),
          el('td', { 'class': 'num', text: String(c.peers) }),
          el('td', { 'class': 'num', text: c.median === null ? 'none trade' : fmtMult(c.median) }),
          el('td', { 'class': 'num', text: fmtMult(c.multiple) }));
      }))));
    frag.appendChild(prose);
    frag.appendChild(footer());
    return frag;
  }

  /* ---------------------------------------------------------- routing */

  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    var qAt = h.indexOf('?');
    var path = qAt === -1 ? h : h.slice(0, qAt);
    var params = {};
    if (qAt !== -1) {
      h.slice(qAt + 1).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      });
    }
    return { path: path, params: params };
  }

  function render() {
    var route = parseHash();
    app.textContent = '';
    var frag;
    if (route.path.indexOf('/p/') === 0) frag = detailView(route.path.slice(3));
    else if (route.path === '/live') frag = liveView();
    else if (route.path === '/model') frag = modelView();
    else frag = boardView(route.params);
    app.appendChild(frag);
    app.setAttribute('aria-busy', 'false');
    if (frag.draw) frag.draw();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  render();
})();
