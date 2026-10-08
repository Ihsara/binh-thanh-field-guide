/* Bình Thạnh atlas — hero renderers and the dispatch that picks one.
   Every renderer has the signature (fig, data, base) => void: it creates its
   own <svg> inside fig (Atlas.frame), sizes it from fig.clientWidth, draws the
   shared base (Atlas.drawBase) and the furniture (Atlas.furniture), and is
   redrawn on resize by the dispatch. Task 4 ships `dots`; Task 5 adds compare,
   glyphs, zoom, territories and units. */
(function () {
  "use strict";
  const A = (window.Atlas = window.Atlas || {});
  A.heroes = A.heroes || {};

  const FALLBACK = "This map needs JavaScript. The big number and the text tell the same story.";

  /** Replace fig's drawing with a fresh svg sized to the figure. On a phone
      the key gets its own band above the map (`top` px) so it never sits on
      the district; renderers draw the map into `map`, mh px tall. */
  A.frame = function (fig) {
    d3.select(fig).selectAll("svg.hero-map").remove();
    const w = Math.max(240, Math.floor(fig.clientWidth));
    const h = Math.max(240, Math.floor(fig.clientHeight || w * 0.92));
    const svg = d3.select(fig).append("svg")
      .attr("class", "hero-map")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width", w).attr("height", h)
      .attr("role", "img");
    const compact = w < 560;
    const top = compact ? 44 : 0;
    const map = svg.append("g").attr("class", "map").attr("transform", `translate(0,${top})`);
    return { svg, map, w, h, mh: h - top, top, compact };
  };

  /** Locator (bottom right), 500 m scale (bottom left), north (top right).
      opts.northY moves the north arrow; a renderer with a key band above the
      map passes a negative y so the arrow sits in the band, clear of the
      district (on a phone the Bình Quới lobe reaches the top-right corner). */
  A.furniture = function (svg, base, proj, w, h, opts) {
    const o = opts || {};
    const size = w < 560 ? 44 : 64;
    A.locator(svg, base, w - size - 22, h - size - 22, size, o.mark);
    A.scaleBar(svg, proj, 16, h - 18, o.metres);
    A.north(svg, w - 22, o.northY == null ? 26 : o.northY);
  };

  /** A key, one row per item: {label, fill, keyR, opacity}. Drawn at (x, y).
      An item with `line` (a stroke width) gets a short line swatch; one with
      `square` (a side) gets a square; `ring` gives a dot a paper-coloured rim. */
  A.key = function (svg, items, x, y) {
    const g = svg.append("g").attr("class", "key").attr("transform", `translate(${x},${y})`);
    const row = g.selectAll("g").data(items).join("g")
      .attr("transform", (_, i) => `translate(0,${i * 18})`);
    row.filter((d) => d.line).append("path").attr("d", "M0,0H11")
      .attr("stroke", (d) => d.fill).attr("stroke-width", (d) => d.line).attr("fill", "none");
    row.filter((d) => d.square).append("rect")
      .attr("x", (d) => 5 - d.square / 2).attr("y", (d) => -d.square / 2)
      .attr("width", (d) => d.square).attr("height", (d) => d.square)
      .attr("fill", (d) => d.fill).attr("fill-opacity", (d) => d.opacity == null ? 1 : d.opacity);
    row.filter((d) => !d.line && !d.square).append("circle").attr("cx", 5).attr("cy", 0)
      .attr("r", (d) => d.keyR || 4)
      .attr("stroke", (d) => d.ring ? "var(--ground)" : "none").attr("stroke-width", (d) => d.ring || 0)
      .attr("fill", (d) => d.fill).attr("fill-opacity", (d) => d.opacity == null ? 1 : d.opacity);
    row.append("text").attr("class", "key-label").attr("x", 16).attr("dy", "0.35em")
      .text((d) => d.label);
    return g;
  };

  function showFallback(fig) {
    if (fig.querySelector("p.noscript-fallback.live")) return;
    const p = document.createElement("p");
    p.className = "noscript-fallback live";
    p.textContent = FALLBACK;
    fig.appendChild(p);
  }

  /* ---- dots: one dot per place; the chapter's subject in the chapter hue ---- */
  A.heroes.dots = function (fig, data, base) {
    const { svg, map, w, mh, top, compact } = A.frame(fig);
    const proj = A.projection(base.bounds, w, mh);
    // the plan's radii (1 / 1.4) are phone-sized; a wide map scales them up a little
    const grow = Math.max(1, Math.min(1.6, w / 600));
    const layer = (key) => (data.layers.find((l) => l.key === key) || { points: [], label: key });
    const other = layer("other");
    const coffee = layer("coffee");
    svg.attr("aria-label", `Map of Bình Thạnh: ${coffee.label} against ${other.label.toLowerCase()}`);

    A.drawBase(map, base, proj);
    const xy = (p) => proj(p);

    map.append("g").attr("class", "dots-other")
      .attr("fill", "var(--ink-soft)").attr("fill-opacity", 0.5)
      .selectAll("circle").data(other.points).join("circle")
      .attr("cx", (p) => xy(p)[0].toFixed(1)).attr("cy", (p) => xy(p)[1].toFixed(1)).attr("r", 1 * grow);

    // plain alpha, not multiply: overlapping cafés deepen toward the full chapter
    // hue and stop there. Multiply kept darkening every stack, and on a phone the
    // busiest streets went near-black (critique 2026-10-08).
    const r = 1.4 * grow;
    map.append("g").attr("class", "dots-coffee")
      .attr("fill", "var(--chapter-hue)").attr("fill-opacity", 0.6)
      .selectAll("circle").data(coffee.points).join("circle")
      .attr("cx", (p) => xy(p)[0].toFixed(1)).attr("cy", (p) => xy(p)[1].toFixed(1)).attr("r", r);

    map.select("g.base-labels").raise();
    A.key(svg, [
      { label: coffee.label, fill: "var(--chapter-hue)", keyR: 4 },
      { label: other.label, fill: "var(--ink-soft)", opacity: 0.6, keyR: 3 },
    ], 14, compact ? 12 : 22);
    A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26 });
  };

  /* ---- shared bits for Task 5's renderers ---- */
  const fmt = (n) => d3.format(",")(n);

  /** Height / width of a [w, s, e, n] box on the atlas projection. */
  function boxRatio(b) {
    const p = A.projection(b, 1000, 1000);
    const a = p([b[0], b[3]]), c = p([b[2], b[1]]);
    return (c[1] - a[1]) / (c[0] - a[0]);
  }

  /** Clip a group to its own w × h box, so a zoomed map stays inside the frame. */
  function clipTo(svg, g, id, w, h) {
    svg.append("defs").append("clipPath").attr("id", id)
      .append("rect").attr("width", w).attr("height", h);
    g.attr("clip-path", `url(#${id})`);
  }

  /* ---- compare: two small maps on ONE projection, one label each ---- */

  /** Per 2-px column, the lowest (bottom) and highest (top) y of the district
      outline drawn by proj: the shape's silhouette, used to stagger two panels. */
  function silhouette(base, proj, w) {
    const cols = Math.ceil(w / 2) + 1;
    const lo = new Array(cols).fill(-Infinity), hi = new Array(cols).fill(Infinity);
    const polys = base.outline.type === "Polygon" ? [base.outline.coordinates] : base.outline.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => {
      for (let i = 1; i < ring.length; i++) {
        const a = proj(ring[i - 1]), b = proj(ring[i]);
        const steps = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 2));
        for (let k = 0; k <= steps; k++) {
          const x = a[0] + (b[0] - a[0]) * k / steps, y = a[1] + (b[1] - a[1]) * k / steps;
          const c = Math.max(0, Math.min(cols - 1, Math.round(x / 2)));
          if (y > lo[c]) lo[c] = y;
          if (y < hi[c]) hi[c] = y;
        }
      }
    }));
    return { lo, hi };
  }

  A.heroes.compare = function (fig, data, base) {
    const { svg, w, h, compact } = A.frame(fig);
    const sets = [data.left, data.right];
    const name = (s) => String(s.label).replace(/_/g, " ");
    svg.attr("aria-label", `Two maps of Bình Thạnh: places labelled ${name(data.left)} and places labelled ${name(data.right)}`);

    const ratio = boxRatio(base.bounds);
    const stacked = compact;                       // a phone puts one map above the other
    const gap = stacked ? 10 : 20, titleH = 26;
    const band = (compact ? 44 : 64) + 30;         // locator + scale under the maps
    const keyH = compact ? 34 : 46;
    const inset = stacked ? 0 : 16;                 // keeps the Bình Quới lobe off the right edge
    let pw = stacked ? w : Math.floor((w - gap - inset) / 2);
    const room = stacked ? (h - keyH - band - gap) / 2 - titleH : h - keyH - band - titleH;
    let ph = Math.max(80, Math.floor(Math.min((pw - 16) * ratio + 16, room)));
    let blockH = stacked ? 2 * (titleH + ph) + gap + band : titleH + ph + band;
    // top-aligned on a spread (the furniture follows the maps); centred in a phone's tall frame
    const y0 = stacked ? Math.max(0, Math.floor((h - keyH - blockH) / 2)) : 4;
    let at = (i) => (stacked ? [0, i * (titleH + ph + gap)] : [i * (pw + gap), 0]);

    // On a spread, side-by-side panels are bound by the width and leave the
    // hero's lower half empty. The district's lobe leaves each panel's lower
    // right empty too, so stagger them on the diagonal and grow both until the
    // outlines come within `clear` px (2026-10-08 critique: the panels ranked
    // third for a cold reader).
    let staggered = false;
    const loc = 64;
    if (!stacked) {
      const avail = h - y0 - keyH - 6, clear = 14, titleW = 230;
      for (let P = Math.floor((w - inset) * 0.8); P > pw; P -= 8) {
        const H = Math.floor((P - 16) * ratio + 16);
        const sil = silhouette(base, A.projection(base.bounds, P, H), P);
        const dx = w - inset - P;
        let dy = 0;
        for (let c = 0; c < sil.hi.length; c++) {   // right panel column c sits at left column c + dx/2
          const top = c * 2 < titleW ? -titleH : sil.hi[c];   // its title is part of its silhouette
          if (!isFinite(top)) continue;
          const lc = Math.round(c + dx / 2), m = Math.ceil(clear / 2);
          for (let j = lc - m; j <= lc + m; j++) {
            if (j >= 0 && j < sil.lo.length && isFinite(sil.lo[j])) dy = Math.max(dy, sil.lo[j] - top + clear);
          }
        }
        const fitsRight = dy + titleH + H <= avail;
        const fitsFurniture = titleH + H + loc + 24 <= avail;   // locator + scale under the first panel
        if (fitsRight && fitsFurniture) {
          pw = P; ph = H; blockH = avail; staggered = true;
          at = (i) => (i === 0 ? [0, 0] : [dx, Math.ceil(dy)]);
          break;
        }
      }
    }

    // ONE projection, reused by both panels, so a block is the same size on each
    const proj = A.projection(base.bounds, pw, ph);
    const r = 1.3 * Math.max(1, Math.min(1.4, pw / 450));

    A.key(svg, [{ label: "One place, as Overture labels it", fill: "var(--chapter-hue)", keyR: 3.5, opacity: 0.85 }],
      14, y0 + (compact ? 14 : 20));
    const blk = svg.append("g").attr("class", "compare").attr("transform", `translate(0,${y0 + keyH})`);

    sets.forEach((set, i) => {
      const [x, y] = at(i);
      const panel = blk.append("g").attr("class", "panel").attr("transform", `translate(${x},${y})`);
      const t = panel.append("text").attr("class", "panel-title").attr("x", 10).attr("y", 17);
      t.append("tspan").text(`Labelled “${name(set)}”`);
      t.append("tspan").attr("class", "panel-count").attr("dx", 8).text(fmt(set.points.length));
      const m = panel.append("g").attr("transform", `translate(0,${titleH})`);
      A.drawBase(m, base, proj);
      m.append("g").attr("class", "dots-subject")
        .attr("fill", "var(--chapter-hue)").attr("fill-opacity", 0.6)   // alpha, as on map 1
        .selectAll("circle").data(set.points).join("circle")
        .attr("cx", (p) => proj(p)[0].toFixed(1)).attr("cy", (p) => proj(p)[1].toFixed(1)).attr("r", r);
      m.select("g.base-labels").raise();
    });
    if (staggered) {                               // the free corner is bottom left, under the first panel
      A.locator(blk, base, 16, blockH - loc - 18, loc);   // its caption sits 11 px under the box
      A.scaleBar(blk, proj, 16 + loc + 22, blockH - 22);
      A.north(blk, w - inset - 22, 12);
    } else {
      A.furniture(blk, base, proj, w - inset, blockH, { northY: 12 });
    }
  };

  /* ---- glyphs: one dish glyph per ward, area ∝ places serving it ---- */
  // Drawn here (24-unit box, centred), not taken from web/icons: that sprite
  // has no bún or cơm. Bún: a bowl with noodles lifted on chopsticks.
  // Cơm: a mound of rice on a plate.
  const DISH = {
    bun: ["M-8,-1H8", "M-7,-1C-7,5 -3.5,7.5 0,7.5S7,5 7,-1",
          "M-3.5,-1C-3.5,-4 -2,-5 -2.5,-8", "M0,-1C0,-4 1.5,-5 1,-8", "M3.5,-1C3.5,-4 5,-5 4.5,-8",
          "M-5,-8.5L8,-6"],
    com: ["M-9,4.5C-9,6.5 9,6.5 9,4.5S-9,2.5 -9,4.5", "M-6,4C-6,-4 6,-4 6,4",
          "M-2,-1.5h0.1M1.5,0h0.1M-0.5,2h0.1M3,2.5h0.1M-3.5,2h0.1"],
  };

  A.heroes.glyphs = function (fig, data, base) {
    const { svg, map, w, mh, top, compact } = A.frame(fig);
    const proj = A.projection(base.bounds, w, mh);
    svg.attr("aria-label", "Map of Bình Thạnh: the leading dish in each ward");
    const { labels } = A.drawBase(map, base, proj);

    const rMax = Math.max(22, Math.min(40, w / 22));
    const nMax = d3.max(data.wards, (d) => d.n);
    const rOf = (n) => Math.sqrt(n / nMax) * rMax;   // AREA ∝ n, not radius
    const hue = (d) => (d.dish_key === "bun" ? "var(--chapter-hue)" : "var(--ink-soft)");
    const at = (d) => proj(d.centroid);

    const g = map.append("g").attr("class", "glyphs");
    const one = g.selectAll("g").data(data.wards).join("g")
      .attr("class", "glyph")
      .attr("transform", (d) => { const c = at(d); return `translate(${c[0].toFixed(1)},${c[1].toFixed(1)})`; });
    one.append("circle").attr("r", (d) => rOf(d.n)).attr("fill", hue)
      .attr("stroke", "var(--ground)").attr("stroke-width", 1.5);
    // a disc too small to hold its dish carries the glyph just above it, in the dish's hue
    const small = (d) => rOf(d.n) < 12;
    one.filter((d) => DISH[d.dish_key]).append("g")
      .attr("transform", (d) => small(d)
        ? `translate(0,${(-rOf(d.n) - 11).toFixed(1)}) scale(${(10 * 0.68 / 9).toFixed(3)})`
        : `scale(${(rOf(d.n) * 0.68 / 9).toFixed(3)})`)
      .attr("stroke", (d) => (small(d) ? hue(d) : "var(--ground)"))
      .selectAll("path").data((d) => DISH[d.dish_key]).join("path")
      .attr("d", (p) => p).attr("fill", "none")
      .attr("stroke-width", 1.4).attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
      .attr("vector-effect", "non-scaling-stroke");
    // each two-line label goes under its glyph, or above it, whichever lands on no
    // other disc and no label already placed (biggest wards place first)
    const lift = (d) => (small(d) ? 22 : 0);          // a small disc's dish glyph sits above it
    const boxFor = (d, up) => {
      const c = at(d), r = rOf(d.n);
      return up ? [c[0] - 55, c[1] - r - lift(d) - 32, c[0] + 55, c[1] - r - lift(d) - 2]
                : [c[0] - 55, c[1] + r + 2, c[0] + 55, c[1] + r + 32];
    };
    const hitsDisc = (box, d) => data.wards.some((o) => {
      if (o === d) return false;
      const oc = at(o), orr = rOf(o.n) + lift(o);
      const nx = Math.max(box[0], Math.min(oc[0], box[2])), ny = Math.max(box[1], Math.min(oc[1], box[3]));
      return Math.hypot(oc[0] - nx, oc[1] - ny) < orr + 2;
    });
    const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const placed = [], above = new Map();
    [...data.wards].sort((a, b) => b.n - a.n).forEach((d) => {
      const ok = (up) => { const b = boxFor(d, up); return !hitsDisc(b, d) && !placed.some((q) => overlaps(b, q)); };
      const up = !ok(false) && ok(true);
      above.set(d.name, up);
      placed.push(boxFor(d, up));
    });
    const dishY = (d) => (above.get(d.name) ? -rOf(d.n) - lift(d) - 20 : rOf(d.n) + 14);
    const wardY = (d) => (above.get(d.name) ? -rOf(d.n) - lift(d) - 7 : rOf(d.n) + 27);
    one.append("text").attr("class", "glyph-label").attr("text-anchor", "middle")
      .attr("y", dishY).attr("fill", hue)
      .text((d) => `${d.dish_label} · ${d.n}`);

    // ward names move under their glyph, so a label never sits on the dish
    const byName = new Map(data.wards.map((d) => [d.name, d]));
    labels.selectAll("text.ward-label")
      .attr("transform", function (wd) {
        const d = byName.get(wd.name);
        if (!d) return this.getAttribute("transform");   // no glyph: keep drawBase's centroid
        const c = at(d);
        return `translate(${c[0].toFixed(1)},${(c[1] + wardY(d)).toFixed(1)})`;
      });
    labels.raise();

    A.key(svg, [
      { label: "Bún leads", fill: "var(--chapter-hue)", keyR: 5 },
      { label: "Another dish leads", fill: "var(--ink-soft)", keyR: 5 },
    ], 14, compact ? 12 : 22);
    const note = compact ? ["Circle area: places", "serving that dish"] : ["Circle area: places serving that dish"];
    const nx = compact ? Math.round(w * 0.4) : 14, ny = compact ? 12 : 22 + 2 * 18 + 4;
    note.forEach((line, i) => svg.append("text").attr("class", "key-label key-note")
      .attr("x", nx).attr("y", ny + i * 18).attr("dy", "0.35em").text(line));
    A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26 });
  };

  /* ---- zoom: one hub's box, fitted to the frame, with the box marked on the locator ---- */
  A.heroes.zoom = function (fig, data, base) {
    const { svg, map, w, mh, top, compact } = A.frame(fig);
    // Keep the furniture off the dashed box (2026-10-08 critique: the locator sat
    // on it on a phone, the scale bar on its edge on a spread). On a spread the
    // key gets a band above the box; then the box moves to the left edge and
    // the locator and scale bar take the column beside it.
    const keyPad = compact ? 0 : 74, loc = compact ? 44 : 64;
    const proj = A.projection(data.bbox, w, mh - keyPad);
    const c0 = proj([data.bbox[0], data.bbox[3]]), c1 = proj([data.bbox[2], data.bbox[1]]);
    const side = w - (c1[0] - c0[0]) - 12 >= loc + 34;   // room for a furniture column
    const t0 = proj.translate();
    proj.translate([t0[0] + (side ? 12 - c0[0] : 0), t0[1] + keyPad]);
    const grow = Math.max(1, Math.min(1.6, w / 600));
    const layer = (key) => (data.layers.find((l) => l.key === key) || { points: [] });
    const jp = layer("japanese"), coffee = layer("coffee");
    svg.attr("aria-label", "Close-up map of Bình Thạnh's canal edge, facing Đa Kao: Japanese places and cafés listed in the box");

    const inner = map.append("g").attr("class", "zoomed");
    clipTo(svg, inner, "zoom-clip", w, mh);
    A.drawBase(inner, base, proj);

    // the district's southern edge here is the Thị Nghè canal: name it on the far bank
    const ring = base.outline.type === "Polygon" ? base.outline.coordinates[0]
      : base.outline.coordinates.flatMap((poly) => poly[0]);
    const [cx, cy] = [(data.bbox[0] + data.bbox[2]) / 2, (data.bbox[1] + data.bbox[3]) / 2];
    let best = -1, bestD = Infinity;
    ring.forEach((p, i) => {
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best > 2 && best < ring.length - 3) {
      const a = proj(ring[best - 3]), b = proj(ring[best + 3]), m = proj(ring[best]);
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      const off = 14 * grow;
      const probe = proj.invert([m[0] + nx * off, m[1] + ny * off]);
      if (probe && d3.geoContains(base.outline, probe)) { nx = -nx; ny = -ny; }  // put it OFF the district
      inner.append("text").attr("class", "water-label").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("transform", `translate(${(m[0] + nx * off).toFixed(1)},${(m[1] + ny * off).toFixed(1)}) rotate(${ang.toFixed(1)})`)
        .text("Thị Nghè canal");
    }

    // the box the counts come from: points stop at its edge, so show the edge
    const b0 = proj([data.bbox[0], data.bbox[3]]), b1 = proj([data.bbox[2], data.bbox[1]]);
    inner.append("rect").attr("class", "zoom-box")
      .attr("x", b0[0].toFixed(1)).attr("y", b0[1].toFixed(1))
      .attr("width", (b1[0] - b0[0]).toFixed(1)).attr("height", (b1[1] - b0[1]).toFixed(1))
      .attr("fill", "none").attr("stroke", "var(--ink-soft)").attr("stroke-width", 0.8)
      .attr("stroke-dasharray", "4 3");

    const xy = (p) => proj(p);
    inner.append("g").attr("class", "dots-coffee")
      .attr("fill", "var(--ink-soft)").attr("fill-opacity", 0.6)
      .selectAll("circle").data(coffee.points).join("circle")
      .attr("cx", (p) => xy(p)[0].toFixed(1)).attr("cy", (p) => xy(p)[1].toFixed(1)).attr("r", 2.6 * grow);
    inner.append("g").attr("class", "dots-japanese")
      .attr("fill", "var(--chapter-hue)").attr("fill-opacity", 0.85)
      .selectAll("circle").data(jp.points).join("circle")
      .style("mix-blend-mode", "multiply")
      .attr("cx", (p) => xy(p)[0].toFixed(1)).attr("cy", (p) => xy(p)[1].toFixed(1)).attr("r", 3.2 * grow);
    inner.select("g.base-labels").raise();

    A.key(svg, [
      { label: "Japanese place", fill: "var(--chapter-hue)", keyR: 4.5 },
      { label: "Café", fill: "var(--ink-soft)", opacity: 0.7, keyR: 3.8 },
    ], 14, compact ? 12 : 22);
    const zn = compact ? ["Dashed box:", "the area counted"] : ["Dashed box: the area counted"];
    zn.forEach((line, i) => svg.append("text").attr("class", "key-label key-note")
      .attr("x", compact ? Math.round(w * 0.4) : 14).attr("y", (compact ? 12 : 22 + 2 * 18 + 4) + i * 18)
      .attr("dy", "0.35em").text(line));
    if (side) {
      const colX = Math.round(proj([data.bbox[2], data.bbox[1]])[0]) + 18;
      A.locator(map, base, colX, mh - loc - 24, loc, data.bbox);
      const sb = A.scaleBar(map, proj, colX, mh - loc - 40, 100);
      const sw = sb.node().getBBox().width;        // a phone's column is narrow: keep "100 m" inside the frame
      if (colX + sw > w - 6) sb.attr("transform", `translate(${(w - 6 - sw).toFixed(1)},${mh - loc - 40})`);
      A.north(svg, w - 22, compact ? 18 : 26);
    } else {
      A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26, mark: data.bbox, metres: 100 });
    }
  };

  /* ---- territories: every street coloured by how far the nearest chain is ---- */
  A.heroes.territories = function (fig, data, base) {
    const { svg, map, w, mh, top, compact } = A.frame(fig);
    const proj = A.projection(base.bounds, w, mh);
    const path = d3.geoPath(proj);
    const grow = Math.max(1, Math.min(1.6, w / 600));
    svg.attr("aria-label", "Map of Bình Thạnh's streets, coloured by the walk to the nearest chain outlet");
    A.drawBase(map, base, proj);

    const STYLE = {
      within: { stroke: "var(--chapter-hue-soft)", width: 1.1 },
      contested: { stroke: "var(--chapter-hue)", width: 1.1 },
      beyond: { stroke: "var(--ink)", width: 1.5 },
    };
    const g = map.append("g").attr("class", "territories").attr("fill", "none")
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    ["within", "contested", "beyond"].forEach((k) => {
      const lines = data.edges.filter((e) => e.k === k).map((e) => e.c);
      g.append("path").attr("class", `edges-${k}`)
        .attr("d", path({ type: "MultiLineString", coordinates: lines }))
        .attr("stroke", STYLE[k].stroke).attr("stroke-width", STYLE[k].width * grow);
    });
    map.append("g").attr("class", "outlets")
      .attr("fill", "var(--ink)").attr("stroke", "var(--ground)").attr("stroke-width", 0.9)
      .selectAll("circle").data(data.outlets).join("circle")
      .attr("cx", (p) => proj(p)[0].toFixed(1)).attr("cy", (p) => proj(p)[1].toFixed(1)).attr("r", 1.9 * grow);
    map.select("g.base-labels").raise();

    const items = [
      { label: "Within a kilometre’s walk", fill: STYLE.within.stroke, line: 3 },
      { label: "Frontier of two brands", fill: STYLE.contested.stroke, line: 3 },
      { label: "Beyond a kilometre’s walk", fill: STYLE.beyond.stroke, line: 3 },
      { label: "Chain outlet", fill: "var(--ink)", keyR: 3, ring: 0.9 },
    ];
    if (compact) {                                  // two columns fit the phone's key band
      A.key(svg, items.slice(0, 2), 14, 12);
      A.key(svg, items.slice(2), Math.round(Math.min(190, w * 0.46)), 12);
    } else {
      A.key(svg, items, 14, 22);
    }
    A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26 });
  };

  /* ---- units: no map — one square per café, two blocks that wrap to the width.
     The free map has no café points worth drawing, so this page counts instead.
     No locator: it says where a map is, and this page has no map (user, 2026-10-08). ---- */
  A.heroes.units = function (fig, data, base) {
    const { svg, w, h, compact } = A.frame(fig);
    const sets = data.units;
    svg.attr("aria-label", sets.map((s) => `${s.label}: ${fmt(s.n)} cafés`).join("; "));
    const fills = ["var(--chapter-hue)", "var(--ink-soft)"];
    const opac = [1, 0.55];

    A.key(svg, [{ label: "One square is one listing", fill: "var(--chapter-hue)", square: 8 }], 14, compact ? 18 : 26);

    const pad = 14, titleH = compact ? 24 : 30, gapB = compact ? 14 : 22;
    const y0 = compact ? 40 : 52;
    const room = h - y0 - 14 - sets.length * titleH - (sets.length - 1) * gapB;
    const usable = w - 2 * pad;
    let cell = 2;
    for (let c = compact ? 12 : 16; c >= 2; c -= 0.5) {
      const cols = Math.floor(usable / c);
      const rows = d3.sum(sets, (s) => Math.ceil(s.n / cols));
      if (rows * c <= room) { cell = c; break; }
    }
    const cols = Math.floor(usable / cell);
    const sq = Math.max(1, cell - Math.max(1, cell * 0.2));

    let y = y0;
    sets.forEach((s, i) => {
      const t = svg.append("text").attr("class", "panel-title").attr("x", pad).attr("y", y + titleH - 9);
      t.append("tspan").text(s.label);
      t.append("tspan").attr("class", i === 0 ? "panel-count" : "panel-count-soft").attr("dx", 8).text(fmt(s.n));
      y += titleH;
      const idx = d3.range(s.n);
      svg.append("g").attr("class", `units units-${i}`)
        .attr("fill", fills[i % 2]).attr("fill-opacity", opac[i % 2])
        .selectAll("rect").data(idx).join("rect")
        .attr("x", (k) => (pad + (k % cols) * cell).toFixed(1))
        .attr("y", (k) => (y + Math.floor(k / cols) * cell).toFixed(1))
        .attr("width", sq.toFixed(1)).attr("height", sq.toFixed(1));
      y += Math.ceil(s.n / cols) * cell + gapB;
    });
  };

  /* ---- dispatch: load the page's data + the shared base, draw, redraw on resize ---- */
  A.render = function (fig) {
    const kind = document.body.dataset.hero;
    const draw = A.heroes[kind];
    if (typeof draw !== "function") {
      console.warn(`atlas: no hero renderer for "${kind}" — showing the text fallback`);
      showFallback(fig);
      return Promise.resolve(null);
    }
    return Promise.all([d3.json(fig.dataset.src), d3.json(fig.dataset.base)]).then(([data, base]) => {
      let lastW = -1, lastH = -1, raf = 0;
      const redraw = () => {
        const cw = Math.floor(fig.clientWidth), ch = Math.floor(fig.clientHeight);
        if (cw === lastW && ch === lastH) return;
        lastW = cw; lastH = ch;
        draw(fig, data, base);
      };
      redraw();
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(redraw); }).observe(fig);
      }
      return { data, base };
    }).catch((err) => {
      console.warn("atlas: hero data failed to load", err);
      showFallback(fig);
      return null;
    });
  };

  function start() {
    const fig = document.getElementById("hero");
    if (fig) A.render(fig);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
