/* Bình Thạnh atlas — hero renderers and the dispatch that picks one.
   Every renderer has the signature (fig, data, base) => void: it creates its
   own <svg> inside fig (Atlas.frame), sizes it from fig.clientWidth, draws the
   shared base (Atlas.drawBase) and the furniture (Atlas.furniture), and is
   redrawn on resize by the dispatch. Chapter 1 (v2.2) draws `streets`, `pair` and
   `block`; chapter 2 draws `sheet`, `plate`, `route` and `wards`. The v2.0 renderers
   (dots, compare, glyphs, zoom, territories, units) left with their pages in v2.2. */
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

  /** Clip a group to its own w × h box, so a zoomed map stays inside the frame. */
  function clipTo(svg, g, id, w, h) {
    svg.append("defs").append("clipPath").attr("id", id)
      .append("rect").attr("width", w).attr("height", h);
    g.attr("clip-path", `url(#${id})`);
  }

  /* ================= chapter 2: What It Used to Be =================
     The old sheets are rasters in Web Mercator, placed by their 4326 corners
     through the SAME d3.geoMercator the other heroes use, stretched with
     preserveAspectRatio none (Mercator is linear in x and in y between the
     corners). Colour: --c1 is the subject colour of each story
 (the colour table in colours.py), only on the measured/registered layer. */
  const DATA = "../../atlas/data/";
  // the 1984 built-up trace: light enough that the sheet's own drawing reads through it (0.85 hid it);
  // the key swatch uses the same value. atlas.css .sheet-built carries it too.
  const BUILT_OPACITY = 0.6;

  /** Where the scan's paper stops: the fraction of the image width that is opaque on
      its middle rows. The 1984 crop runs past the sheet's east edge as alpha 0. */
  const edgeCache = new Map();
  function sheetEdge(url) {
    if (!edgeCache.has(url)) {
      edgeCache.set(url, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);
            let edge = 0;
            [0.35, 0.5, 0.65].forEach((f) => {
              const row = ctx.getImageData(0, Math.floor(c.height * f), c.width, 1).data;
              for (let x = c.width - 1; x >= 0; x--) { if (row[x * 4 + 3] > 0) { edge = Math.max(edge, x + 1); break; } }
            });
            resolve(edge / c.width);
          } catch (e) { console.warn("atlas: could not read the sheet's edge", e); resolve(1); }
        };
        img.onerror = () => { console.warn("atlas: could not load the sheet to find its edge", url); resolve(1); };
        img.src = url;
      }));
    }
    return edgeCache.get(url);
  }

  /** The district outline over a scan: a paper underlay, then the ink line. */
  function districtOutline(g, path, base) {
    const d = path(base.outline);
    g.append("path").attr("class", "district-outline-halo").attr("d", d);
    g.append("path").attr("class", "district-outline").attr("d", d);
  }

  /** A paper card behind a drawn group, so type stays legible over a scan. */
  function card(g, pad) {
    const b = g.node().getBBox();
    if (!b.width) return;
    g.insert("rect", ":first-child").attr("class", "paper-card")
      .attr("x", (b.x - pad).toFixed(1)).attr("y", (b.y - pad).toFixed(1))
      .attr("width", (b.width + 2 * pad).toFixed(1)).attr("height", (b.height + 2 * pad).toFixed(1));
  }

  /** Lines of at most n characters, broken at spaces. */
  function wrap(text, n) {
    const out = [];
    let cur = "";
    String(text).split(" ").forEach((word) => {
      if (cur && (cur + " " + word).length > n) { out.push(cur); cur = word; } else cur = cur ? cur + " " + word : word;
    });
    if (cur) out.push(cur);
    return out;
  }

  /** Greedy line packing by rendered width: joins parts with a space while the line fits in maxW. */
  function packLines(svg, parts, cls, maxW) {
    const probe = svg.append("text").attr("class", cls).attr("visibility", "hidden");
    const fits = (t) => probe.text(t).node().getComputedTextLength() <= maxW;
    const out = [];
    parts.forEach((p) => {
      const last = out.length ? out[out.length - 1] + " " + p : null;
      if (last && fits(last)) out[out.length - 1] = last; else out.push(p);
    });
    probe.remove();
    return out;
  }

  /** The key, drawn in two columns on a phone's band, one column on a spread; carded. */
  function sheetKey(svg, items, w, compact) {
    if (compact) {
      if (items.length > 4) items = items.filter((d) => !d.ghost);   // the faint streets go first
      const half = Math.ceil(items.length / 2);
      A.key(svg, items.slice(0, half), 14, 12);
      if (items.length > half) A.key(svg, items.slice(half), Math.round(w * 0.5), 12);
      return;
    }
    card(A.key(svg, items, 14, 22), 8);
  }
  function edgeSwatches(svg) {
    svg.selectAll("g.key rect").filter(function () { return this.getAttribute("fill") === "url(#beyond-hatch-key)"; })
      .attr("stroke", "var(--ink-soft)").attr("stroke-width", 0.6);
  }

  /** The sheet's accuracy label, bottom left above the scale bar, on paper. */
  function accuracyNote(map, text, mh, compact) {
    const g = map.append("g").attr("class", "accuracy-note");
    if (!text) return;
    const lines = compact ? wrap(text, 30) : [text];
    lines.forEach((t, i) => g.append("text").attr("class", "key-label key-note")
      .attr("x", 16).attr("y", mh - 44 - (lines.length - 1 - i) * 15).text(t));
    card(g, 5);
  }

  /* ---- sheet: the registered 1984 sheet, knocked back, under today's lines ---- */
  A.heroes.sheet = function (fig, data, base) {
    const { svg, map, w, mh, top, compact } = A.frame(fig);
    const focus = data.focus;
    // a focus box is fitted like the zoom hero's: on a spread the key gets a band above it
    const keyPad = focus && !compact ? 74 : 0;
    const proj = A.projection(focus || base.bounds, w, mh - keyPad);
    if (keyPad) { const t0 = proj.translate(); proj.translate([t0[0], t0[1] + keyPad]); }
    const path = d3.geoPath(proj);
    const [W, S, E, N] = data.sheet.bounds4326;
    const [x0, y0] = proj([W, N]), [x1, y1] = proj([E, S]);
    svg.attr("aria-label", data.aria || "The 1984 map sheet");

    const defs = svg.append("defs");
    const hatch = defs.append("pattern").attr("id", "beyond-hatch").attr("patternUnits", "userSpaceOnUse")
      .attr("width", 7).attr("height", 7).attr("patternTransform", "rotate(45)");
    hatch.append("rect").attr("width", 7).attr("height", 7).attr("fill", "var(--ground)");
    hatch.append("path").attr("d", "M0,0V7").attr("stroke", "var(--rule)").attr("stroke-width", 1.4);
    // the key's 10 px swatch needs a tighter, darker hatch to read as the same thing
    const kh = defs.append("pattern").attr("id", "beyond-hatch-key").attr("patternUnits", "userSpaceOnUse")
      .attr("width", 3.5).attr("height", 3.5).attr("patternTransform", "rotate(45)");
    kh.append("rect").attr("width", 3.5).attr("height", 3.5).attr("fill", "var(--ground)");
    kh.append("path").attr("d", "M0,0V3.5").attr("stroke", "var(--ink-soft)").attr("stroke-width", 0.9);
    defs.append("clipPath").attr("id", "sheet-clip").append("rect")
      .attr("y", keyPad).attr("width", w).attr("height", mh - keyPad);

    const g = map.append("g").attr("class", "sheet").attr("clip-path", "url(#sheet-clip)");
    // off-sheet ground shows as hatched paper, never as blank map
    g.append("rect").attr("class", "beyond").attr("width", w).attr("height", mh).attr("fill", "url(#beyond-hatch)");
    // plain paper under the sheet, so the hatch never shows through the knocked-back scan; it is
    // trimmed to the paper's east edge once that is known (the crop runs past it as alpha 0)
    const under = g.append("rect").attr("class", "sheet-under").attr("fill", "var(--ground)")
      .attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0);
    const place = (sel) => sel.attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0)
      .attr("preserveAspectRatio", "none");
    place(g.append("image").attr("href", DATA + data.sheet.img).attr("class", "sheet-scan"));
    if (data.mask) {
      // the built-up raster is only a shape: its alpha masks a rect filled with the token, so the
      // colour is --c1 and not whatever hue the PNG was baked in (then/crops.py HUE)
      const mk = defs.append("mask").attr("id", "built-mask").attr("maskUnits", "userSpaceOnUse")
        .attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0).style("mask-type", "alpha");
      place(mk.append("image").attr("href", DATA + data.mask.img));
      place(g.append("rect")).attr("class", "sheet-built").attr("mask", "url(#built-mask)");
    }
    if (data.ghost === "streets") {
      g.append("path").attr("class", "ghost-streets")
        .attr("d", path({ type: "MultiLineString", coordinates: base.streets }));
    }
    districtOutline(g, path, base);
    if (data.area) {
      const d = path(data.area);
      g.append("path").attr("class", "area-outline-halo").attr("d", d);
      g.append("path").attr("class", "area-outline").attr("d", d);
    }
    const labels = map.append("g").attr("class", "sheet-labels").attr("clip-path", "url(#sheet-clip)");
    if (data.footprint) {
      g.append("path").attr("class", "footprint").attr("d", path(data.footprint));
      const b = path.bounds(data.footprint), c = path.centroid(data.footprint);
      labels.append("text").attr("class", "marker-label")
        .attr("x", b[1][0] + 8).attr("y", c[1]).attr("dy", "0.35em")
        .text(data.label);
    }
    // the east edge of the paper: everything past it is "beyond this sheet"
    let beyondShown = false;
    const edge = sheetEdge(DATA + data.sheet.img).then((f) => {
      if (f >= 0.995 || !g.node().isConnected) return;
      const ex = x0 + (x1 - x0) * f;
      under.attr("width", Math.max(0, ex - x0));
      if (ex >= w - 4) return;
      beyondShown = true;
      g.append("path").attr("class", "sheet-edge").attr("d", `M${ex.toFixed(1)},${keyPad}V${mh}`);
      const cx = (ex + Math.min(w, x1)) / 2;
      labels.append("text").attr("class", "beyond-label").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("transform", `translate(${cx.toFixed(1)},${(keyPad + (mh - keyPad) * 0.42).toFixed(1)}) rotate(90)`)
        .text("Beyond this sheet");
    });

    if (data.area) {                                 // name the measured ward on the part the sheet holds
      const c = path.centroid(data.area);
      labels.append("text").attr("class", "area-label").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", Math.min(c[0], w - 70).toFixed(1)).attr("y", c[1].toFixed(1))
        .text(A.wardName("Phường Bình Quới"));
    }
    const items = [];
    if (data.mask) items.push({ label: compact ? "Built-up (printed red)" : "1984 built-up fill (printed red), traced", fill: "var(--c1)", square: 10, opacity: BUILT_OPACITY });
    if (data.footprint) items.push({ label: compact ? "Landmark 81, footprint" : "Landmark 81’s footprint, today", fill: "var(--c1)", square: 10, opacity: 0.85 });
    if (data.area) items.push({ label: compact ? "Bình Quới ward" : "Phường Bình Quới, today", fill: "var(--c1)", line: 2.4 });
    items.push({ label: compact ? "District today" : "The district today", fill: "var(--ink)", line: 1.6 });
    if (data.ghost === "streets") items.push({ label: compact ? "Streets today" : "Streets today (faint)", fill: "var(--ink-soft)", line: 0.8, ghost: true });
    const metres = focus ? 200 : 500;
    const furnish = () => {
      svg.selectAll("g.key").remove();
      const all = beyondShown ? items.concat([{ label: compact ? "Off the sheet" : "Beyond this sheet", fill: "url(#beyond-hatch-key)", square: 10 }]) : items;
      sheetKey(svg, all, w, compact);
      edgeSwatches(svg);
    };
    furnish();
    accuracyNote(map, data.sheet.label, mh, compact);
    const sb = A.scaleBar(map, proj, 16, mh - 18, metres);
    card(sb, 4);
    const loc = compact ? 44 : 64;
    A.locator(map, base, w - loc - 22, mh - loc - 22, loc, focus || null);
    A.north(svg, w - 22, compact ? 18 : (keyPad ? 26 : 26 + top));
    edge.then(() => { if (beyondShown && svg.node().isConnected) furnish(); });
  };

  /* ---- plate: an unregistered sheet, filling the hero as a picture, with a small sketch of the
     district. The crop is the raw sheet around the district (then/crops.py), not a registration:
     nothing is drawn on it. Caption and sketch sit on paper cards over the picture. ---- */
  A.heroes.plate = function (fig, data, base) {
    const { svg, w, h, compact } = A.frame(fig);
    const s = data.sheet;
    svg.attr("aria-label", `${s.label || "Old map"}: the old map as a picture, not laid on today's map`);
    const g = svg.append("g").attr("class", "plate");
    g.append("image").attr("href", DATA + s.img).attr("class", "plate-scan")
      .attr("width", w).attr("height", h).attr("preserveAspectRatio", "xMidYMid slice");
    g.append("rect").attr("class", "plate-frame").attr("x", 0.5).attr("y", 0.5).attr("width", w - 1).attr("height", h - 1);
    // caption, bottom left: the accuracy label, then the licence
    const cap = svg.append("g").attr("class", "plate-caption");
    const licence = s.licence ? wrap(s.licence, compact ? 44 : 64) : [];
    const lh = compact ? 16 : 19;
    const y0 = h - 14 - licence.length * lh;
    cap.append("text").attr("class", "plate-label").attr("x", 16).attr("y", y0 - 4).text(s.label || "");
    licence.forEach((t, i) => cap.append("text").attr("class", "key-label key-note plate-licence")
      .attr("x", 16).attr("y", y0 + 14 + i * lh).text(t));
    card(cap, 7);
    // the district sketch, top right: outline only, for its shape, not placed on the sheet
    const size = compact ? 52 : 84;
    const sk = svg.append("g").attr("class", "plate-sketch");
    const lg = A.locator(sk, base, w - size - 18, 16, size);
    lg.select("text").text(compact ? "Today" : "The district today");
    const note = compact ? [] : ["Its shape only:", "the sheet is not", "laid on it"];
    note.forEach((t, i) => sk.append("text").attr("class", "key-label key-note")
      .attr("x", w - size - 18).attr("y", 16 + size + 30 + i * 16).text(t));
    card(sk, 7);
    const sb = sk.node().getBBox();                 // the caption is wider than the box: keep the card inside
    if (sb.x + sb.width > w - 10) sk.attr("transform", `translate(${(w - 10 - sb.x - sb.width).toFixed(1)},0)`);
  };

  /* ---- route: today's streets, the old road's line on them, the 1815 sheet as an inset ---- */
  A.heroes.route = function (fig, data, base) {
    const { svg, map, w, mh: fullH, top, compact } = A.frame(fig);
    // the inset: a crop of the 1815 sheet around Cầu Sơn, where it marks the road leaving north.
    // On a wide frame it sits in the free corner under the Bình Quới lobe. Below 720 px that
    // corner is too small (the inset lands on the route), so it gets its own band under the map
    // instead, as wide as the column allows; the hero is taller there (atlas.css).
    // The crop is baked from the full-resolution scan (then/crops.py INSET1815_PLATE).
    const ins = data.inset, crop = ins.inset.size;  // w, h in the crop's own pixels
    const banded = compact || w < 720;
    const iw = banded ? Math.min(w - 32, 480) : 260, ih = iw * crop[1] / crop[0];
    const pitch = compact ? 15 : 18;
    // in a band the credit is packed into as few lines as the band holds (measured, not counted);
    // a phone gets the short credit
    const licCls = "key-label key-note plate-licence";
    const lic = !ins.licence ? [] : !banded ? wrap(ins.licence, 42)
      : compact ? packLines(svg, ["Public domain in the US ·", "Trần Văn Học (1815),", "photo: Bùi Thụy Đào Nguyên,", "via Wikimedia Commons"], licCls, iw)
      : packLines(svg, ins.licence.split(" "), licCls, iw);
    const band = banded ? Math.round(14 + ih + 20 + lic.length * pitch + 8) : 0;
    const mh = fullH - band;
    const proj = A.projection(base.bounds, w, mh);
    const path = d3.geoPath(proj);
    svg.attr("aria-label", "Map of Bình Thạnh: today's streets on the line historians trace for the 1748 Mandarin Road");
    A.drawBase(map, base, proj);
    const r = data.route;
    const line = path({ type: "LineString", coordinates: r });
    map.append("path").attr("class", "route-halo").attr("d", line);
    map.append("path").attr("class", "route-line").attr("d", line);
    map.select("g.base-labels").raise();
    // the two ends the text names
    const ends = [
      { p: proj(r[0]), label: "Thị Nghè bridge", dx: 10, dy: 6, anchor: "start" },
      { p: proj(r[r.length - 1]), label: "Bình Quới ferry", dx: -10, dy: -10, anchor: "end" },
    ];
    const eg = map.append("g").attr("class", "route-ends");
    eg.selectAll("circle").data(ends).join("circle").attr("class", "route-end")
      .attr("cx", (d) => d.p[0].toFixed(1)).attr("cy", (d) => d.p[1].toFixed(1)).attr("r", compact ? 3.5 : 4.5);
    eg.selectAll("text").data(ends).join("text").attr("class", "route-label")
      .attr("text-anchor", (d) => d.anchor)
      .attr("x", (d) => (d.p[0] + d.dx).toFixed(1)).attr("y", (d) => (d.p[1] + d.dy).toFixed(1))
      .attr("dy", "0.35em").text((d) => d.label);
    A.key(svg, [{ label: compact ? "Line of the 1748 road" : "Line of the 1748 road, on today’s streets",
      fill: "var(--c1)", line: 5 }], 14, compact ? 12 : 22);
    A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26 });

    const loc = compact ? 44 : 64;
    const capH = 18 + lic.length * pitch;
    const ix = banded ? 16 : w - iw - 22, iy = banded ? mh + 14 : mh - loc - 34 - capH - ih - 8;
    const ig = map.append("g").attr("class", "plate inset").attr("transform", `translate(${ix.toFixed(1)},${iy.toFixed(1)})`);
    ig.append("rect").attr("class", "plate-mat").attr("x", -5).attr("y", -5)
      .attr("width", iw + 10).attr("height", banded ? ih + 10 : ih + capH + 12);
    ig.append("svg").attr("width", iw).attr("height", ih).attr("viewBox", `0 0 ${crop[0]} ${crop[1]}`)
      .attr("preserveAspectRatio", "xMidYMid slice")
      .append("image").attr("href", DATA + ins.inset.img).attr("width", crop[0]).attr("height", crop[1])
      .attr("class", "plate-scan");
    ig.append("rect").attr("class", "plate-frame").attr("width", iw).attr("height", ih);
    // caption under the scan: inside the mat in the corner, under the mat in a band
    const [cx, cy] = banded ? [0, ih + 20] : [0, ih + 15];
    ig.append("text").attr("class", "plate-label").attr("x", cx).attr("y", cy).text(ins.label || "");
    lic.forEach((t, i) => ig.append("text").attr("class", "key-label key-note plate-licence")
      .attr("x", cx).attr("y", cy + pitch + 2 + i * pitch).text(t));
  };

  /* ---- wards: the numbered wards (dashed) under the five named ones (solid, chapter ink) ---- */
  A.heroes.wards = function (fig, data, base) {
    const { svg, map, w, mh, top, compact } = A.frame(fig);
    const proj = A.projection(base.bounds, w, mh);
    const path = d3.geoPath(proj);
    svg.attr("aria-label", `Map of Bình Thạnh: ${data.old.length} numbered wards before the redraw and ${data.new.length} named wards after it`);
    const g = map.append("g").attr("class", "wards");
    g.append("path").attr("class", "base-outline").attr("d", path(base.outline))
      .attr("fill", "var(--base-fill)").attr("stroke", "none");
    g.append("path").attr("class", "base-streets")
      .attr("d", path({ type: "MultiLineString", coordinates: base.streets }))
      .attr("fill", "none").attr("stroke", "var(--base-line)").attr("stroke-width", 0.5);
    g.append("g").attr("class", "old-wards").selectAll("path").data(data.old).join("path")
      .attr("d", (d) => path(d.geometry));
    g.append("g").attr("class", "new-wards").selectAll("path").data(data.new).join("path")
      .attr("d", (d) => path(d.geometry));
    g.append("path").attr("class", "district-outline").attr("d", path(base.outline));

    // new names first (they lead), then the old numbers wherever they do not collide
    const lab = map.append("g").attr("class", "ward-labels");
    const placed = [];
    const box = (c, tw, th) => [c[0] - tw / 2, c[1] - th / 2, c[0] + tw / 2, c[1] + th / 2];
    const hit = (b) => placed.some((q) => b[0] < q[2] && q[0] < b[2] && b[1] < q[3] && q[1] < b[3]);
    const fs = compact ? 10 : 12.5;
    data.new.forEach((d) => {
      const name = A.wardName(d.name);
      const c = path.centroid(d.geometry);
      const t = lab.append("text").attr("class", "new-ward-label").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", c[0].toFixed(1)).attr("y", c[1].toFixed(1)).text(name);
      const bw = t.node().getComputedTextLength();
      placed.push(box(c, bw + 6, fs + 6));
    });
    data.old.forEach((d) => {
      const num = A.wardName(d.name);
      const c = path.centroid(d.geometry);
      const b = box(c, num.length * 7 + 6, 14);
      if (hit(b)) {                                  // try just below, then just above
        const dn = [c[0], c[1] + 15], up = [c[0], c[1] - 15];
        const alt = [dn, up].find((p) => !hit(box(p, num.length * 7 + 6, 14)) && d3.geoContains(d.geometry, proj.invert(p)));
        if (!alt) return;
        c[0] = alt[0]; c[1] = alt[1];
      }
      placed.push(box(c, num.length * 7 + 6, 14));
      lab.append("text").attr("class", "old-ward-label").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", c[0].toFixed(1)).attr("y", c[1].toFixed(1)).text(num);
    });
    const k = A.key(svg, [
      { label: compact ? "Numbered ward, to 2025" : "Numbered ward, until 2025", fill: "var(--ink-soft)", line: 1 },
      { label: compact ? "Named ward, since 2025" : "Named ward, since 2025", fill: "var(--c1)", line: 2.5 },
    ], 14, compact ? 12 : 22);
    k.select("g path").attr("stroke-dasharray", "3 2");
    A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26 });
  };


  /* ---- streets (v2.2): the colour is carried by street segments, never dots ----
     data: {pockets:[{id,kind,label,slot,segments:[{c:[[lon,lat],[lon,lat]],n}]}], streets:[grey
     polylines], zoom?, center?, radius_m?, focus?, key?, campuses?:[{label,geometry}],
     street_labels?:[{name,primary,lines}], labelled?}. Segment width is clamp(1.5, k * sqrt(n), cap)
     with k = cap / sqrt(nMax), nMax = the biggest n on the page, so the busiest stretch lands exactly
     on the cap (7 px overview, 12 px when data.zoom). `focus` ([w,s,e,n]) frames a part of the
     district instead of all of it. */
  A.heroes.streets = function (fig, data, base) {
    const { svg, map, w, h, mh, top, compact } = A.frame(fig);
    const zoom = data.zoom === true;
    let proj;
    if (zoom) {
      // frame a ~230 m radius around the pocket, filling the figure's aspect
      const R = 230, [cx, cy] = data.center;
      const dLat = R / 111320, dLon = R / (111320 * Math.cos((cy * Math.PI) / 180));
      const hw = w > mh ? dLon * (w / mh) : dLon, hh = w > mh ? dLat : dLat * (mh / w);
      proj = A.projection([cx - hw, cy - hh, cx + hw, cy + hh], w, mh);
    } else {
      proj = A.projection(data.focus || base.bounds, w, mh);
    }
    svg.attr("aria-label", zoom
      ? "Street-scale map: streets coloured by the kind of place on them"
      : "Map of Bình Thạnh: streets inside each pocket coloured by the kind of place on them");

    const inner = map.append("g").attr("class", "streets-map");
    clipTo(svg, inner, "streets-clip", w, mh);
    A.drawBase(inner, base, proj, data.streets);
    // the streets a label names, as OSM draws them: not painted (the grey base already shows them), kept
    // so a label can be checked against its own street
    (data.street_labels || []).forEach((st) => inner.append("path").attr("class", "named-street")
      .attr("data-name", st.name).attr("fill", "none").attr("stroke", "none")
      .attr("d", st.lines.map((l) => "M" + l.map((q) => proj(q).map((v) => v.toFixed(1)).join(",")).join("L")).join("")));
    // everything below is placed in svg coordinates: the map group sits `top` px down
    const S = (q) => { const p = proj(q); return [p[0], p[1] + top]; };

    const outlines = [];   // campus outline edges, svg coords
    (data.campuses || []).forEach((c) => {
      const polys = c.geometry.type === "Polygon" ? [c.geometry.coordinates] : c.geometry.coordinates;
      const d = polys.map((poly) => poly.map((ring) =>
        "M" + ring.map((p) => proj(p).map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("")).join("");
      inner.append("path").attr("class", "campus").attr("d", d)
        .attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 1.4)
        .attr("stroke-linejoin", "round");
      const ring = polys[0][0].map(S);
      c._ring = ring;
      ring.slice(1).forEach((b, i) => outlines.push([ring[i], b]));
    });

    const cap = zoom ? 12 : 7;
    let nMax = 1;
    data.pockets.forEach((p) => p.segments.forEach((s) => { nMax = Math.max(nMax, s.n); }));
    const kScale = cap / Math.sqrt(nMax);
    const width = (n) => Math.max(1.5, Math.min(cap, kScale * Math.sqrt(n)));
    const coloured = [];   // every drawn stretch: {a, b, hw, id}, svg coords
    data.pockets.forEach((p) => {
      const g = inner.append("g").attr("class", "pocket").attr("data-id", p.id).attr("data-kind", p.kind);
      const col = `var(--${p.slot})`;
      g.selectAll("path").data(p.segments.slice().sort((a, b) => a.n - b.n)).join("path")
        .attr("class", "seg")
        .attr("d", (s) => "M" + s.c.map((q) => proj(q).map((v) => v.toFixed(1)).join(",")).join("L"))
        .attr("fill", "none").attr("stroke", col)
        .attr("stroke-width", (s) => width(s.n).toFixed(2))
        .attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
      p.segments.forEach((s) => coloured.push({ a: S(s.c[0]), b: S(s.c[1]), hw: width(s.n) / 2, n: s.n, id: p.id }));
    });
    inner.select("g.base-labels").raise();

    if (zoom && data.key) {
      A.key(svg, data.key.map((k) => ({ label: k.label, fill: `var(--${k.slot})`, line: 5 })),
        14, compact ? 12 : 22);
    }
    const sbMetres = zoom ? 100 : data.focus ? 200 : 500;
    A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26, metres: sbMetres, mark: data.focus });

    // ---- labels: every one is placed by search, deterministic, in svg coordinates ----
    const srect = svg.node().getBoundingClientRect();
    const rel = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left - srect.left, r.top - srect.top, r.right - srect.left, r.bottom - srect.top];
    };
    const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const pad = (b, e) => [b[0] - e, b[1] - e, b[2] + e, b[3] + e];
    const furniture = [];
    svg.selectAll("g.locator, g.scale-bar, g.north, g.key").each(function () { furniture.push(pad(rel(this), 3)); });
    const wardBoxes = [];
    svg.selectAll("text.ward-label").each(function () { wardBoxes.push(pad(rel(this), 2)); });
    const placed = [];    // label boxes already set (axis-aligned)
    const inView = (b) => b[0] >= 2 && b[1] >= top + 2 && b[2] <= w - 2 && b[3] <= h - 2;

    const ptSeg = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const ptRect = (p, r) => Math.hypot(Math.max(r[0] - p[0], 0, p[0] - r[2]), Math.max(r[1] - p[1], 0, p[1] - r[3]));
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const segsCross = (p1, p2, q1, q2) => cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0;
    /** Distance from a segment a-b to an axis-aligned box r (0 when it crosses the box). */
    const segRect = (a, b, r) => {
      if (ptRect(a, r) === 0 || ptRect(b, r) === 0) return 0;
      const c = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
      for (let i = 0; i < 4; i++) if (segsCross(a, b, c[i], c[(i + 1) % 4])) return 0;
      return Math.min(ptRect(a, r), ptRect(b, r), ...c.map((q) => ptSeg(q, a, b)));
    };
    const onStretch = (b) => coloured.some((s) => segRect(s.a, s.b, b) < s.hw + 1.5);
    const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

    /** A label of class cls, its centre searched over `anchors` (points it should sit next to); `cost`
        adds the label's own rules. Returns the text node, set where the total cost is lowest. */
    const placeBox = (cls, text, fill, anchors, cost, attrs) => {
      const t = svg.append("text").attr("class", cls).attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", 0).attr("y", 0).text(text);
      if (fill) t.attr("fill", fill);
      Object.entries(attrs || {}).forEach(([k, v]) => t.attr(k, v));
      const bb = t.node().getBBox(), ox = bb.x + bb.width / 2, oy = bb.y + bb.height / 2;
      let best = null, bestCost = Infinity;
      anchors.forEach(({ p, r }) => [3, 8, 14, 22, 34].forEach((gap) => DIRS.forEach(([dx, dy]) => {
        const cx = p[0] + dx * (r + gap + bb.width / 2), cy = p[1] + dy * (r + gap + bb.height / 2);
        const b = [cx - bb.width / 2, cy - bb.height / 2, cx + bb.width / 2, cy + bb.height / 2];
        let c = inView(b) ? 0 : 1000;
        c += furniture.filter((o) => hit(o, b)).length * 500 + placed.filter((o) => hit(o, pad(b, 4))).length * 500;
        c += wardBoxes.filter((o) => hit(o, b)).length * 40;
        if (onStretch(b)) c += 500;
        c += cost(b) + gap * 0.05;
        if (c < bestCost) { bestCost = c; best = [cx, cy]; }
      })));
      t.attr("x", (best[0] - ox).toFixed(1)).attr("y", (best[1] - oy).toFixed(1));
      placed.push(rel(t.node()));
      return t;
    };

    // pocket labels: beside their own stretches, never on a stretch, never nearer another pocket's
    if (data.labelled || !data.key) {
      data.pockets.forEach((p) => {
        const own = coloured.filter((s) => s.id === p.id), other = coloured.filter((s) => s.id !== p.id);
        const anchors = [];
        own.forEach((s) => [0, 0.5, 1].forEach((f) => anchors.push({
          p: [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f], r: s.hw })));
        placeBox("pocket-label", p.label, `var(--${p.slot})`, anchors, (b) => {
          const dOwn = Math.min(...own.map((s) => segRect(s.a, s.b, b) - s.hw));
          const dOther = other.length ? Math.min(...other.map((s) => segRect(s.a, s.b, b) - s.hw)) : Infinity;
          return (dOther <= dOwn + 3 ? 300 : 0) + dOwn;
        }, { "data-id": p.id });
      });
    }

    // campus names: beside their own outline, off the coloured stretches and the line itself
    (data.campuses || []).forEach((c) => {
      if (!c.label || !c._ring) return;
      const anchors = c._ring.map((p) => ({ p, r: 1 }));
      const edges = c._ring.slice(1).map((b, i) => [c._ring[i], b]);
      placeBox("campus-label", c.label, null, anchors, (b) => {
        const d = Math.min(...edges.map(([a, e]) => segRect(a, e, b)));
        const crossOther = outlines.some(([a, e]) => segRect(a, e, b) < 1);
        return (crossOther ? 200 : 0) + d;
      }, { "data-osm": c.osm });
    });

    // street names: along a straight stretch of the named street, upright, off the coloured stretches
    // and every label above; on a phone only the street the headline names
    (data.street_labels || []).filter((s) => !compact || s.primary).forEach((st) => {
      const t = svg.append("text").attr("class", "street-label").attr("data-name", st.name)
        .attr("text-anchor", "middle").attr("dy", "0.35em").text(st.name);
      const tw = t.node().getComputedTextLength(), th = t.node().getBBox().height;
      let best = null, bestCost = Infinity;
      // the label rides the polyline itself: its centre is a point ON the named street, its angle the chord
      // of the street over the label's own length, and that stretch of street must be straight (every vertex
      // within 3 px of the chord). Grey pieces that are not this street (both ends off it) are "other".
      const own = st.lines.map((l) => l.map(S));
      const ownPieces = own.flatMap((P) => P.slice(1).map((b, i) => [P[i], b]));
      const dOwn = (q) => Math.min(...ownPieces.map(([a, b]) => ptSeg(q, a, b)));
      const otherGrey = (data.streets || []).flatMap((l) => { const P = l.map(S); return P.slice(1).map((b, i) => [P[i], b]); })
        .filter(([a, b]) => !(dOwn(a) < 4 && dOwn(b) < 4));
      const dOther = (q) => Math.min(Infinity, ...otherGrey.map(([a, b]) => ptSeg(q, a, b)));
      own.forEach((P) => {
        const cum = [0];
        for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        const L = cum[cum.length - 1];
        const at = (s) => {
          let i = 1;
          while (i < P.length - 1 && cum[i] < s) i++;
          const f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
          return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f];
        };
        for (let s = tw / 2 + 4; s <= L - tw / 2 - 4; s += 6) {
          const A = at(s - tw / 2), B = at(s + tw / 2), C = at(s);
          const inSpan = P.filter((_, i) => cum[i] > s - tw / 2 && cum[i] < s + tw / 2).concat([C]);
          if (inSpan.some((q) => ptSeg(q, A, B) > 3)) continue;       // the street bends under the label
          let ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
          if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI;
          const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
          // on the street, or just beside it: at most far enough for the label's near edge to clear the
          // widest stretch a zoom draws (cap / 2 + 3 px), so it is never further off than that
          const far = th / 2 + cap / 2 + 3;
          [0, th / 2 + 2, -(th / 2 + 2), th / 2 + 4, -(th / 2 + 4), far, -far].forEach((off) => {
            const cx = C[0] + nx * off, cy = C[1] + ny * off;
            if (dOwn([cx, cy]) > far + 0.5) return;                   // a bend nearby pushed it further off
            const pts = [];
            for (let i = 0; i <= 8; i++) for (const v of [-th / 2, 0, th / 2]) {
              const u = -tw / 2 - 2 + ((tw + 4) * i) / 8;
              pts.push([cx + u * ux + v * nx, cy + u * uy + v * ny]);
            }
            let c = pts.every((q) => q[0] >= 2 && q[0] <= w - 2 && q[1] >= top + 2 && q[1] <= h - 2) ? 0 : 1000;
            c += pts.filter((q) => furniture.some((o) => ptRect(q, o) === 0)).length ? 500 : 0;
            c += pts.filter((q) => placed.some((o) => ptRect(q, pad(o, 3)) === 0)).length ? 500 : 0;
            c += pts.some((q) => coloured.some((sg) => ptSeg(q, sg.a, sg.b) < sg.hw + 2)) ? 300 : 0;
            if (dOther([cx, cy]) <= dOwn([cx, cy]) + 1) c += 300;  // reads as another street's name
            c += pts.some((q) => dOther(q) < 1.5) ? 60 : 0;          // crosses another street
            c += pts.some((q) => outlines.some(([e0, e1]) => ptSeg(q, e0, e1) < 2)) ? 60 : 0;
            c += pts.some((q) => wardBoxes.some((o) => ptRect(q, o) === 0)) ? 40 : 0;
            c += Math.abs(off) * 0.3 + Math.hypot(cx - w / 2, cy - (top + h) / 2) * 0.01;
            if (c < bestCost) { bestCost = c; best = [cx, cy, ang]; }
          });
        }
      });
      if (!best || bestCost >= 300) { t.remove(); return; }  // no clean straight run in view: say nothing
      t.attr("transform", `translate(${best[0].toFixed(1)},${best[1].toFixed(1)}) rotate(${((best[2] * 180) / Math.PI).toFixed(1)})`);
      placed.push(rel(t.node()));
    });
  };
  /* ---- pair (v2.2): where the buildings stand beside where the map puts food ----
     data.density = {grid:{w,h,bounds}, buildings:[uint8], listings:[uint8]}, row 0 = north, each
     layer already scaled to its own 98th percentile. Both panels use ONE projection and ONE grid, so
     the same pixel is the same street. Two <canvas class="density"> in a panel each; the figure is a
     flex row >= 900 px and `display: contents` below, where CSS order puts .big-number between them. */
  A.heroes.pair = function (fig, data, base) {
    d3.select(fig).selectAll(".panel").remove();
    const { grid } = data.density;
    const W = 1100;
    const [x0, y0, x1, y1] = grid.bounds;
    const probe = A.projection(base.bounds || grid.bounds, W, W);
    const a = probe([x0, y1]), c = probe([x1, y0]);
    const H = Math.round(W * (c[1] - a[1] + 16) / (c[0] - a[0] + 16));
    const proj = A.projection(grid.bounds, W, H);
    const tl = proj([x0, y1]), br = proj([x1, y0]);
    const cssOf = (name) => {   // the token's computed colour, as a string a canvas accepts
      const el = document.createElement("span"); el.style.color = `var(${name})`; document.body.append(el);
      const v = getComputedStyle(el).color; el.remove(); return v;
    };
    const rgbOf = (name) => cssOf(name).match(/[\d.]+/g).map(Number);
    const panels = [
      { key: "buildings", title: "where the buildings stand", color: "--ink-soft", label: "Building density",
        note: "Darker = more buildings per cell, shaded to this panel’s own peak" },
      { key: "listings", title: "where the map puts food", color: "--c1", label: "Listed-kitchen density",
        note: "Redder = more listed kitchens per cell, shaded to this panel’s own peak" },
    ];
    panels.forEach((pn) => {
      const wrap = d3.select(fig).append("div").attr("class", "panel").attr("data-key", pn.key);
      wrap.append("h3").attr("class", "panel-title").style("color", `var(${pn.color})`).text(pn.title);
      const cv = wrap.append("canvas").attr("class", "density").attr("width", W).attr("height", H)
        .attr("role", "img").attr("aria-label", `${pn.label}, Bình Thạnh`).node();
      const g = cv.getContext("2d");
      const path = d3.geoPath(proj, g);
      // the district, then the density clipped to it: nothing bleeds past the boundary
      g.save();
      g.beginPath(); path(base.outline); g.clip();
      g.fillStyle = cssOf("--base-fill"); g.fillRect(0, 0, W, H);
      const rgb = rgbOf(pn.color);
      const off = document.createElement("canvas"); off.width = grid.w; off.height = grid.h;
      const og = off.getContext("2d"), im = og.createImageData(grid.w, grid.h), v = data.density[pn.key];
      for (let i = 0; i < v.length; i++) {
        // alpha follows the density, gamma-lifted so the faint fringe stays out of the way
        const t = Math.pow(v[i] / 255, 1.25);
        im.data[i * 4] = rgb[0]; im.data[i * 4 + 1] = rgb[1]; im.data[i * 4 + 2] = rgb[2];
        im.data[i * 4 + 3] = Math.round(t * 255);
      }
      og.putImageData(im, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(off, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
      g.restore();
      g.beginPath(); path(base.outline);
      g.strokeStyle = cssOf("--ink-soft"); g.lineWidth = 1.4; g.stroke();
      // each layer is scaled to its own 98th percentile: the two panels do not share one scale
      wrap.append("p").attr("class", "density-key").text(pn.note);
    });
  };

  /* ---- block (v2.2): every footprint, in grey; only a building holding a listed kitchen is phượng ----
     data: {cell:[w,s,e,n], footprints:[ring], streets:[polylines], n_buildings, n_listings,
     layers:[{kind:"listed", slot, footprint_idx:[]}]}. A block with no listed footprint stays all grey:
     no stand-in mark, so nothing reads as listed that is not. */
  A.heroes.block = function (fig, data, base) {
    const { svg, map, w, mh, compact } = A.frame(fig);
    const proj = A.projection(data.cell, w, mh);
    svg.attr("aria-label", `One block: ${data.n_buildings} buildings, ${data.n_listings} listed kitchens`);
    const inner = map.append("g").attr("class", "block-map");
    clipTo(svg, inner, "block-clip", w, mh);
    const P = (q) => proj(q).map((v) => v.toFixed(1)).join(",");
    inner.append("path").attr("class", "block-streets")
      .attr("d", data.streets.map((l) => "M" + l.map(P).join("L")).join(""))
      .attr("fill", "none").attr("stroke", "var(--context-soft)").attr("stroke-width", compact ? 3.5 : 4.5)
      .attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
    const lit = new Set();
    (data.layers || []).forEach((l) => (l.footprint_idx || []).forEach((i) => lit.add(i)));
    const order = data.footprints.map((_, i) => i).sort((a, b) => lit.has(a) - lit.has(b));
    inner.append("g").attr("class", "footprints").selectAll("path").data(order).join("path")
      .attr("class", (i) => (lit.has(i) ? "fp listed" : "fp")).attr("data-i", (i) => i)
      .attr("d", (i) => "M" + data.footprints[i].map(P).join("L") + "Z")
      .attr("fill", (i) => (lit.has(i) ? "var(--c1)" : "var(--context-mid)"))
      .attr("stroke", "none");
    // a light plan: mid-grey footprints, pale thin streets, so one phượng building would jump out.
    // The scale bar and the arrow sit on paper cards: on a phone the block reaches every corner
    card(A.scaleBar(svg, proj, 14, mh - 14, 100), 4);
    card(A.north(svg, w - 22, 26), 3);
  };

  /* ---- dispatch: load the page's data + the shared base, draw, redraw on resize ---- */
  const FONT_WAIT_MS = 3000;
  A.render = function (fig) {
    const kind = document.body.dataset.hero;
    const draw = A.heroes[kind];
    if (typeof draw !== "function") {
      console.warn(`atlas: no hero renderer for "${kind}" — showing the text fallback`);
      showFallback(fig);
      return Promise.resolve(null);
    }
    // labels are placed by their measured boxes: draw only once the faces have loaded, or a box measured
    // in a fallback face grows onto a stretch when the real face swaps in (seen under load, v2.2-S6)
    // ... but not forever: a stalled font request must not leave the hero blank (v2.2.1). After the
    // timeout the map draws in the fallback face and redraws once when the faces do arrive
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => null) : Promise.resolve();
    let late = false;
    const fonts = Promise.race([ready, new Promise((r) => setTimeout(() => { late = true; r(); }, FONT_WAIT_MS))]);
    return Promise.all([d3.json(fig.dataset.src), d3.json(fig.dataset.base), fonts]).then(([data, base]) => {
      let lastW = -1, lastH = -1, raf = 0;
      const redraw = () => {
        const cw = Math.floor(fig.clientWidth), ch = Math.floor(fig.clientHeight);
        if (cw === lastW && ch === lastH) return;
        lastW = cw; lastH = ch;
        draw(fig, data, base);
      };
      redraw();
      if (late) ready.then(() => { lastW = -1; redraw(); });
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
