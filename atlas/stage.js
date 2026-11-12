/* Bình Thạnh atlas — chapter 3 (v2.5-S4): the full-bleed map stage and its `alleys` hero.

   The approved layout (S4 mock 3, map-page layout standard): the district outline's tight box is fitted to the stage,
   full bleed, and the words live in the box's empty pockets. Desktop (>= 900 px): the pockets are found per width from
   the projected outline, as pockets.py does it (the land rasterised on a 4 px grid, dilated 12 px; the largest empty
   rectangles >= 140 x 56 taken greedily, numbered by area). Claim, bars and key take the pocket of their size rank, or
   the next free one by size order; the place notes take the free pocket nearest their named routes, compact if need
   be (placeDesk). Never the land, never a side column. A thin footer strip holds How we know, the source line and,
   when no pocket holds the key, the key as one compact line. Phone (< 900 px): a pinned map (59% of the viewport), the big number in the map's largest pocket,
   six native scroll steps (a passive scroll listener picks the step; nothing is prevented), three of which move the
   camera to a named route.

   Marks: worship routes only, phượng; the three named routes (hero data `named`) on top in chàm, thicker, each with a
   chàm numeral past its door along the route's last direction, never on the line. No leader lines, no dots.

   v2.5-S5: pages 2-4 run on the same stage. What page 1 hard-coded is now each page's hero data: `stage.order` and
   `stage.blocks` (the pocket blocks in placement order), `stage.steps` (the phone steps; `cam` names a camera target),
   `stage.targets` (the marks a camera frames + its padding as a share of the land's width), and per named place its
   `items`, `target`, numeral `anchor` (a line ending where the numeral goes past) and `near` point (the pocket it is
   placed nearest). Page 1 draws its worship routes as before; pages 2-4 draw item layers (`layers[].items`): each
   street or alley painted part to whole (`on` in the layer's hue, `off` in the rest hue), one hit stroke each.
   Tracked elements (data-el): camera (the camera group), routes (the routes layer), numerals (the numeral group), note
   (the hover/tap note); a step or a hover changes at most those four (the scale bar re-labels with the camera).
   Motion: camera 900 ms, text fades 200-300 ms, numerals after the camera, all settled < 1.3 s; under
   prefers-reduced-motion every change lands at once (no transition, no timer). */
(function () {
  "use strict";
  const A = (window.Atlas = window.Atlas || {});
  A.heroes = A.heroes || {};

  const DESK = 900;
  const MAIN_ROADS = new Set(["trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link"]);
  // desktop pocket method (pockets.py): grid cell, clearance off the land, minimum pocket, gap between pockets
  const CELL = 4, CLEAR = 12, MIN_W = 140, MIN_H = 56, PGAP = 16, FIT_PAD = 5;
  // phone: the finer grid of the mock (mock_phone.py)
  const CELL_P = 2, CLEAR_P = 6, SIDE_P = 12;
  const TEXT_GAP = 8, EDGE = 10;           // a hover note or the reading keeps this far off a placed block
  const CAM_MS = 900, FADE_MS = 300;
  // The pocket blocks, the phone steps and the camera targets come from the page's hero data (`stage`, v2.5-S5). Each
  // block: what it wants (claim, bars, key: a pocket by size rank; a place note: the free pocket nearest its named
  // places, R17), how wide it may grow, which edge it sits on, and its forms. Page 1's (R18): claim, bars, pair (1, 2),
  // longest (3), key; six phone steps.
  // a block's own type, then one step down the type scale (tight); the pair may also set its two places side by side
  const VARIANTS = ["", "tight"];
  // every form class a variant may set (S5 adds `dense`: tighter leading for a block of several short lines; Task 10
  // adds `inline`: page 4's door numbers as one run in the smallest type, and `nogrid`: the door block without them)
  // (R31 `nonames`: page 3's compact ward block without its one-line 4 · 5 names)
  const FORMS = ["tight", "wide", "compact", "dense", "inline", "nogrid", "nonames"];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ms = (t) => (reduce.matches ? 0 : t);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- the occupancy grid ---------------- */
  /** A grid of `cell` px over [x0, y0, x1, y1] (stage px; cells start at x0, y0, as pockets.py's start at the land's
      box): 1 where the land, dilated by `clear` px, covers the cell's centre (pockets.py tests each cell centre against
      the outline buffered by 12 px). The land is rasterised at 1 px. */
  function landGrid(area, cell, clear, landPath) {
    const [ox, oy] = area, w = Math.ceil(area[2] - ox), h = Math.ceil(area[3] - oy);
    const cw = Math.floor(w / cell), ch = Math.floor(h / cell);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g2 = c.getContext("2d", { willReadFrequently: true });
    g2.translate(-ox, -oy);
    g2.fillStyle = "#000"; g2.fill(landPath);
    g2.lineWidth = 2 * clear; g2.lineJoin = "round"; g2.strokeStyle = "#000"; g2.stroke(landPath);
    const px = g2.getImageData(0, 0, w, h).data;
    const occ = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const py = Math.floor(y * cell + cell / 2);
      for (let x = 0; x < cw; x++) occ[y * cw + x] = px[(py * w + Math.floor(x * cell + cell / 2)) * 4 + 3] > 127 ? 1 : 0;
    }
    return { cell, ox, oy, cw, ch, occ };
  }
  function emptyGrid(area, cell) {
    const cw = Math.floor((area[2] - area[0]) / cell), ch = Math.floor((area[3] - area[1]) / cell);
    return { cell, ox: area[0], oy: area[1], cw, ch, occ: new Uint8Array(cw * ch) };
  }
  const copyGrid = (g) => Object.assign({}, g, { occ: g.occ.slice() });
  /** Mark the box [x0, y0, x1, y1] (stage px), grown by pad, as taken. */
  function block(g, b, pad) {
    const c = g.cell;
    const x0 = Math.max(0, Math.floor((b[0] - pad - g.ox) / c)), y0 = Math.max(0, Math.floor((b[1] - pad - g.oy) / c));
    const x1 = Math.min(g.cw, Math.ceil((b[2] + pad - g.ox) / c)), y1 = Math.min(g.ch, Math.ceil((b[3] + pad - g.oy) / c));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.occ[y * g.cw + x] = 1;
  }
  /** The largest empty axis-aligned rectangle (cells) at least mw x mh cells, by the histogram method (pockets.py
      maxrect). Every empty rectangle lies inside one the method lists, so the largest listed one that meets the minimum
      is the largest that does. */
  function maxRect(free, W, H, mw, mh) {
    const h = new Int32Array(W);
    let best = null, bestA = 0;
    const st = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) h[c] = free[r * W + c] ? h[c] + 1 : 0;
      st.length = 0;
      for (let c = 0; c <= W; c++) {
        const cur = c < W ? h[c] : 0;
        let start = c;
        while (st.length && st[st.length - 1][1] >= cur) {
          const [s0, hh] = st.pop();
          const a = hh * (c - s0);
          if (a > bestA && c - s0 >= mw && hh >= mh) { bestA = a; best = [s0, r - hh + 1, c - s0, hh]; }
          start = s0;
        }
        st.push([start, cur]);
      }
    }
    return best;
  }
  /** The pockets of the grid: the largest empty rectangles of at least minW x minH taken greedily, `gap` px apart,
      sorted by area (largest first); stage px, rounded. (pockets.py takes the largest rectangle of any shape and drops
      it when it is under the minimum; here the minimum is part of the search, so a tall rectangle 12 px too narrow does
      not hide the wide one inside it, as it did with the Thanh Đa notch at 1440.) */
  function pockets(g, minW, minH, gap, maxN) {
    const c = g.cell, W = g.cw, H = g.ch;
    const free = new Uint8Array(W * H);
    for (let i = 0; i < free.length; i++) free[i] = g.occ[i] ? 0 : 1;
    const out = [];
    const gc = Math.ceil(gap / c);
    const mw = Math.max(1, Math.ceil(minW / c)), mh = Math.max(1, Math.ceil(minH / c));
    for (let it = 0; it < 40 && out.length < maxN; it++) {
      const r = maxRect(free, W, H, mw, mh);
      if (!r) break;
      const [x, y, w, h] = r;
      const kill = (p) => {
        for (let yy = Math.max(0, y - p); yy < Math.min(H, y + h + p); yy++)
          for (let xx = Math.max(0, x - p); xx < Math.min(W, x + w + p); xx++) free[yy * W + xx] = 0;
      };
      out.push([Math.round(g.ox + x * c), Math.round(g.oy + y * c), Math.round(g.ox + (x + w) * c), Math.round(g.oy + (y + h) * c)]);
      kill(gc);
    }
    return out.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
  }

  /* ---------------- the scale bar ---------------- */
  /** A round distance whose bar is 40-160 px at `pxPerM` (the one nearest 90 px). */
  function scaleFor(pxPerM) {
    const cand = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10].map((m) => [m, m * pxPerM]);
    const ok = cand.filter(([, L]) => L >= 40 && L <= 160);
    const [m, L] = (ok.length ? ok : cand).sort((a, b) => Math.abs(a[1] - 90) - Math.abs(b[1] - 90))[0];
    return { m, L, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }

  /* ---------------- the note ---------------- */
  /** an item's note: its name (+ the numeral when the notes name it) and its detail line (page 1: the address) */
  function noteHTML(r, named) {
    const c = named ? (ctx.inkNums ? "var(--ink)" : "var(--c5)") : `var(--${r.slot || "c1"})`;
    // a named route whose pocket block is not shown at this width carries that block's lead line in its note
    const b = named && ctx.desk && ctx.blocks.find((x) => (x.named || []).includes(named.n) && ctx.placed.hidden.has(x.name));
    const lead = b && ctx.stageEl.querySelector(`.pockets [data-pocket="${b.name}"] .named-lead`);
    const leadHTML = lead && !lead.querySelector(".named-link") ? `<span class="note-lead">${esc(lead.textContent.trim())}</span>` : "";
    return leadHTML + (named ? `<span class="numeral" style="color: ${c}">${named.n}</span> ` : "") +
      `<span class="note-name" style="color: ${c}">${esc(r.name).replace(/\S*-\S*/g, (w) => `<span class="nb">${w}</span>`)}</span>` +
      `<span class="note-address">${esc(r.detail)}</span>`;
  }

  /** v2.5-S5: the item layers of pages 2-4. Every item's parts in passes, so a thin mark never paints over a thicker
      one and the subject hue over the rest hue: by weight (faint, thin, split, then bold/thick), within a weight the
      `off` parts before the `on` parts, a named item after the rest. One path per item and part. */
  const WEIGHT = { faint: 0, thin: 1, split: 2, bold: 3, thick: 3 };
  function drawItems(g, data, line) {
    const passes = [];
    data.layers.filter((l) => l.items).forEach((L) => {
      const rest = L.off === "rest" ? "var(--context-rest)" : L.off ? `var(--${data.slots[L.off]})` : null;
      L.items.forEach((it) => {
        const onC = it.named && L.named_paint === "all" ? "var(--c5)" : `var(--${L.slot})`;
        const offC = it.named && L.named_paint === "off" ? "var(--c5)" : rest;
        if (it.off.length && offC) passes.push({ it, L, part: "off", c: offC, lines: it.off });
        if (it.on.length) passes.push({ it, L, part: "on", c: onC, lines: it.on });
      });
    });
    const rank = (p) => (WEIGHT[p.it.w] || 0) * 10 + (p.part === "on" ? 2 : 0) + (p.it.named ? 1 : 0);
    passes.sort((a, b) => rank(a) - rank(b));
    g.selectAll("path").data(passes).join("path")
      .attr("class", (p) => `alley-mark ${p.part} w-${p.it.w}${p.it.named ? " named" : ""}`)
      .attr("data-kind", (p) => p.L.kind).attr("data-part", (p) => p.part).attr("data-id", (p) => p.it.id)
      .attr("data-named", (p) => p.it.named || null)
      .style("stroke", (p) => p.c).attr("d", (p) => p.lines.map(line).join(""));
  }

  /* one listener set per page; each redraw swaps the context they act on */
  let ctx = null, wired = false;

  A.heroes.alleys = function (fig, data, base, opts) {
    const stageEl = fig.closest(".stage");
    const w = Math.max(240, Math.floor(fig.clientWidth)), h = Math.max(200, Math.floor(fig.clientHeight));
    const desk = window.innerWidth >= DESK;
    stageEl.classList.toggle("is-desk", desk);
    d3.select(fig).selectAll("svg.hero-map").remove();
    const svg = d3.select(fig).insert("svg", ":first-child").attr("class", "hero-map")
      .attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h).attr("role", "img");
    const layer = (k) => data.layers.find((l) => l.kind === k);
    const net = layer("network"), worship = layer("worship");
    const namedList = data.layers.flatMap((l) => l.named || []);
    const byN = new Map(namedList.map((x) => [x.n, x]));
    // every item the reader can point at: page 1's worship routes, pages 2-4's streets and alleys; its named place
    const items = new Map();
    if (worship) worship.routes.forEach((r) => items.set(r.id, { id: r.id, name: r.name, detail: r.address, lines: [r.c], slot: "c1" }));
    data.layers.filter((l) => l.items).forEach((L) => L.items.forEach((it) =>
      items.set(it.id, { id: it.id, name: it.name, detail: it.detail, lines: it.on.concat(it.off), slot: L.slot })));
    const named = new Map();
    namedList.forEach((x) => (x.items || [x.id]).forEach((id) => named.set(id, x)));
    const st = data.stage;
    const blocks = st.order.map((name) => Object.assign({ name }, st.blocks[name]));
    const inkNums = data.layers.some((l) => l.ink);
    svg.attr("aria-label", data.aria);
    svg.style("--route-w", (desk ? 3 : 2.5) + "px").style("--named-w", (desk ? 4.5 : 4) + "px");

    // the land's aspect, from a unit fit of the outline (the tinted extent)
    const unitB = d3.geoPath(d3.geoMercator().fitSize([1000, 1000], base.outline)).bounds(base.outline);
    const aspect = (unitB[1][0] - unitB[0][0]) / (unitB[1][1] - unitB[0][1]);
    const fitBox = (x, y, lw) => d3.geoMercator().fitExtent([[x, y], [x + lw, y + lw / aspect]], base.outline);

    let proj, land, mapH;
    const foot = stageEl.querySelector(".stage-foot");
    if (desk) {
      const fh = foot ? Math.ceil(foot.getBoundingClientRect().height) : 0;
      mapH = h - fh;
      const aw = w - 2 * FIT_PAD, ah = mapH - 2 * FIT_PAD;
      const lh = Math.min(ah, aw / aspect), lw = lh * aspect;
      const x = (w - lw) / 2, y = FIT_PAD + (ah - lh) / 2;
      proj = fitBox(x, y, lw);
      land = [x, y, x + lw, y + lh];
    } else {
      mapH = h;
      const aw = w - 2 * SIDE_P, ah = mapH - 32;
      const lw = Math.min(aw, ah * aspect), lh = lw / aspect;
      const x = (w - lw) / 2, y = 6 + (ah - lh) / 2;
      proj = fitBox(x, y, lw);
      land = [x, y, x + lw, y + lh];
    }
    const outlinePath = d3.geoPath(proj);
    const landPath = new Path2D(outlinePath(base.outline));   // the projected land, for the occupancy grids

    // ---- the map: one g.map-panel; a camera group holds everything the camera scales
    const panel = svg.append("g").attr("class", "map-panel").attr("data-page", data.page);
    panel.append("rect").attr("class", "panel-bounds").attr("width", w).attr("height", mapH).attr("fill", "none").attr("stroke", "none");
    svg.append("defs").append("clipPath").attr("id", "stage-view").append("rect").attr("width", w).attr("height", mapH);
    const view = panel.append("g").attr("class", "map-view").attr("clip-path", "url(#stage-view)");
    const camera = view.append("g").attr("class", "camera").attr("data-el", "camera");
    const P = (q) => proj(q).map((v) => v.toFixed(1)).join(",");
    const line = (c) => "M" + c.map(P).join("L");
    svg.select("defs").append("clipPath").attr("id", "alleys-district").append("path").attr("d", outlinePath(base.outline));
    camera.append("path").attr("class", "base-outline").attr("d", outlinePath(base.outline))
      .attr("fill", "var(--base-fill)").attr("stroke", "none");
    const ng = camera.append("g").attr("class", "network").attr("clip-path", "url(#alleys-district)");
    const lines = (net && net.lines) || [];
    ng.append("path").attr("class", "alley-network minor")
      .attr("d", lines.filter((x) => !MAIN_ROADS.has(x.highway)).map((x) => line(x.c)).join(""));
    ng.append("path").attr("class", "alley-network main")
      .attr("d", lines.filter((x) => MAIN_ROADS.has(x.highway)).map((x) => line(x.c)).join(""));
    camera.append("path").attr("class", "base-edge").attr("d", outlinePath(base.outline))
      .attr("fill", "none").attr("stroke", "var(--ink-soft)").attr("stroke-width", 0.9);
    // page 3: old Ward 25's outline, dashed, under the marks (context: ink, no data hue)
    const wardL = layer("ward_outline");
    if (wardL) camera.append("path").attr("class", "ward-outline").attr("data-name", wardL.name)
      .attr("d", wardL.rings.map((r) => line(r) + "Z").join(""));
    const routesG = camera.append("g").attr("class", "routes-layer").attr("data-el", "routes");
    let hitList;
    if (worship) {
      const plainRoutes = worship.routes.filter((r) => !named.has(r.id));
      const namedRoutes = worship.routes.filter((r) => named.has(r.id)).sort((a, b) => named.get(a.id).n - named.get(b.id).n);
      // every worship route is one path.alley-route; the named ones paint last, in the pointer hue
      routesG.append("g").attr("class", "routes routes-worship").selectAll("path").data(plainRoutes).join("path")
        .attr("class", "alley-route").attr("data-kind", "worship").attr("data-id", (r) => r.id).attr("d", (r) => line(r.c));
      routesG.append("g").attr("class", "routes routes-named").selectAll("path").data(namedRoutes).join("path")
        .attr("class", "alley-route named").attr("data-kind", "worship").attr("data-named", (r) => named.get(r.id).n)
        .attr("data-id", (r) => r.id).attr("d", (r) => line(r.c));
      hitList = plainRoutes.concat(namedRoutes).map((r) => items.get(r.id));
    } else {
      drawItems(routesG, data, line);
      hitList = [...items.values()].sort((a, b) => (named.has(a.id) ? 1 : 0) - (named.has(b.id) ? 1 : 0));
    }
    // the hit strokes: one per route (street, alley), over every mark, focusable (no note is hover-only)
    camera.append("g").attr("class", "route-hits").selectAll("path").data(hitList).join("path")
      .attr("class", "route-hit").attr("data-id", (r) => r.id).attr("d", (r) => r.lines.map(line).join(""))
      .attr("tabindex", 0).attr("role", "button").attr("aria-label", (r) => `${r.name}, ${r.detail}`);
    const numeralsG = panel.append("g").attr("class", "numerals" + (inkNums ? " ink" : "")).attr("data-el", "numerals");

    const pxPerM = (() => {
      const c = proj.invert([(land[0] + land[2]) / 2, (land[1] + land[3]) / 2]) || [106.71, 10.81];
      const dLon = 100 / (111320 * Math.cos((c[1] * Math.PI) / 180));
      return (proj([c[0] + dLon, c[1]])[0] - proj(c)[0]) / 100;
    })();

    const placed = { blocks: {}, free: [], frame: [0, 0, w, mapH], hidden: new Set() };
    const prev = ctx;
    if (prev) {   // R35 M6: the old ctx's pending note/numeral timers close over its camera; they must not land here
      clearTimeout(prev.numTimer);
      clearTimeout(prev.timer);
      // a desktop reading panel's inline place does not follow the page onto a phone (or back): the panel closes
      if (prev.desk !== desk) {
        const rd = stageEl.querySelector(".reading");
        if (rd) {
          rd.style.cssText = "";
          rd.classList.remove("open");
          stageEl.querySelectorAll("button.read-toggle").forEach((t) => t.setAttribute("aria-expanded", "false"));
        }
      }
    }
    ctx = { fig, stageEl, svg, w, h, mapH, desk, proj, land, camera, routesG, numeralsG, items, named, byN, data, base,
      blocks, steps: st.steps, targets: st.targets, zoomDim: !!st.zoom_dim, inkNums, allNums: namedList.map((x) => x.n),
      placed, pxPerM, cam: { k: 1, x: 0, y: 0, n: null }, state: null, pinned: false, timer: 0, numTimer: 0,
      step: prev && !prev.desk && !desk ? prev.step : 0, outlinePath, landPath,
      keyInFoot: !!(opts && opts.keyInFoot), claimCompact: !!(opts && opts.claimCompact), noNames: !!(opts && opts.noNames),
      wide: !!(opts && opts.wide), nextOpts: null };

    stageEl.classList.toggle("key-in-foot", !!(desk && opts && opts.keyInFoot));
    stageEl.toggleAttribute("data-ink", inkNums);   // page 3 points in ink: its notes' numerals and names too
    // v2.5.2: the scale bar at rest before the key is measured (setCamera sets it only after placement, so a key fitted
    // to a narrow side-margin pocket grew past it)
    const s0 = scaleFor(pxPerM);
    stageEl.querySelectorAll(".scale-bar").forEach((b) => { b.style.width = s0.L.toFixed(1) + "px"; });
    stageEl.querySelectorAll(".scale-label").forEach((t) => { t.textContent = s0.label; });
    if (desk && placeDesk() === "refit") return A.heroes.alleys(fig, data, base, ctx.nextOpts);
    if (!desk) placePhone();
    stageEl.style.setProperty("--map-bottom", mapH + "px");
    wire();
    ctx.state = null;
    if (desk) {
      document.body.removeAttribute("data-step");
      apply({ cam: null, nums: ctx.allNums, active: null }, true);
    } else {
      setStep(ctx.step, true);
    }
    delete stageEl.dataset.noteDropped;
    stageEl.setAttribute("data-placed", "");
  };

  /* ---------------- desktop: the pockets ---------------- */
  /** The blocks go in the page's order (stage.order; page 1: claim, bars, pair, longest, key, R18; pages 2-4: claim,
      their secondary, key, then the notes, which is how the approved S5 mocks sit).
      - Claim, bars and key take the pocket of their own size rank when it holds them, else the next free pocket by size
        order; the key that no pocket holds becomes one compact line in the footer strip.
      - The place notes (pair: 1 and 2; longest: 3) take the free pocket nearest their own routes' doors (R17), in their
        full form if any free pocket holds it, else in their compact form (numeral + name, no "off X" line). Only the
        longest note may then be left out, logged, its words carried by route 3's note (map-page standard §1).
      - S5: if any other block is left out while the key holds a pocket, the key moves to the footer strip and the
        blocks are placed again (R18's fallback, before a note goes hover-only).
      In each pocket a block tries its own type, then its tight variant (one step down the type scale).
      v2.5.2: the pockets are searched in the land's box first. When that pass loses anything (the key to the footer, a
      block hidden, the claim compact, the door numbers dropped), all is placed again over the land's rows at the full
      stage width (`wide`): on a height-bound fit the side margins beside the box are the largest pockets there are. */
  function placeDesk() {
    const { stageEl, w, mapH, land } = ctx;
    const area = ctx.wide ? [FIT_PAD, land[1], w - FIT_PAD, land[3]] : land;
    const g = landGrid(area, CELL, CLEAR, ctx.landPath);
    const found = pockets(g, MIN_W, MIN_H, PGAP, 10);
    const log = [];
    stageEl.querySelectorAll(".pockets .pocket").forEach((el) => {
      el.classList.remove("placed", ...FORMS); el.removeAttribute("style");
      delete el.dataset.pocketNo; delete el.dataset.rect; delete el.dataset.form; });
    /** the block's natural height at width wd */
    const measure = (el, wd) => { el.style.width = wd + "px"; el.style.height = ""; return Math.ceil(el.scrollHeight); };
    /** the block in pocket p, in the first of `variants` that fits; null when none does */
    const fitIn = (b, el, p, variants) => {
      const pw = p[2] - p[0], ph = p[3] - p[1], wd = Math.floor(Math.min(pw, b.maxW));
      for (const v of variants) {
        FORMS.forEach((c) => el.classList.toggle(c, v.split(" ").includes(c)));
        const bh = measure(el, wd);
        if (bh > ph || el.scrollWidth > wd) continue;
        const top = b.valign === "bottom" ? p[3] - bh : p[1];
        return { box: [p[0], top, p[0] + wd, top + bh], rect: p, variant: v };
      }
      el.classList.remove(...FORMS);
      return null;
    };
    const hit = (a, b, pad) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];
    const clear = (p) => !Object.values(ctx.placed.blocks).some((bx) => hit(p, bx, PGAP / 2));
    /** the number of the found pocket the block's box overlaps most ("free" when none) */
    const label = (bx) => {
      const ov = (p) => Math.max(0, Math.min(p[2], bx[2]) - Math.max(p[0], bx[0])) * Math.max(0, Math.min(p[3], bx[3]) - Math.max(p[1], bx[1]));
      let bi = -1, ba = 0;
      found.forEach((p, i) => { const a = ov(p); if (a > ba) { ba = a; bi = i; } });
      return bi < 0 ? "free" : String(bi + 1);
    };
    const set = (b, el, got) => {
      const bx = got.box;
      Object.assign(el.style, { left: bx[0] + "px", top: bx[1] + "px", width: bx[2] - bx[0] + "px", height: bx[3] - bx[1] + "px" });
      el.dataset.pocketNo = label(got.box);
      el.dataset.rect = got.rect.join(",");
      el.dataset.form = got.variant || "full";
      el.classList.add("placed");
      ctx.placed.blocks[b.name] = bx;
      log.push(`${b.name}: pocket ${el.dataset.pocketNo} (${size(got.rect)}${got.variant ? ", " + got.variant : ""})`);
    };
    const size = (r) => `${r[2] - r[0]}x${r[3] - r[1]}`;
    /** what is free in the land's box once the placed blocks are set: its pockets, largest first */
    const freeNow = () => {
      const g2 = copyGrid(g);
      Object.values(ctx.placed.blocks).forEach((bx) => block(g2, bx, PGAP));
      return pockets(g2, MIN_W, MIN_H, PGAP, 8);
    };
    // where a note's named places are: page 1 their doors, pages 2-4 the middle of their marks (hero `near`)
    const doors = (ns) => ns.map((n) => ctx.proj(ctx.byN.get(n).near));
    const near = (p, pts) => pts.reduce((s, q) => s + Math.hypot((p[0] + p[2]) / 2 - q[0], (p[1] + p[3]) / 2 - q[1]), 0) / pts.length;
    const hidden = new Set();
    // an `early` block (S5: the key) takes its own size-rank pocket in its turn, or waits until the notes are placed
    const queue = ctx.blocks.slice(), late = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const b = queue[qi];
      const el = stageEl.querySelector(`.pockets [data-pocket="${b.name}"]`);
      if (!el || !el.children.length) continue;
      let got = null;
      if (b.early && !late.includes(b) && !(b.name === "key" && ctx.keyInFoot)) {
        const own = found[b.want - 1];
        got = own && clear(own) ? fitIn(b, el, own, b.variants || VARIANTS) : null;
        if (got) { set(b, el, got); continue; }
        late.push(b); queue.push(b); continue;
      }
      if (b.name === "key" && ctx.keyInFoot) { /* the refit pass: the key stays in the footer strip */ }
      else if (b.name === "claim") {
        // R21: the claim is never hidden. Its own forms in its size-rank pocket, then any; then the compact claim
        // (headline, number and gloss a step down, "Read the page" kept) before anything else is placed; failing
        // that it takes the largest pocket, compact, and every block after it makes do with what is left
        const order = [b.want - 1].concat(found.map((_, i) => i).filter((i) => i !== b.want - 1))
          .filter((i) => i < found.length).map((i) => found[i]);
        const forms = ctx.claimCompact ? [["compact"]] : [b.variants || VARIANTS, ["compact"]];
        for (const f of forms) {
          for (const p of order) { got = fitIn(b, el, p, f); if (got) break; }
          if (got) break;
        }
        if (!got) {
          const p = found[0] || [ctx.land[0], ctx.land[1], ctx.land[2], ctx.land[3]];
          el.classList.add("compact");
          const wd = Math.floor(Math.min(p[2] - p[0], b.maxW));
          got = { box: [p[0], p[1], p[0] + wd, p[3]], rect: p, variant: "compact forced" };
        }
      }
      else if (b.named) {
        const pts = doors(b.named);
        const list = freeNow().sort((p, q) => near(p, pts) - near(q, pts));
        // R31: a compact form's names line only while it costs no other block its pocket (the refit pass drops it)
        const compact = b.compact && ctx.noNames && b.compact.some((f) => f.includes("nonames"))
          ? b.compact.filter((f) => f.includes("nonames")) : b.compact;
        // v2.5.2: a form that drops content (R30 `nogrid`, R31 `nonames`) only once no pocket holds a form that keeps it
        const lossy = (f) => / (nogrid|nonames)\b/.test(" " + f);
        const keep = compact && compact.filter((f) => !lossy(f)), drop = compact && compact.filter(lossy);
        for (const forms of [b.variants || VARIANTS, keep, drop].filter((f) => f && f.length)) {
          for (const p of list) { got = fitIn(b, el, p, forms); if (got) break; }
          if (got) break;
        }
      } else {
        const order = [b.want - 1].concat(found.map((_, i) => i).filter((i) => i !== b.want - 1))
          .filter((i) => i < found.length && clear(found[i])).map((i) => found[i]);
        for (const p of order.concat(freeNow())) { got = fitIn(b, el, p, b.variants || VARIANTS); if (got) break; }
      }
      if (got) { set(b, el, got); continue; }
      el.style.width = "";
      if (b.name === "key") {   // R18: the key's compact line in the footer strip
        stageEl.classList.add("key-in-foot");
        log.push("key: no pocket holds it, compact line in the footer strip");
      } else {
        hidden.add(b.name);
        log.push(`${b.name}: no free pocket holds it, not shown (its routes' notes carry it)`);
      }
    }
    ctx.placed.hidden = hidden;
    stageEl.dataset.pockets = found.map((p) => `${size(p)}@${p[0]},${p[1]}`).join(" ");
    stageEl.dataset.pocketLog = log.join("; ");
    // the footer strip grew a row (the key): the map was fitted above its old height, so the caller fits it again
    const fh = Math.ceil(stageEl.querySelector(".stage-foot").getBoundingClientRect().height);
    const refit = (o) => { ctx.nextOpts = Object.assign({ keyInFoot: ctx.keyInFoot, claimCompact: ctx.claimCompact,
      noNames: ctx.noNames, wide: ctx.wide }, o); return "refit"; };
    // v2.5.2: the land's box lost something: place everything again, the side margins searched too
    const nogrid = !!stageEl.querySelector(".pockets .pocket.placed.nogrid");
    const claimEl = stageEl.querySelector('.pockets [data-pocket="claim"]');
    if (!ctx.wide && (stageEl.classList.contains("key-in-foot") || hidden.size || nogrid || ctx.claimCompact ||
      (claimEl && claimEl.classList.contains("compact"))))
      return refit({ wide: true });
    if (!ctx.keyInFoot && stageEl.classList.contains("key-in-foot") && Math.abs(ctx.h - fh - mapH) > 1) return refit({ keyInFoot: true });
    // R21: the secondary (bars) yields only to the claim: hidden, the claim drops to its compact form and all is placed
    // again; S5: a block that must show lost its pocket while the key holds one: the key gives its pocket up
    const must = ctx.blocks.filter((b) => !b.may_hide && hidden.has(b.name));
    if (!ctx.claimCompact && hidden.has("bars")) return refit({ claimCompact: true });
    if (!ctx.keyInFoot && must.length && ctx.placed.blocks.key) { stageEl.classList.add("key-in-foot"); return refit({ keyInFoot: true }); }
    // v2.5.2: the door numbers (R30) outrank the key's pocket too
    if (!ctx.keyInFoot && nogrid && ctx.placed.blocks.key) { stageEl.classList.add("key-in-foot"); return refit({ keyInFoot: true }); }
    // R31: a block left out while another kept its compact names line: place again without the names lines
    const named = stageEl.querySelectorAll(".pockets .pocket.placed.compact:not(.nonames)");
    if (!ctx.noNames && hidden.size && [...named].some((el) => ((ctx.blocks.find((b) => b.name === el.dataset.pocket) || {}).compact || [])
      .some((f) => f.includes("nonames")))) return refit({ noNames: true });
    // what is free once the blocks are set, largest first: the hover note and the reading look here (camera at rest)
    const g2 = copyGrid(g);
    Object.values(ctx.placed.blocks).forEach((b) => block(g2, b, TEXT_GAP));
    ctx.placed.free = pockets(g2, MIN_W, MIN_H, TEXT_GAP, 6);
    // the camera's frame on a named route: the largest box clear of every block (the zoomed land may run under them)
    const g3 = emptyGrid([0, 0, w, mapH], CELL);
    Object.values(ctx.placed.blocks).forEach((b) => block(g3, b, TEXT_GAP));
    ctx.placed.frame = pockets(g3, 0, 0, 0, 1)[0] || [0, 0, w, mapH];
    // v2.5.2: with blocks in the side margins too, the largest box can be the wrong shape for a target: camFor
    // searches this grid for the clear box of the target's own shape at the largest scale
    ctx.placed.frameGrid = g3;
    return "ok";
  }
  /** Where the note may go in the current camera: at rest the free pockets of the land's box; under a closer camera
      the free rectangles off the zoomed land (dilated as usual) and off every block, over the whole map. */
  function noteFree() {
    if (ctx.cam.k <= 1.01) return ctx.placed.free;
    const z = new Path2D();
    z.addPath(ctx.landPath, new DOMMatrix([ctx.cam.k, 0, 0, ctx.cam.k, ctx.cam.x, ctx.cam.y]));
    const g = landGrid([EDGE, EDGE, ctx.w - EDGE, ctx.mapH - EDGE], CELL, CLEAR, z);
    Object.values(ctx.placed.blocks).forEach((b) => block(g, b, TEXT_GAP));
    return pockets(g, MIN_W, MIN_H, TEXT_GAP, 6);
  }

  /* ---------------- phone: the big number in the map's largest pocket ---------------- */
  function placePhone() {
    const { stageEl, w, mapH, fig } = ctx;
    const g = landGrid([SIDE_P, 4, w - SIDE_P, mapH - 30], CELL_P, CLEAR_P, ctx.landPath);
    const found = pockets(g, 0, 0, 0, 3);
    const num = fig.querySelector(".map-number");
    num.style.left = num.style.top = "";
    const nw = Math.ceil(num.offsetWidth), nh = Math.ceil(num.offsetHeight);
    const p = found.find((r) => r[2] - r[0] >= nw && r[3] - r[1] >= nh);
    if (p) {
      num.style.left = p[2] - nw + "px"; num.style.top = p[3] - nh + "px";
      num.dataset.rect = p.join(",");
    } else {
      console.warn("atlas: no map pocket holds the big number");
      num.style.left = w - SIDE_P - nw + "px"; num.style.top = "4px";
    }
    stageEl.dataset.pockets = found.map((r) => `${r[2] - r[0]}x${r[3] - r[1]}@${r[0]},${r[1]}`).join(" ");
  }

  /* ---------------- the camera ---------------- */
  /** the camera on target `n` (a key of the hero's stage.targets: page 1 a named route, pages 2-4 the named marks):
      their box, padded by the target's share of the land's width, fitted to the frame clear of the blocks */
  function camFor(n) {
    if (!n) return { k: 1, x: 0, y: 0, n: null };
    const t = ctx.targets[n];
    if (!t) return { k: 1, x: 0, y: 0, n: null };
    const pts = t.lines.flat().map(ctx.proj);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const pad = t.pad * (ctx.land[2] - ctx.land[0]);
    const bw = Math.max(...xs) - Math.min(...xs) + 2 * pad, bh = Math.max(...ys) - Math.min(...ys) + 2 * pad;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const fit = (f) => Math.min((f[2] - f[0]) / bw, (f[3] - f[1]) / bh);
    const [x0, y0, x1, y1] = [shapedFrame(bw, bh), ctx.placed.frame].filter(Boolean).reduce((a, f) => (fit(f) > fit(a) ? f : a));
    const k = fit([x0, y0, x1, y1]);
    return { k, x: (x0 + x1) / 2 - k * cx, y: (y0 + y1) / 2 - k * cy, n };
  }
  /** v2.5.2: the clear box (off every block) that holds a bw x bh target at the largest scale: the largest k for which
      an empty k*bw x k*bh rectangle exists, by bisection on the frame grid (maxRect finds one when any does) */
  function shapedFrame(bw, bh) {
    const g = ctx.placed.frameGrid;
    if (!g || !(bw > 0 && bh > 0)) return null;
    const c = g.cell, free = g.occ.map((v) => (v ? 0 : 1));
    let lo = 0, hi = Math.min((g.cw * c) / bw, (g.ch * c) / bh), best = null;
    for (let i = 0; i < 16; i++) {
      const k = (lo + hi) / 2;
      const r = maxRect(free, g.cw, g.ch, Math.ceil((k * bw) / c), Math.ceil((k * bh) / c));
      if (r) { lo = k; best = r; } else hi = k;
    }
    return best && [g.ox + best[0] * c, g.oy + best[1] * c, g.ox + (best[0] + best[2]) * c, g.oy + (best[1] + best[3]) * c];
  }
  function setCamera(cam) {
    ctx.cam = cam;
    const el = ctx.camera.node();
    el.style.transitionDuration = ms(CAM_MS) + "ms";
    el.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`;
    ctx.svg.classed("zoomed", cam.k > 1.01);
    const s = scaleFor(ctx.pxPerM * cam.k);
    ctx.stageEl.querySelectorAll(".scale-bar").forEach((b) => { b.style.width = s.L.toFixed(1) + "px"; });
    ctx.stageEl.querySelectorAll(".scale-label").forEach((t) => { t.textContent = s.label; });
  }

  /* ---------------- the numerals ---------------- */
  /** Each shown numeral past its route's door (pages 2-4: its anchor, a street's or alley's end), along the line's last
      direction (turned as little as it takes to keep it off its own marks), in screen px for camera `cam`. */
  function drawNumerals(nums, cam) {
    const g = ctx.numeralsG;
    g.selectAll("*").remove();
    const gap0 = ctx.desk ? 13 : 12, half = (ctx.desk ? 4.5 : 4) / 2;
    nums.forEach((n) => {
      const x = ctx.byN.get(n);
      if (!x) return;
      const S = (q) => { const p = ctx.proj(q); return [cam.k * p[0] + cam.x, cam.k * p[1] + cam.y]; };
      const scr = x.anchor.map(S);
      const door = scr[scr.length - 1];
      let j = scr.length - 2;
      while (j > 0 && Math.hypot(door[0] - scr[j][0], door[1] - scr[j][1]) < 1) j--;
      const back = scr[Math.max(0, j)];
      const base = Math.atan2(door[1] - back[1], door[0] - back[0]);
      // its own marks sampled every 1.5 px, to keep the numeral off them
      const samples = [];
      (x.items || [x.id]).forEach((id) => ctx.items.get(id).lines.forEach((ln) => {
        const sl = ln.map(S);
        for (let i = 1; i < sl.length; i++) {
          const [ax, ay] = sl[i - 1], [bx, by] = sl[i], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
          for (let q = 0; q <= m; q++) samples.push([ax + ((bx - ax) * q) / m, ay + ((by - ay) * q) / m]);
        }
      }));
      const t = g.append("text").attr("class", "numeral").attr("data-n", n).attr("text-anchor", "middle")
        .attr("dominant-baseline", "central").text(String(n));
      const turns = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((d) => (d * Math.PI) / 180);
      let done = false;
      for (let gap = gap0; gap <= gap0 + 12 && !done; gap += 4) {
        for (const d of turns) {
          const a = base + d, px = door[0] + Math.cos(a) * gap, py = door[1] + Math.sin(a) * gap;
          t.attr("x", px.toFixed(1)).attr("y", py.toFixed(1));
          const bb = t.node().getBBox();
          const on = samples.some(([sx, sy]) => sx > bb.x - half && sx < bb.x + bb.width + half &&
            sy > bb.y - half && sy < bb.y + bb.height + half);
          if (!on) { done = true; break; }
        }
      }
      if (!done) t.attr("x", (door[0] + Math.cos(base) * gap0).toFixed(1)).attr("y", (door[1] + Math.sin(base) * gap0).toFixed(1));
    });
  }

  /* ---------------- states ---------------- */
  /** One state for both triggers: {cam: a camera target or null, nums: numerals shown, active: hovered route id, plain: the
      named routes not yet pointed at (phone steps 1-2), dim: the other routes faded (a camera on a named route), big:
      the phone's big number}. */
  function apply(st, instant) {
    const prev = ctx.state;
    ctx.state = st;
    const L = ctx.routesG;
    L.classed("plain", !!st.plain).classed("dim", !!st.dim).classed("has-active", !!st.active);
    L.selectAll("path.alley-route, path.alley-mark").classed("active", function () { return this.dataset.id === st.active; });
    ctx.stageEl.classList.toggle("show-number", !!st.big);
    const camChange = instant || !prev || (prev.cam || null) !== (st.cam || null);
    const numsChange = camChange || (prev.nums || []).join() !== (st.nums || []).join();
    if (numsChange) clearTimeout(ctx.numTimer);   // a pending show of the same numerals (after the camera) stands
    if (camChange) {
      const cam = camFor(st.cam);
      setCamera(cam);
      ctx.numeralsG.classed("out", true);
      const show = () => { drawNumerals(st.nums || [], cam); ctx.numeralsG.classed("out", false); };
      if (instant || reduce.matches) show();
      else ctx.numTimer = setTimeout(show, ms(CAM_MS));
    } else if (numsChange) {
      drawNumerals(st.nums || [], ctx.cam);
    }
  }
  const restState = () => (ctx.desk ? { cam: null, nums: ctx.allNums, active: null } : stepState(ctx.step));
  function stepState(n) {
    const s = ctx.steps[Math.max(0, Math.min(ctx.steps.length - 1, n))];
    return { cam: s.cam, nums: s.nums, plain: !!s.plain, dim: !!s.dim, big: !!s.big, active: null };
  }

  /* ---------------- the note (desktop hover/focus/click; phone tap) ---------------- */
  function noteEl() { return ctx.stageEl.querySelector(".stage-note"); }
  /** desktop: the note in the largest pocket that is free once the blocks are set; null when none holds it */
  function placeNote(n) {
    uncover();
    if (!ctx.desk) return true;
    for (const p of noteFree()) {
      const wd = Math.floor(Math.min(p[2] - p[0], 300));
      n.style.width = wd + "px"; n.style.height = "";
      const nh = Math.ceil(n.scrollHeight);
      if (nh <= p[3] - p[1]) {
        Object.assign(n.style, { left: p[0] + "px", top: p[1] + "px", height: nh + "px" });
        n.dataset.rect = p.map((v) => v.toFixed(0)).join(",");
        return true;
      }
    }
    // S5 (pages 2-4): no free room at rest: the note takes a block's pocket (the largest that holds it, never the
    // claim's), and the blocks under it step aside until the note goes; R30 (stage.link_note, page 4): under the
    // camera too, so the note its link pins always shows
    if (ctx.data.stage.note_may_cover && (ctx.cam.k <= 1.01 || ctx.data.stage.link_note)) {
      // a block that explains the note's own named place is covered last (review M2)
      const nm = n.dataset.id && ctx.named.get(n.dataset.id);
      const names = (el) => !!nm && (ctx.blocks.find((b) => b.name === el.dataset.pocket) || {}).named?.includes(nm.n);
      const els = [...ctx.stageEl.querySelectorAll(".pockets .pocket.placed[data-rect]")]
        .filter((el) => el.dataset.pocket !== "claim").map((el) => ({ el, r: el.dataset.rect.split(",").map(Number) }))
        .sort((a, b) => (names(a.el) - names(b.el)) ||
          (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
      const claim = ctx.placed.blocks.claim;
      for (const { r: p } of els) {
        const wd = Math.floor(Math.min(p[2] - p[0], 300));
        n.style.width = wd + "px"; n.style.height = "";
        const nh = Math.ceil(n.scrollHeight), box = [p[0], p[1], p[0] + wd, p[1] + nh];
        const hit = (b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3];
        if (nh > p[3] - p[1] || (claim && hit(claim))) continue;
        Object.assign(n.style, { left: p[0] + "px", top: p[1] + "px", height: nh + "px" });
        n.dataset.rect = p.map((v) => v.toFixed(0)).join(",");
        Object.entries(ctx.placed.blocks).forEach(([name, b]) => {
          if (name !== "claim" && hit(b)) ctx.stageEl.querySelector(`.pockets [data-pocket="${name}"]`).classList.add("under-note");
        });
        return true;
      }
    }
    return false;
  }
  /** the blocks a note stepped over come back */
  function uncover() { ctx.stageEl.querySelectorAll(".pockets .under-note").forEach((el) => el.classList.remove("under-note")); }
  function showNote(id) {
    clearTimeout(ctx.timer);
    const n = noteEl(), r = ctx.items.get(id);
    if (!r) return;
    if (n.dataset.id !== id) n.innerHTML = noteHTML(r, ctx.named.get(id));
    n.hidden = false;
    n.dataset.id = id;
    if (!placeNote(n)) { n.hidden = true; ctx.stageEl.dataset.noteDropped = "1"; }
    else delete ctx.stageEl.dataset.noteDropped;
    const base = ctx.state || restState();
    apply(Object.assign({}, base, { active: id }));
  }
  function clearNote() {
    clearTimeout(ctx.timer);
    const n = noteEl();
    n.hidden = true; n.innerHTML = ""; delete n.dataset.id;
    uncover();
    ctx.pinned = false;
    apply(Object.assign({}, ctx.state || restState(), { active: null }));
  }
  function later() { clearTimeout(ctx.timer); if (!ctx.pinned) ctx.timer = setTimeout(clearNote, 450); }
  /** desktop: the camera on named place n's target, with the numerals of every place that target frames */
  function zoomTo(n) {
    if (!ctx.desk) return;
    const n0 = noteEl(); n0.hidden = true; n0.innerHTML = ""; delete n0.dataset.id;
    uncover();
    const t = ctx.byN.get(n).target;
    apply({ cam: t, nums: ctx.allNums.filter((m) => ctx.byN.get(m).target === t), dim: ctx.zoomDim, active: null });
  }
  const camOf = (n) => (ctx.byN.get(n) || {}).target;
  function reset() {
    const n0 = noteEl(); n0.hidden = true; n0.innerHTML = ""; delete n0.dataset.id;
    uncover();
    ctx.pinned = false;
    apply(restState());
  }

  /* ---------------- the phone steps ---------------- */
  function setStep(n, force) {
    if (!ctx || ctx.desk) return;
    if (n === ctx.step && !force) return;
    ctx.step = n;
    document.body.dataset.step = String(n);
    ctx.stageEl.querySelectorAll("section.step").forEach((s) => s.classList.toggle("current", +s.dataset.step === n));
    const c = ctx.stageEl.querySelector(".step-count");
    if (c) c.textContent = `Step ${n + 1} of ${ctx.steps.length}` + (n < ctx.steps.length - 1 ? " · scroll ↓" : "");
    const n0 = noteEl(); n0.hidden = true; n0.innerHTML = ""; delete n0.dataset.id;
    apply(stepState(n), !!force);
  }
  /** the step whose section crosses the line just under the pinned map */
  function stepAtLine() {
    const top = ctx.fig.getBoundingClientRect().top;
    const y = top + ctx.mapH + 40;
    let cur = 0;
    ctx.stageEl.querySelectorAll("section.step[data-step]").forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.top <= y) cur = +s.dataset.step;
    });
    return cur;
  }

  function wire() {
    const svg = ctx.svg.node();
    svg.addEventListener("pointerover", (e) => { const t = e.target.closest(".route-hit"); if (t && ctx.desk && e.pointerType === "mouse") showNote(t.dataset.id); });
    svg.addEventListener("pointerout", (e) => { if (e.target.closest(".route-hit") && ctx.desk) later(); });
    const press = (t) => {
      // a named route on a desktop runs its camera too (the same as its note's numeral), with its note pinned
      const nm = ctx.named.get(t.dataset.id);
      if (nm && ctx.desk && (!ctx.state || ctx.state.cam !== nm.target)) zoomTo(nm.n);
      ctx.pinned = true; showNote(t.dataset.id);
    };
    svg.addEventListener("click", (e) => {
      const t = e.target.closest(".route-hit");
      if (t) { press(t); return; }
      if (ctx.desk ? (ctx.state.active || ctx.state.cam) : !noteEl().hidden) reset();
    });
    // R35 M6: a hit stroke is a role=button, so Enter and Space press it as a click does
    svg.addEventListener("keydown", (e) => {
      const t = e.target.closest(".route-hit");
      if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); press(t); }
    });
    svg.addEventListener("focusin", (e) => { const t = e.target.closest(".route-hit"); if (t) showNote(t.dataset.id); });
    svg.addEventListener("focusout", (e) => {
      if (!e.target.closest(".route-hit")) return;
      const to = e.relatedTarget;
      if (to && (to.closest(".stage-note") || to.closest(".route-hit"))) return;
      if (!ctx.pinned) clearNote();
    });
    if (wired) return;
    wired = true;
    const stage = ctx.stageEl, note = stage.querySelector(".stage-note");
    note.addEventListener("pointerenter", () => clearTimeout(ctx.timer));
    note.addEventListener("pointerleave", () => { if (ctx.desk) later(); });
    // a named note's numeral and name: the same camera as the phone step (desktop)
    // R30 (page 4, stage.link_note): the link also pins its place's note, which lists what a short pocket leaves out
    stage.querySelectorAll(".pockets .named-link").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation(); e.preventDefault();
      const n = +b.dataset.n;
      if (ctx.state && ctx.state.cam === camOf(n)) { reset(); return; }
      zoomTo(n);
      const id = ctx.data.stage.link_note && ctx.desk && ((ctx.byN.get(n) || {}).items || [])[0];
      if (id) { ctx.pinned = true; showNote(id); }
    }));
    // a prose pointer is a link with role=button: Space presses it too (Enter already clicks a link); in a phone card
    // it only names the place (the step frames it), so it does not change the address bar (review M5)
    stage.querySelectorAll("a.named-link").forEach((a) => {
      a.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); a.click(); } });
      if (a.closest(".card")) a.addEventListener("click", (e) => e.preventDefault());
    });
    document.addEventListener("click", (e) => {
      if (!ctx || !ctx.desk || !ctx.state || !ctx.state.cam) return;
      if (e.target.closest(".named-link") || e.target.closest("svg.hero-map") || e.target.closest(".reading")) return;
      reset();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !ctx) return;
      const rd = stage.querySelector(".reading.open");
      if (rd) { closeReading(); return; }
      if (ctx.state && (ctx.state.cam && ctx.desk || ctx.state.active || !noteEl().hidden)) reset();
    });
    // the read affordance: deck + body, in a free pocket when one holds it, else a panel at the stage's edge (desktop);
    // on a phone a sheet over the page until closed
    const reading = stage.querySelector(".reading");
    let opener = null;
    const openReading = (btn) => {
      opener = btn;
      reading.classList.add("open");
      stage.querySelectorAll("button.read-toggle").forEach((t) => t.setAttribute("aria-expanded", "true"));
      reading.style.cssText = "";
      if (ctx.desk) {
        let spot = null;
        for (const p of ctx.placed.free) {
          const wd = Math.min(420, p[2] - p[0]);
          reading.style.width = wd + "px";
          if (reading.scrollHeight <= p[3] - p[1]) { spot = [p[0], p[1], p[0] + wd, p[3]]; break; }
        }
        if (!spot) {   // no pocket holds the text: a panel down the stage's right edge, over the map, until closed
          const wd = Math.min(420, ctx.w - 24);
          spot = [ctx.w - 12 - wd, 12, ctx.w - 12, ctx.mapH - 12];
        }
        Object.assign(reading.style, { left: spot[0] + "px", top: spot[1] + "px", width: spot[2] - spot[0] + "px",
          maxHeight: spot[3] - spot[1] + "px" });
      }
      reading.querySelector(".read-close").focus();
    };
    const closeReading = () => {
      reading.classList.remove("open");
      stage.querySelectorAll("button.read-toggle").forEach((t) => t.setAttribute("aria-expanded", "false"));
      if (opener) opener.focus();
    };
    stage.querySelectorAll("button.read-toggle").forEach((t) => t.addEventListener("click",
      () => (reading.classList.contains("open") ? closeReading() : openReading(t))));
    stage.querySelector(".read-close").addEventListener("click", closeReading);
    // phone: the steps, natively scrolled; a passive listener reads which step sits under the map (nothing prevented)
    let raf = 0;
    const onScroll = () => { if (ctx && !ctx.desk) setStep(stepAtLine()); };
    window.addEventListener("scroll", () => { onScroll(); cancelAnimationFrame(raf); raf = requestAnimationFrame(onScroll); }, { passive: true });
  }
})();
