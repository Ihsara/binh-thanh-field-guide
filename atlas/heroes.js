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

  /** The atlas's "beyond" ground: 7 px hatch, ground fill, --rule strokes at 45 degrees. Appends the
      pattern to `defs` and returns its id (the sheet renderer's off-sheet paper; v2.3.1 the ground outside
      the district in a panelled streets hero). */
  A.beyondHatch = function (defs) {
    const id = "beyond-hatch";
    const hatch = defs.append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse")
      .attr("width", 7).attr("height", 7).attr("patternTransform", "rotate(45)");
    hatch.append("rect").attr("width", 7).attr("height", 7).attr("fill", "var(--ground)");
    hatch.append("path").attr("d", "M0,0V7").attr("stroke", "var(--rule)").attr("stroke-width", 1.4);
    return id;
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
    A.beyondHatch(defs);
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
     district instead of all of it. v2.4: a hero with grey context stretches (data.context, or per panel)
     encodes no count by width: one weight per class (close-up 6 / 3.5 px, overview 3.5 / 2 px). */
  /* ---- two panels at one scale (v2.3, two-campuses-two-pockets) ----
     data.panels = [{pocket, campus, centre, size_m:[w,h], context, campuses, streets}]. Both panels share
     ONE Mercator scale, sized so the larger group (pocket + campus) fits with a margin: 700 m across
     side by side, 600 m stacked (user, v2.3-S1). v2.4-S5 (Task 8): the dimension lines are retired; each panel
     names its campuses with their walking minutes. Side by side needs a shared scale of at least SIDE_PX_PER_M
     (under 900 px; SPREAD_SIDE_PX_PER_M on a spread), the smallest at which both panels' labels (pocket names, campus names with minutes, "Outside Bình Thạnh")
     all sit inside their own panel, clear of each other and of every stroke (measured, Task 8 report); below it
     they stack. On a spread (>= 900 px) the grid owns the height. Under 900 px (v2.3.1) the figure's height is
     the layout's own (phoneLayout): side by side wherever the width alone gives that scale, else stacked at
     about STACK_PX_PER_M, smaller where needed so both panels fit one screen. */
  const PANEL_GAP = 6;
  // a pocket close-up (v2.4): one weight per class, no width encoding (close-up: red 6 px, grey 3.5 px); an
  // overview (v2.4-S5, Task 8) one weight down the same ladder (2, 3.5, 6): red 3.5 px, grey 2 px
  const RED_W = 6, GREY_W = 3.5, OV_RED_W = 3.5, OV_GREY_W = 2;
  const DISH_NEAR_PX = 48;   // two dish words closer than this across their text direction must not sit side by side
  // an overview's dish word fits its stretch when the stretch is this much longer than the word at each end: the
  // streets that meet a stretch meet it at its ends, and a word turned to it reaches past them otherwise
  const DISH_FIT_PAD = 6;
  const KIND_NAME = { korean: "Korean", japanese: "Japanese" };
  // side by side needs at least this shared scale. scripts/derive_panel_threshold.py forces side by side and sweeps
  // the widths (Task 8 fix 1, UTH beside Vo Oanh): every label is clean from 0.386 up under 900 px (highest failure
  // 0.372) and from 0.435 up on a spread (highest failure 0.421). Both thresholds sit above that and keep v2.3.1's
  // breakpoints: 0.51 puts the phone switch at 720 px (700 px: 0.501), 0.482 the spread switch at about 1030 px
  const SIDE_PX_PER_M = 0.51;
  const SPREAD_SIDE_PX_PER_M = 0.482;
  const STACK_PX_PER_M = 0.554;   // the stacked panels' scale v2.3.1 set (46 px for the old 83 m), kept
  const EARTH_R = 6378137;
  const panelGroup = (ps) => ({ gw: d3.max(ps, (p) => p.size_m[0]), gh: d3.max(ps, (p) => p.size_m[1]) });
  /** Under 900 px: {across, h}, the layout and the figure height it needs at width w. Side by side when
      the width-limited scale reaches SIDE_PX_PER_M; otherwise stacked at about STACK_PX_PER_M, capped by the
      width and by the screen under the running head (v2.3.1: both panels in one screen). */
  function phoneLayout(data, w) {
    const { gw, gh } = panelGroup(data.panels);
    const top = w < 560 ? 44 : 0;                    // A.frame's compact key band
    const kSide = (w - PANEL_GAP) / 2 / (gw + 120);
    if (kSide >= SIDE_PX_PER_M) return { across: true, h: Math.ceil(top + (gh + 120) * kSide) };
    const head = document.querySelector("header.running-head");
    const avail = window.innerHeight - (head ? head.getBoundingClientRect().height : 0);
    const fit = (avail - top - PANEL_GAP) / (2 * (gh + 40));
    const k = Math.min(w / (gw + 20), STACK_PX_PER_M, fit);
    return { across: false, h: Math.floor(top + 2 * (gh + 40) * k + PANEL_GAP) };   // floor: never past the screen
  }
  function campusPanels(data, w, mh, phone) {
    const ps = data.panels;
    const lat = (d3.mean(ps, (p) => p.centre[1]) * Math.PI) / 180;
    const { gw, gh } = panelGroup(ps);
    const side = { across: true, pw: (w - PANEL_GAP) / 2, ph: mh, need: [gw + 120, gh + 120] };
    const stack = { across: false, pw: w, ph: (mh - PANEL_GAP) / 2, need: [gw + 20, gh + 40] };
    const pxPerM = (o) => Math.min(o.pw / o.need[0], o.ph / o.need[1]);
    const lay = phone ? (phone.across ? side : stack) : pxPerM(side) >= SPREAD_SIDE_PX_PER_M ? side : stack;
    const k = pxPerM(lay) * EARTH_R * Math.cos(lat);   // d3 Mercator: px per radian of longitude
    return ps.map((pn, i) => {
      const proj = d3.geoMercator().scale(k).translate([0, 0]);
      const c = proj(pn.centre);
      proj.translate([lay.pw / 2 - c[0], lay.ph / 2 - c[1]]);
      return { ...pn, proj, pw: lay.pw, ph: lay.ph, across: lay.across,
        x: lay.across ? i * (lay.pw + PANEL_GAP) : 0, y: lay.across ? 0 : i * (lay.ph + PANEL_GAP) };
    });
  }

  /** One scale bar and one north for both panels; the locator (both pockets on the district, how far
      apart) in the last panel's bottom-right corner. On a phone the bar and the arrow sit in the band
      above the maps. */
  function campusFurniture(svg, base, panels, data, w, top, compact, phone) {
    const first = panels[0], last = panels[panels.length - 1];
    const sb = compact ? A.scaleBar(svg, first.proj, 16, top - 14, 100)
      : A.scaleBar(first.g, first.proj, 14, first.ph - 18, 100);
    if (compact) A.north(svg, w - 22, 18);
    else A.north(last.g, last.pw - 22, 26);
    // under 900 px a panel is only as tall as its layout (v2.3.1): the 96 px locator landed on a stretch
    const size = compact || phone ? 64 : 96;
    const loc = A.locator(last.g, base, last.pw - size - 14, last.ph - size - 26, size);
    const lp = d3.geoMercator().fitExtent([[5, 5], [size - 5, size - 5]], base.outline);
    const ends = panels.map((pn) => { const pk = data.pockets.find((p) => p.id === pn.pocket) || {}; return { q: lp(pk.centre), slot: pk.slot }; });
    loc.append("path").attr("class", "locator-link")
      .attr("d", `M${ends.map((e) => e.q.map((v) => v.toFixed(1)).join(",")).join("L")}`);
    const s = compact ? 5 : 6;
    ends.forEach((e) => loc.append("rect").attr("class", "locator-pocket")
      .attr("x", (e.q[0] - s / 2).toFixed(1)).attr("y", (e.q[1] - s / 2).toFixed(1)).attr("width", s).attr("height", s)
      .attr("fill", `var(--${e.slot})`));
    loc.select("text.furniture-label").text(`${data.apart_km} km apart`);
  }

  A.heroes.streets = function (fig, data, base) {
    fig.classList.toggle("panelled", Array.isArray(data.panels));   // before the frame: it sets the phone height
    // v2.3.1: under 900 px a panelled hero is as tall as its layout needs (both panels in one screen);
    // on a spread the grid owns the height, so any inline height from a narrower draw is cleared
    let phone = null;
    if (data.panels) {
      if (window.matchMedia("(max-width: 899.98px)").matches) {
        phone = phoneLayout(data, Math.max(240, Math.floor(fig.clientWidth)));
        fig.style.height = `${phone.h}px`;
      } else fig.style.height = "";
    }
    const { svg, map, w, h, mh, top, compact } = A.frame(fig);
    const zoom = data.zoom === true;
    // v2.4: a close-up with context stretches (little-seoul; little-tokyo since v2.4-S5) is a pocket map with no width encoding: every
    // coloured stretch one weight, every grey one lighter weight, and it is framed on data.focus (both
    // campus outlines and the coloured stretches; grey may run off the edge)
    const pocketZoom = zoom && Array.isArray(data.context);
    let proj;
    if (pocketZoom && data.focus) {
      proj = A.projection(data.focus, w, mh);
    } else if (zoom) {
      // frame a ~230 m radius around the pocket, filling the figure's aspect
      const R = 230, [cx, cy] = data.center;
      const dLat = R / 111320, dLon = R / (111320 * Math.cos((cy * Math.PI) / 180));
      const hw = w > mh ? dLon * (w / mh) : dLon, hh = w > mh ? dLat : dLat * (mh / w);
      proj = A.projection([cx - hw, cy - hh, cx + hw, cy + hh], w, mh);
    } else if (!data.panels) {
      proj = A.projection(data.focus || base.bounds, w, mh);
    }
    svg.attr("aria-label", zoom
      ? "Street-scale map: streets coloured by the kind of place on them"
      : data.panels
        ? "Two maps at one scale: each pocket's streets coloured by the kind of place on them, and the campuses beside it outlined and named"
        : "Map of Bình Thạnh: streets inside each pocket coloured by the kind of place on them");

    // one panel, or (v2.3) one per pocket at a shared scale. Each panel draws into its own clipped group;
    // everything after drawing is placed in svg coordinates: a panel sits at (x, y) in the map group, which
    // sits `top` px down
    const panels = data.panels ? campusPanels(data, w, mh, phone) : [{ proj, x: 0, y: 0, pw: w, ph: mh }];
    // v2.3.1: in a panel the ground beyond the district wears the atlas's beyond hatch; drawBase's land
    // fill then covers the inside, so only the outside stays hatched (bare paper read as water or no data)
    const hatchId = data.panels ? A.beyondHatch(svg.append("defs")) : null;
    panels.forEach((pn, i) => {
      pn.g = map.append("g").attr("class", data.panels ? "map-panel" : null).attr("data-pocket", pn.pocket || null)
        .attr("transform", pn.x || pn.y ? `translate(${pn.x.toFixed(1)},${pn.y.toFixed(1)})` : null);
      pn.inner = pn.g.append("g").attr("class", "streets-map");
      clipTo(svg, pn.inner, `streets-clip-${i}`, pn.pw, pn.ph);
      if (hatchId) pn.inner.append("rect").attr("class", "beyond").attr("width", pn.pw).attr("height", pn.ph)
        .attr("fill", `url(#${hatchId})`);
      A.drawBase(pn.inner, base, pn.proj, pn.streets || data.streets);
      // a hairline edge: where a panel reaches past the district (paper), it would melt into the gap
      if (data.panels) pn.g.append("rect").attr("class", "panel-frame").attr("width", pn.pw).attr("height", pn.ph);
      pn.S = (q) => { const p = pn.proj(q); return [p[0] + pn.x, p[1] + pn.y + top]; };
      pn.rect = [pn.x, pn.y + top, pn.x + pn.pw, pn.y + top + pn.ph];
    });
    const panelOf = (pocket, campus) => panels.find((pn) => (pocket && pn.pocket === pocket)
      || (campus && pn.campus === campus)) || panels[0];
    const P0 = panels[0], inner = P0.inner, S = P0.S;
    if (!proj) proj = P0.proj;
    // the streets a label names, as OSM draws them: not painted (the grey base already shows them), kept
    // so a label can be checked against its own street
    (data.street_labels || []).forEach((st) => inner.append("path").attr("class", "named-street")
      .attr("data-name", st.name).attr("fill", "none").attr("stroke", "none")
      .attr("d", st.lines.map((l) => "M" + l.map((q) => proj(q).map((v) => v.toFixed(1)).join(",")).join("L")).join("")));

    const outlines = [];   // campus outline edges, svg coords
    // v2.4-S5 (Task 8): a panel draws the campuses it names (Little Seoul's: UTH and HUTECH), each in that panel
    const campusList = data.panels ? panels.flatMap((pn) => (pn.campuses || []).map((c) => ({ ...c, _pocket: pn.pocket })))
      : (data.campuses || []);
    campusList.forEach((c) => {
      const pn = c._pocket ? panelOf(c._pocket) : panelOf(null, c.osm);
      const polys = c.geometry.type === "Polygon" ? [c.geometry.coordinates] : c.geometry.coordinates;
      const d = polys.map((poly) => poly.map((ring) =>
        "M" + ring.map((p) => pn.proj(p).map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("")).join("");
      // in a panel a campus is solid paper, so one beyond the district reads as a shape on the hatch
      pn.inner.append("path").attr("class", "campus").attr("data-osm", c.osm).attr("d", d)
        .attr("fill", data.panels ? "var(--ground)" : "none").attr("stroke", "var(--ink)").attr("stroke-width", 1.4)
        .attr("stroke-linejoin", "round");
      const ring = polys[0][0].map(pn.S);
      c._ring = ring;
      c._rings = polys.flatMap((poly) => poly.map((r) => r.map(pn.S)));
      c._panel = pn;
      ring.slice(1).forEach((b, i) => outlines.push([ring[i], b]));
    });

    const cap = zoom ? 12 : 7;
    let nMax = 1;
    data.pockets.forEach((p) => p.segments.forEach((s) => { nMax = Math.max(nMax, s.n); }));
    const kScale = cap / Math.sqrt(nMax);
    // the sqrt width scale stays on the heroes that still encode count by width (overview, the panels); a
    // pocket close-up (little-seoul, little-tokyo) draws one weight per class instead (v2.4)
    // v2.4-S5 (Task 8): an overview with grey context (two-campuses per panel) drops the width scale too, one weight
    // down the close-up's ladder
    const ctxOf = (pn) => (data.panels ? pn.context : pn === P0 ? data.context : null);
    const widthless = pocketZoom || panels.some((pn) => Array.isArray(ctxOf(pn)));
    const redW = pocketZoom ? RED_W : OV_RED_W, greyW = pocketZoom ? GREY_W : OV_GREY_W;
    const width = widthless ? () => redW : (n) => Math.max(1.5, Math.min(cap, kScale * Math.sqrt(n)));
    // grey context first, so the coloured stretches paint over it
    const context = [];    // every grey stretch: {a, b, hw, i}, svg coords
    panels.forEach((pn) => {
      const ctx = ctxOf(pn);
      if (!Array.isArray(ctx)) return;
      pn.inner.append("g").attr("class", "context").selectAll("path").data(ctx).join("path")
        .attr("class", "context-stretch").attr("data-i", (_, i) => i)
        .attr("d", (s) => "M" + s.c.map((q) => pn.proj(q).map((v) => v.toFixed(1)).join(",")).join("L"))
        .attr("stroke-width", greyW);
      ctx.forEach((s, i) => context.push({ a: pn.S(s.c[0]), b: pn.S(s.c[1]), hw: greyW / 2, i, panel: pn }));
    });
    const coloured = [];   // every drawn stretch: {a, b, hw, id}, svg coords
    // v2.4-S5 (Task 7): at one weight, a stretch two layers share (little-tokyo: one, Japanese and Western) would
    // show only the layer painted last; it is drawn twice instead, side by side, one weight apart
    const shared = {};
    if (pocketZoom) data.pockets.forEach((p) => p.segments.forEach((s) => {
      const k = JSON.stringify(s.c);
      (shared[k] = shared[k] || []).push(p.id);
    }));
    const shifted = (p, s, pn) => {      // the stretch's vertices in panel px, moved off a shared centreline
      const pts = s.c.map((q) => pn.proj(q)), ids = shared[JSON.stringify(s.c)];
      if (!ids || ids.length < 2) return pts;
      const o = (ids.indexOf(p.id) - (ids.length - 1) / 2) * RED_W, a = pts[0], b = pts[pts.length - 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / L) * o, ny = ((b[0] - a[0]) / L) * o;
      return pts.map(([x, y]) => [x + nx, y + ny]);
    };
    data.pockets.forEach((p) => {
      const pn = panelOf(p.id);
      const g = pn.inner.append("g").attr("class", "pocket").attr("data-id", p.id).attr("data-kind", p.kind);
      const col = `var(--${p.slot})`;
      const segs = p.segments.map((s, i) => ({ ...s, i }));
      g.selectAll("path").data(pocketZoom ? segs : segs.sort((a, b) => a.n - b.n)).join("path")
        .attr("class", "seg stretch").attr("data-i", (s) => s.i)
        .attr("d", (s) => "M" + shifted(p, s, pn).map((q) => q.map((v) => v.toFixed(1)).join(",")).join("L"))
        .attr("fill", "none").attr("stroke", col)
        .attr("stroke-width", (s) => width(s.n).toFixed(2))
        .attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
      p.segments.forEach((s, i) => {
        const q = shifted(p, s, pn), at = (v) => [v[0] + pn.x, v[1] + pn.y + top];
        coloured.push({ a: at(q[0]), b: at(q[q.length - 1]), hw: width(s.n) / 2, n: s.n, id: p.id, i });
      });
    });
    panels.forEach((pn) => pn.inner.select("g.base-labels").raise());

    // a pocket close-up with its own key (little-tokyo: Japanese, then Western): every coloured row at the one
    // weight, then the grey; no width row
    if (zoom && data.key) {
      A.key(svg, data.key.map((k) => ({ label: k.label, fill: `var(--${k.slot})`, line: pocketZoom ? RED_W : 5 }))
        .concat(pocketZoom ? [{ label: "Other places listed as food", fill: "var(--context-tone)", line: GREY_W }] : []),
        14, compact ? 12 : 22);
    }
    // a pocket close-up's key: its two weights, one row each, no width row
    const pocketKey = pocketZoom && !data.key;
    if (pocketKey) {
      const p = data.pockets[0];
      A.key(svg, [{ label: `Places listed as ${KIND_NAME[p.kind] || p.kind}`, fill: `var(--${p.slot})`, line: RED_W },
        { label: "Other places listed as food", fill: "var(--context-tone)", line: GREY_W }], 14, compact ? 12 : 22);
    }
    // an overview with grey context (v2.4-S5, Task 8): its pockets are named on the map in their own colour, so
    // the key explains only the grey, at its weight. On a phone it sits in the band above the maps, left of north
    if (widthless && !pocketZoom) {
      const kg = A.key(svg, [{ label: "Other places listed as food", fill: "var(--context-tone)", line: greyW }], 14, compact ? 12 : 22);
      if (compact && data.panels) kg.attr("transform", `translate(${Math.round(w - 40 - kg.node().getBBox().width)},12)`);
    }
    if (data.panels) campusFurniture(svg, base, panels, data, w, top, compact, phone);
    else {
      const sbMetres = zoom ? 100 : data.focus ? 200 : 500;
      A.furniture(map, base, proj, w, mh, { northY: compact ? 18 - top : 26, metres: sbMetres, mark: data.focus });
    }

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
    // inside the label's own panel (the whole map unless the hero has panels)
    const inView = (b, r) => { const [x0, y0, x1, y1] = r || P0.rect;
      return b[0] >= x0 + 2 && b[1] >= y0 + 2 && b[2] <= x1 - 2 && b[3] <= y1 - 2; };

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
    // v2.4: labels that may turn along a street are tested by their own glyph quad, not an axis box
    const inPoly = (q, R) => {
      let k = false;
      for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
        if ((R[i][1] > q[1]) !== (R[j][1] > q[1])
          && q[0] < ((R[j][0] - R[i][0]) * (q[1] - R[i][1])) / (R[j][1] - R[i][1]) + R[i][0]) k = !k;
      }
      return k;
    };
    /** Distance from segment a-b to a convex quad (0 when it crosses or lies inside it). */
    const segQuad = (a, b, Q) => {
      if (inPoly(a, Q) || inPoly(b, Q)) return 0;
      for (let i = 0; i < 4; i++) if (segsCross(a, b, Q[i], Q[(i + 1) % 4])) return 0;
      let d = Infinity;
      for (let i = 0; i < 4; i++) {
        const e0 = Q[i], e1 = Q[(i + 1) % 4];
        d = Math.min(d, ptSeg(Q[i], a, b), ptSeg(a, e0, e1), ptSeg(b, e0, e1));
      }
      return d;
    };
    const boxQuad = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    /** Two convex quads overlap (separating axes). */
    const quadsHit = (P1, P2) => {
      for (const poly of [P1, P2]) for (let i = 0; i < 4; i++) {
        const a = poly[i], b = poly[(i + 1) % 4], nx = b[1] - a[1], ny = a[0] - b[0];
        const pa = P1.map((q) => nx * q[0] + ny * q[1]), pb = P2.map((q) => nx * q[0] + ny * q[1]);
        if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
      }
      return true;
    };
    const upright = (a) => (a > Math.PI / 2 ? a - Math.PI : a <= -Math.PI / 2 ? a + Math.PI : a);
    /** A label placed by its glyph quad over candidate centres and angles: cands(tw, th) -> [{c, ang}];
        cost(q) adds the label's own rules (q = {quad, box, ang, cand}); onBest(cand) hears the winner. Shared: out of view 1000, on furniture or
        a placed label 500, on a coloured stretch 500, on a grey one 120. Sets a transform; returns the node. */
    const placeQuad = (cls, text, attrs, cands, cost, onBest, rect) => {
      // text: a string (one line) or an array of lines (tspans); a line may be {s, cls} (v2.4-S6: HUTECH's note)
      const t = svg.append("text").attr("class", cls).attr("text-anchor", "middle").attr("x", 0).attr("y", 0);
      if (Array.isArray(text)) text.forEach((s, i) => t.append("tspan").attr("x", 0).attr("dy", i ? "1.2em" : "0.35em")
        .attr("class", typeof s === "object" ? s.cls : null).text(typeof s === "object" ? s.s : s));
      else t.attr("dy", "0.35em").text(text);
      Object.entries(attrs || {}).forEach(([k, v]) => t.attr(k, v));
      const bb = t.node().getBBox(), ox = bb.x + bb.width / 2, oy = bb.y + bb.height / 2, tw = bb.width, th = bb.height;
      let best = null, bestCost = Infinity;
      let bestCand = null;
      cands(tw, th).forEach((cand) => {
        const { c: [cx, cy], ang } = cand;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const at = (u, v) => [cx + u * ux - v * uy, cy + u * uy + v * ux];
        const quad = [at(-tw / 2, -th / 2), at(tw / 2, -th / 2), at(tw / 2, th / 2), at(-tw / 2, th / 2)];
        const xs = quad.map((q) => q[0]), ys = quad.map((q) => q[1]);
        const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        let k = inView(box, rect) ? 0 : 1000;
        if (furniture.some((o) => quadsHit(quad, boxQuad(o)))) k += 500;
        if (placed.some((o) => quadsHit(quad, boxQuad(pad(o, 4))))) k += 500;
        if (coloured.some((s) => segQuad(s.a, s.b, quad) < s.hw + 1.5)) k += 500;
        if (context.some((s) => segQuad(s.a, s.b, quad) < s.hw + 1)) k += 120;
        if (wardBoxes.some((o) => quadsHit(quad, boxQuad(o)))) k += 40;
        if (k >= bestCost) return;
        k += cost({ quad, box, ang, cand });
        if (k < bestCost) { bestCost = k; best = [cx, cy, ang]; bestCand = cand; }
      });
      const deg = (best[2] * 180) / Math.PI;
      t.attr("transform", `translate(${best[0].toFixed(1)},${best[1].toFixed(1)})`
        + (Math.abs(deg) > 0.05 ? ` rotate(${deg.toFixed(1)})` : "") + ` translate(${(-ox).toFixed(1)},${(-oy).toFixed(1)})`)
        .attr("data-cost", bestCost.toFixed(0));
      placed.push(rel(t.node()));
      if (onBest) onBest(bestCand);
      return t;
    };
    /** Candidate centres for a label of tw x th: around points (upright), and along segments [a, b, hw]
        (turned to the segment, either side, clear of a stroke hw wide). */
    const around = (pts, tw, th) => pts.flatMap((p) => [3, 8, 14, 22, 34].flatMap((gap) => DIRS.map(([dx, dy]) =>
      ({ c: [p[0] + dx * (1 + gap + tw / 2), p[1] + dy * (1 + gap + th / 2)], ang: 0 }))));
    const along = (segs, tw, th, fs, gaps) => segs.flatMap(([a, b, hw]) => {
      const ang = upright(Math.atan2(b[1] - a[1], b[0] - a[0])), nx = -Math.sin(ang), ny = Math.cos(ang);
      return fs.flatMap((f) => [1, -1].flatMap((side) => gaps.map((gap) => {
        const C = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], off = side * (hw + th / 2 + gap);
        return { c: [C[0] + nx * off, C[1] + ny * off], ang };
      })));
    });
    const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
    // v2.4 pocket close-up: the scale bar searches along the bottom (then a row up, then another) for the first
    // spot >= 6 px clear of every campus outline, every stretch and the locator; the labels then avoid it
    if (pocketZoom) {
      const sb = svg.select("g.scale-bar"), loc = svg.select("g.locator");
      if (!sb.empty()) {
        const bb = sb.node().getBBox(), lr = loc.empty() ? null : pad(rel(loc.node()), 6);
        let best = null;
        for (const y of [mh - 18, mh - 40, mh - 62, mh - 84]) {
          for (let x = 16; x <= w - bb.width - 16 && !best; x += 4) {
            const b = [x + bb.x - 6, y + top + bb.y - 6, x + bb.x + bb.width + 6, y + top + bb.y + bb.height + 6];
            if (lr && hit(lr, b)) continue;
            if (outlines.some(([a, e]) => segRect(a, e, b) < 0.5)) continue;
            if (coloured.concat(context).some((s) => segRect(s.a, s.b, b) < s.hw + 0.5)) continue;
            best = [x, y];
          }
          if (best) break;
        }
        if (best) sb.attr("transform", `translate(${best[0]},${best[1]})`);
        furniture.length = 0;
        svg.selectAll("g.locator, g.scale-bar, g.north, g.key").each(function () { furniture.push(pad(rel(this), 3)); });
      }
    }

    /** A label of class cls, its centre searched over `anchors` (points it should sit next to); `cost`
        adds the label's own rules. Returns the text node, set where the total cost is lowest. */
    const placeBox = (cls, text, fill, anchors, cost, attrs, rect) => {
      const t = svg.append("text").attr("class", cls).attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", 0).attr("y", 0).text(text);
      if (fill) t.attr("fill", fill);
      Object.entries(attrs || {}).forEach(([k, v]) => t.attr(k, v));
      const bb = t.node().getBBox(), ox = bb.x + bb.width / 2, oy = bb.y + bb.height / 2;
      let best = null, bestCost = Infinity;
      anchors.forEach(({ p, r }) => [3, 8, 14, 22, 34].forEach((gap) => DIRS.forEach(([dx, dy]) => {
        const cx = p[0] + dx * (r + gap + bb.width / 2), cy = p[1] + dy * (r + gap + bb.height / 2);
        const b = [cx - bb.width / 2, cy - bb.height / 2, cx + bb.width / 2, cy + bb.height / 2];
        let c = inView(b, rect) ? 0 : 1000;
        c += furniture.filter((o) => hit(o, b)).length * 500 + placed.filter((o) => hit(o, pad(b, 4))).length * 500;
        c += wardBoxes.filter((o) => hit(o, b)).length * 40;
        if (onStretch(b)) c += 500;
        if (context.some((s) => segRect(s.a, s.b, b) < s.hw + 1)) c += 120;   // grey: cheaper than red
        c += cost(b) + gap * 0.05;
        if (c < bestCost) { bestCost = c; best = [cx, cy]; }
      })));
      t.attr("x", (best[0] - ox).toFixed(1)).attr("y", (best[1] - oy).toFixed(1));
      placed.push(rel(t.node()));
      return t;
    };

    // v2.4-S5: the road an "across the road" campus is across, as drawn: the stretch (red or grey) nearest the
    // pocket centre, grown end to end through stretches running the same way (UTH: Vo Oanh). Its label is set
    // upright beside this road and nowhere else; dish words leave it to that label. Task 8 fix 1: a panel grows it
    // from its own pocket centre over its own stretches (Sfn: that panel's lon/lat -> svg)
    const growRoad = (centre, all, Sfn) => {
      const pc = Sfn(centre), [lon, lat] = centre;
      const q1 = Sfn([lon + 10 / (111320 * Math.cos((lat * Math.PI) / 180)), lat]);
      const tol = 8 * Math.hypot(q1[0] - pc[0], q1[1] - pc[1]) / 10;      // 8 m, in px
      const dir = (s) => upright(Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]));
      const sameWay = (s, o) => { const d = Math.abs(dir(s) - dir(o)); return Math.min(d, Math.PI - d) < (25 * Math.PI) / 180; };
      const meet = (s, o) => [s.a, s.b].some((p) => [o.a, o.b].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol));
      const seed = all.reduce((m, s) => (ptSeg(pc, s.a, s.b) < ptSeg(pc, m.a, m.b) ? s : m), all[0]);
      const road = [seed];
      for (let grew = true; grew;) {
        grew = false;
        all.forEach((s) => { if (!road.includes(s) && road.some((o) => sameWay(s, o) && meet(s, o))) { road.push(s); grew = true; } });
      }
      return road;
    };
    /** Upright candidates beside the road: the label's centre over a road point, its near edge clear of the
        road all along the label's span, on the side away from the campus centre ctr. */
    const besideRoad = (road, ctr, tw, th) => {
      const pts = road.flatMap((s) => [s.a, s.b]), x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
      const yAt = (x) => road.filter((s) => s.a[0] !== s.b[0] && Math.min(s.a[0], s.b[0]) <= x && x <= Math.max(s.a[0], s.b[0]))
        .map((s) => ({ y: s.a[1] + ((x - s.a[0]) * (s.b[1] - s.a[1])) / (s.b[0] - s.a[0]), hw: s.hw }));
      const out = [];
      for (let cx = x0; cx <= x1; cx += 3) {
        const here = yAt(cx);
        if (!here.length) continue;
        const below = ctr[1] < d3.mean(here, (q) => q.y);
        const span = d3.range(cx - tw / 2, cx + tw / 2 + 0.1, Math.max(2, tw / 24)).flatMap(yAt);
        const edge = below ? d3.max(span, (q) => q.y + q.hw) : d3.min(span, (q) => q.y - q.hw);
        [2, 4, 7, 10, 14].forEach((gap) => out.push({ c: [cx, below ? edge + gap + th / 2 : edge - gap - th / 2], ang: 0 }));
      }
      return out;
    };

    // campus names: beside their own outline, off the coloured stretches. v2.4-S5 (Task 8): in a panel each one
    // carries its walking minutes ("name · walk label"); under 900 px the short name, on a spread the full name
    // wherever it fits (some spot by its outline inside its panel, clear of every stroke, outline, label and the
    // furniture), else the short name: a fit test, not a cost threshold. Set before the pocket names: a campus
    // name has one place to go (by its outline), a pocket's name can sit by any of its stretches
    campusList.forEach((c) => {
      if (pocketZoom || !c._ring) return;
      if (!data.panels && !c.label) return;
      const pn = c._panel, anchors = c._ring.map((p) => ({ p, r: 1 }));
      const edges = c._ring.slice(1).map((b, i) => [c._ring[i], b]);
      const text = (n) => (c.walk ? `${n} · ${c.walk.label}` : n);
      const clear = (b) => inView(b, pn.rect) && !furniture.some((o) => hit(o, b)) && !placed.some((o) => hit(o, pad(b, 4)))
        && !onStretch(b) && !context.some((s) => segRect(s.a, s.b, b) < s.hw + 1)
        && !outlines.some(([a, e]) => segRect(a, e, b) < 1.5);
      const fits = (label) => {
        const m = svg.append("text").attr("class", "campus-label").attr("dy", "0.35em").text(label);
        const bb = m.node().getBBox();
        m.remove();
        return anchors.some(({ p, r }) => [3, 8, 14, 22, 34].some((gap) => DIRS.some(([dx, dy]) => {
          const cx = p[0] + dx * (r + gap + bb.width / 2), cy = p[1] + dy * (r + gap + bb.height / 2);
          return clear([cx - bb.width / 2, cy - bb.height / 2, cx + bb.width / 2, cy + bb.height / 2]);
        })));
      };
      // Task 8 fix 1 (the user's close-up verdict, on the overview too): a campus "across the road" is named upright
      // beside the road it is across (UTH: Vo Oanh, on the side away from the campus), grown from this panel's own
      // pocket centre over this panel's stretches. The full name where it fits there clean, else the short one, else
      // the short one on two lines, then three; it never leaves the road
      const pk = data.panels && c.walk && c.walk.label === "across the road" && data.pockets.find((q) => q.id === pn.pocket);
      if (pk) {
        const road = growRoad(pk.centre, coloured.filter((q) => q.id === pk.id).concat(context.filter((q) => q.panel === pn)), pn.S);
        const ctr = [d3.mean(c._ring, (q) => q[0]), d3.mean(c._ring, (q) => q[1])];
        const size = (lines) => {
          const m = svg.append("text").attr("class", "campus-label");
          (Array.isArray(lines) ? lines : [lines]).forEach((l, i) => m.append("tspan").attr("x", 0).attr("dy", i ? "1.2em" : 0).text(l));
          const bb = m.node().getBBox();
          m.remove();
          return bb;
        };
        const boxAt = ([cx, cy], bb) => [cx - bb.width / 2, cy - bb.height / 2, cx + bb.width / 2, cy + bb.height / 2];
        const fitsBeside = (lines) => { const bb = size(lines);
          return besideRoad(road, ctr, bb.width, bb.height).some(({ c: q }) => clear(boxAt(q, bb))); };
        const short = text(c.short || c.name), full = text(c.name);
        const phoneW = window.matchMedia("(max-width: 899.98px)").matches;
        // the walk label broken at its spaces last ("across" / "the road"): the overview's tightest panels leave only
        // the room between two grey side streets
        const nm = c.short || c.name, wl = c.walk.label.split(" ");
        const stack = [[nm, c.walk.label], [nm, wl[0], wl.slice(1).join(" ")]].filter((ls) => ls.every(Boolean));
        const lines = !phoneW && full !== short && fitsBeside(full) ? full : fitsBeside(short) ? short
          : stack.find(fitsBeside) || stack[stack.length - 1];
        placeQuad("campus-label", lines, { "data-osm": c.osm }, (tw, th) => besideRoad(road, ctr, tw, th),
          ({ quad, box }) => {
            const d = Math.min(...edges.map(([a, e]) => segQuad(a, e, quad)));
            // it must read as beside this road: nearer it than any other stretch the panel draws
            const dRoad = Math.min(...road.map((q) => segQuad(q.a, q.b, quad) - q.hw));
            const near = coloured.concat(context).some((q) => !road.includes(q) && (q.panel === pn || q.id === pk.id)
              && segQuad(q.a, q.b, quad) - q.hw <= dRoad);
            return (clear(box) ? 0 : 600) + (near ? 200 : 0) + (d < 1.5 ? 400 : 0) + d * 0.5;   // clean, by the road, near its outline
          }, null, pn.rect);
        return;
      }
      let label = c.label;
      if (data.panels) {
        const short = text(c.short || c.name), full = text(c.name);
        label = window.matchMedia("(max-width: 899.98px)").matches || full === short || !fits(full) ? short : full;
      }
      placeBox("campus-label", label, null, anchors, (b) => {
        const d = Math.min(...edges.map(([a, e]) => segRect(a, e, b)));
        const crossOther = outlines.some(([a, e]) => !edges.some(([q]) => q === a) && segRect(a, e, b) < 1);
        return (crossOther ? 200 : 0) + (data.panels && d < 1.5 ? 400 : 0) + d;   // never across its own outline
      }, { "data-osm": c.osm }, pn.rect);
    });

    // pocket labels: beside their own stretches, never on a stretch, never nearer another pocket's
    if (data.labelled || !(data.key || pocketKey)) {
      data.pockets.forEach((p) => {
        const own = coloured.filter((s) => s.id === p.id), other = coloured.filter((s) => s.id !== p.id);
        const anchors = [];
        own.forEach((s) => [0, 0.5, 1].forEach((f) => anchors.push({
          p: [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f], r: s.hw })));
        placeBox("pocket-label", p.label, `var(--${p.slot})`, anchors, (b) => {
          const dOwn = Math.min(...own.map((s) => segRect(s.a, s.b, b) - s.hw));
          const dOther = other.length ? Math.min(...other.map((s) => segRect(s.a, s.b, b) - s.hw)) : Infinity;
          // v2.4-S5 (Task 8): never across a campus outline (a panel draws them beside the pocket); and never floating
          // more than 20 px off its own streets: the overview's grey context ring (120 to cross) must not push it away
          return (dOther <= dOwn + 3 ? 300 : 0) + (outlines.some(([a, e]) => segRect(a, e, b) < 1) ? 400 : 0)
            + (dOwn > 20 ? 200 : 0) + dOwn;
        }, { "data-id": p.id }, panelOf(p.id).rect);
      });
    }

    // v2.4 pocket close-up: each campus named once, one line "name · walk label" (a phone, < 900 px, uses the
    // short name), on or by its outline and never across it; no line, no ring. A campus "across the road"
    // keeps its label on the side facing the pocket (the road it is across: UTH's Vo Oanh) and over its
    // outline's span. The label may turn along a street when that tucks it closer (UTH at 1440)
    const phoneNames = window.matchMedia("(max-width: 899.98px)").matches;
    let acrossRoad = [];
    if (pocketZoom && data.pockets[0] && (data.campuses || []).some((c) => c.walk && c.walk.label === "across the road")) {
      acrossRoad = growRoad(data.pockets[0].centre, coloured.concat(context), S);
    }
    if (pocketZoom) (data.campuses || []).forEach((c) => {
      if (!c._ring) return;
      const nm = phoneNames ? c.short || c.name : c.name;
      const edges = c._ring.slice(1).map((b, i) => [c._ring[i], b]);
      const others = outlines.filter(([a]) => !c._ring.includes(a));
      const xs = c._ring.map((q) => q[0]), ys = c._ring.map((q) => q[1]);
      const ctr = [d3.mean(xs), d3.mean(ys)], pc = S(data.pockets[0].centre);
      // the side facing the pocket, as a map into a frame where that side is +y
      const across = c.walk && c.walk.label === "across the road";
      const dv = [pc[0] - ctr[0], pc[1] - ctr[1]];
      const into = Math.abs(dv[1]) >= Math.abs(dv[0]) ? (dv[1] > 0 ? (q) => q : (q) => [q[0], -q[1]])
        : dv[0] > 0 ? (q) => [q[1], q[0]] : (q) => [q[1], -q[0]];
      const R = c._ring.map(into), rx0 = Math.min(...R.map((q) => q[0])), rx1 = Math.max(...R.map((q) => q[0]));
      const env = (x) => {             // the outline's far edge (largest y) at x, clamped into its span
        const X = Math.max(rx0, Math.min(rx1, x));
        let y = -Infinity;
        for (let i = 1; i < R.length; i++) {
          const a = R[i - 1], b = R[i];
          if (a[0] === b[0]) { if (a[0] === X) y = Math.max(y, a[1], b[1]); }
          else if ((a[0] - X) * (b[0] - X) <= 0) y = Math.max(y, a[1] + ((X - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
        }
        return y;
      };
      const onSide = (quad) => { const Q = quad.map(into);
        return Q.every((q) => q[1] >= env(q[0])) && Math.min(...Q.map((q) => q[0])) < rx1 && Math.max(...Q.map((q) => q[0])) > rx0; };
      const near = coloured.concat(context).filter((s) => Math.min(...edges.map(([a, e]) => Math.min(ptSeg(a, s.a, s.b), ptSeg(e, s.a, s.b)))) < 60);
      const fs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      const cost = ({ quad, ang }) => {
        const d = Math.min(...edges.map(([a, e]) => segQuad(a, e, quad)));
        let k = d < 1.5 ? 400 : 0;                                        // never on or across its outline
        if (others.some(([a, e]) => segQuad(a, e, quad) < 1.5)) k += 400;
        if (across && !onSide(quad)) k += 300;                           // the facing side first, but never at the cost of a red stretch
        if (ang) k += 8 + Math.abs((ang * 180) / Math.PI) * 0.3;          // upright unless turning tucks it closer
        return k + d;
      };
      const text = (n) => (c.walk ? `${n} · ${c.walk.label}` : n);
      // v2.4-S6 (final review I1): HUTECH's why-anchor rides on its label as a note (street-label size; two lines
      // on a phone), so the anchor is no element of its own. The block stays upright, by its outline and outside it,
      // nearer it than any other campus (the anchor's own rules)
      if (c.note) {
        const lines = [text(nm), ...(phoneNames ? c.note_lines : [c.note]).map((s) => ({ s, cls: "campus-note" }))];
        placeQuad("campus-label", lines, { "data-osm": c.osm },
          // above or below a ring point the block may also slide sideways (a multi-line block is wide)
          (tw, th) => around(c._ring, tw, th).concat(around(c._ring, tw, th).filter((q, i) => DIRS[i % 8][1] && !DIRS[i % 8][0])
            .flatMap((q) => [-0.5, -0.25, 0.25, 0.5].map((f) => ({ c: [q.c[0] + f * tw, q.c[1]], ang: 0 })))),
          (q) => {
            const d = Math.min(...edges.map(([a, e]) => segQuad(a, e, q.quad)));
            const dO = others.length ? Math.min(...others.map(([a, e]) => segQuad(a, e, q.quad))) : Infinity;
            let k = cost(q);
            if (q.quad.some((p) => (c._rings || []).some((R) => inPoly(p, R)))) k += 400;   // outside its campus
            if (dO <= d + 4) k += 300;                                                        // nearer its own outline
            return k + d * 0.5;
          });
        return;
      }
      if (across && acrossRoad.length) {
        // v2.4-S5 (user verdict): upright beside the road it is across, at every width. The full name is kept
        // whenever it FITS there: some upright spot inside the hero, clear of every red and grey stretch, every
        // outline, the furniture and the labels already set. Only when none exists does it take the short name
        // rather than leave the road (fix round 2: a fit test, not a cost threshold)
        const clean = (quad) => {
          const xs = quad.map((q) => q[0]), ys = quad.map((q) => q[1]);
          return inView([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
            && !furniture.some((o) => quadsHit(quad, boxQuad(o)))
            && !placed.some((o) => quadsHit(quad, boxQuad(pad(o, 4))))
            && !coloured.some((s) => segQuad(s.a, s.b, quad) < s.hw + 1.5)
            && !context.some((s) => segQuad(s.a, s.b, quad) < s.hw + 1)
            && !outlines.some(([a, e]) => segQuad(a, e, quad) < 1.5);
        };
        const fits = (label) => {
          const m = svg.append("text").attr("class", "campus-label").attr("dy", "0.35em").text(label);
          const bb = m.node().getBBox();
          m.remove();
          return besideRoad(acrossRoad, ctr, bb.width, bb.height).some(({ c: [cx, cy] }) => clean([
            [cx - bb.width / 2, cy - bb.height / 2], [cx + bb.width / 2, cy - bb.height / 2],
            [cx + bb.width / 2, cy + bb.height / 2], [cx - bb.width / 2, cy + bb.height / 2]]));
        };
        const label = !c.short || nm === c.short || fits(text(nm)) ? text(nm) : text(c.short);
        // a clean spot always beats one on a grey stretch, even off the facing side
        placeQuad("campus-label", label, { "data-osm": c.osm }, (tw, th) => besideRoad(acrossRoad, ctr, tw, th),
          (q) => cost(q) + (clean(q.quad) ? 0 : 600));
        return;
      }
      placeQuad("campus-label", text(nm), { "data-osm": c.osm }, (tw, th) =>
        around(c._ring, tw, th)
          .concat(along(near.map((s) => [s.a, s.b, s.hw]), tw, th, fs, [2, 4, 7]))
          .concat(along(edges.filter(([a, e]) => Math.hypot(e[0] - a[0], e[1] - a[1]) > 20).map(([a, e]) => [a, e, 0]), tw, th, fs, [3, 6])),
      cost);
    });

    // v2.4 dish words: each set along the stretch its own places snap to (dish_words[].segment_index), just
    // clear of the stroke, never inside or across a campus outline; the pocket label's size and colour. Placed
    // after the campus labels (they avoid every label already set), before the oddities. v2.4-S6 (final review I1):
    // a word with at most two stretches has little room, so it is set before the street names; a word with more
    // (Little Tokyo's) after them, so on a phone the street the title names keeps its one clear run
    const kor = data.pockets[0];
    const rings = pocketZoom ? (data.campuses || []).flatMap((c) => c._rings || []) : [];
    const dishes = [];   // words already set: {s: their stretch, quad}
    const setDish = (dw) => {
      // its main stretch first; another stretch carrying its places costs a little more (segment_indices)
      const own = (dw.segment_indices || [dw.segment_index]).map((si, rank) => ({ rank,
        s: coloured.find((q) => q.id === kor.id && q.i === si) })).filter((o) => o.s);
      if (!own.length) return;
      const fs = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];   // v2.4-S5: the ends too (Little Tokyo's short stretches)
      let chosen = own[0].s, chosenQuad = null;
      const t = placeQuad("dish-word", dw.word, { fill: `var(--${kor.slot})` },
        (tw, th) => own.flatMap(({ s, rank }) => along([[s.a, s.b, s.hw]], tw, th, fs, [2, 3.5, 5, 8, 11])
          .map((c) => ({ ...c, s, rank }))),
        ({ quad, cand }) => {
          let k = cand.rank ? 30 : 0;
          if (outlines.some(([a, e]) => segQuad(a, e, quad) < 1.5)) k += 400;       // across an outline
          if (quad.some((q) => rings.some((R) => inPoly(q, R)))) k += 400;          // reads as the campus's
          // v2.4-S5: the road a campus is across carries that campus's label, not a dish word
          if (own.length > 1 && acrossRoad.includes(cand.s)) k += 200;
          // the word's centre over its own stretch, not hanging past its end onto the next one
          const ctr = [d3.mean(quad, (q) => q[0]), d3.mean(quad, (q) => q[1])];
          const dx = cand.s.b[0] - cand.s.a[0], dy = cand.s.b[1] - cand.s.a[1];
          const f = ((ctr[0] - cand.s.a[0]) * dx + (ctr[1] - cand.s.a[1]) * dy) / (dx * dx + dy * dy || 1);
          if (f < 0 || f > 1) k += 150;
          // v2.4-S5 (Task 7): nearer its own stretch than any other coloured one (Little Tokyo: the Western too)
          const dOwn = ptSeg(ctr, cand.s.a, cand.s.b);
          if (coloured.some((q) => q !== cand.s && ptSeg(ctr, q.a, q.b) < dOwn)) k += 150;
          // two words never side by side, and never one run on one side of the road ("kimbap mì cay")
          const u = [Math.cos(cand.ang), Math.sin(cand.ang)], pr = (Q) => Q.map((q) => q[0] * u[0] + q[1] * u[1]);
          const side = (Q, s) => Math.sign(cross(s.a[1] <= s.b[1] ? s.a : s.b, s.a[1] <= s.b[1] ? s.b : s.a,
            [d3.mean(Q, (q) => q[0]), d3.mean(Q, (q) => q[1])]));
          dishes.forEach((o) => {
            const p = pr(quad), q = pr(o.quad), gap = Math.max(Math.min(...q) - Math.max(...p), Math.min(...p) - Math.max(...q));
            if (o.s === cand.s) k += 300;
            // v2.4-S5 (Task 7): only a word close across the text direction can read beside this one; on
            // Little Tokyo's spread-out stretches two far-apart words may share a band
            const off = Math.abs((d3.mean(quad, (v) => v[0]) - d3.mean(o.quad, (v) => v[0])) * -u[1]
              + (d3.mean(quad, (v) => v[1]) - d3.mean(o.quad, (v) => v[1])) * u[0]);
            if (off < DISH_NEAR_PX && (gap < 0 || (gap < 16 && side(quad, cand.s) === side(o.quad, o.s)))) k += 200;
            // ... and two words on one line of text ("ramen sushi") keep that gap too, whatever their stretches
            const th = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
            if (off < 0.8 * th && gap < 2 * th) k += 200;   // two line-heights: a word space is far smaller
          });
          cand.quad = quad;
          return k + segQuad(cand.s.a, cand.s.b, quad) * 0.5;
        }, (cand) => { chosen = cand.s; chosenQuad = cand.quad; });
      t.attr("data-seg", chosen.i);
      dishes.push({ s: chosen, quad: chosenQuad });
    };
    const zoomWords = pocketZoom ? (data.dish_words || []) : [];
    const roomy = (dw) => (dw.segment_indices || [dw.segment_index]).length > 2;
    zoomWords.filter((dw) => !roomy(dw)).forEach(setDish);

    // street names: along a straight stretch of the named street, upright, off the coloured stretches
    // and every label above; on a phone only the street the headline names. v2.4-S5 (Task 7): set before the
    // oddities and every dish word with more than two stretches, so on a phone the street the title names keeps its
    // one clear run (v2.4-S6: a word with two stretches or fewer is set first, above)
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
            // v2.4-S5: a short stretch crossing the label can slip between those sample points; test the label's
            // own quad as well
            const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + i * (tw / 2 + 2) * ux + j * (th / 2) * nx,
              cy + i * (tw / 2 + 2) * uy + j * (th / 2) * ny]);
            if (coloured.some((sg) => segQuad(sg.a, sg.b, quad) < sg.hw + 1)) c += 300;
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

    zoomWords.filter(roomy).forEach(setDish);

    // (v2.4-S6: the why-anchor is HUTECH's campus-label note, set with the campus labels above)

    // v2.4-S5 (Task 8): an overview's dish words, each only where its text fits along one of its own stretches at
    // this width (else omitted here): the stretch at least DISH_FIT_PAD longer than the word at each end. Set along
    // that stretch, its whole length over it, like the close-up's
    if (!pocketZoom) data.pockets.forEach((p) => (p.dish_words || []).forEach((dw) => {
      const pn = panelOf(p.id);
      const m = svg.append("text").attr("class", "dish-word").text(dw.word);
      const tw0 = m.node().getBBox().width;
      m.remove();
      const len = (s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const own = (dw.segment_indices || [dw.segment_index]).map((si, rank) => ({ rank,
        s: coloured.find((q) => q.id === p.id && q.i === si) })).filter((o) => o.s && len(o.s) >= tw0 + 2 * DISH_FIT_PAD);
      if (!own.length) return;
      const rings = campusList.flatMap((c) => c._rings || []);
      let chosen = own[0].s;
      const t = placeQuad("dish-word", dw.word, { fill: `var(--${p.slot})`, "data-pocket": p.id },
        (tw, th) => own.flatMap(({ s, rank }) => {
          // every centre that keeps the whole word over the stretch, in 5 % steps from the middle out
          const L = len(s), lo = (tw / 2 + DISH_FIT_PAD) / L, fs = d3.range(0, 0.51, 0.05).flatMap((d) => [0.5 - d, 0.5 + d])
            .filter((f) => f >= lo && f <= 1 - lo);
          return along([[s.a, s.b, s.hw]], tw, th, fs.length ? fs : [0.5], [2, 3.5, 5, 8]).map((c) => ({ ...c, s, rank }));
        }),
        ({ quad, cand }) => {
          let k = cand.rank ? 30 : 0;
          if (outlines.some(([a, e]) => segQuad(a, e, quad) < 1.5)) k += 400;
          if (quad.some((q) => rings.some((R) => inPoly(q, R)))) k += 400;
          const ctr = [d3.mean(quad, (q) => q[0]), d3.mean(quad, (q) => q[1])];
          if (coloured.some((q) => q !== cand.s && ptSeg(ctr, q.a, q.b) < ptSeg(ctr, cand.s.a, cand.s.b))) k += 150;
          // across a grey stretch only when nothing else is left (placeQuad's 120 is below the rule above)
          if (context.some((q) => segQuad(q.a, q.b, quad) < q.hw + 1)) k += 200;
          return k + segQuad(cand.s.a, cand.s.b, quad) * 0.5;
        }, (cand) => { chosen = cand.s; }, pn.rect);
      t.attr("data-seg", chosen.i);
    }));

    // v2.3.1: name the hatched ground where it covers >= 8 % of a panel: one label, off every mark and
    // label above, on the hatch (its corners outside the district, not in a campus), as far from the
    // district edge as it will go. The neighbouring district is not named
    if (data.panels) {
      const inside = (pn, q) => d3.geoContains(base.outline, pn.proj.invert([q[0] - pn.x, q[1] - pn.y - top]));
      const inRing = (q, R) => {
        let c = false;
        for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
          if ((R[i][1] > q[1]) !== (R[j][1] > q[1])
            && q[0] < ((R[j][0] - R[i][0]) * (q[1] - R[i][1])) / (R[j][1] - R[i][1]) + R[i][0]) c = !c;
        }
        return c;
      };
      const og = base.outline.type === "Feature" ? base.outline.geometry : base.outline;
      const outlinePolys = og.type === "Polygon" ? [og.coordinates] : og.coordinates;
      panels.forEach((pn) => {
        const [x0, y0, x1, y1] = pn.rect;
        let out = 0, n = 0;
        for (let gx = 0.5; gx < 24; gx++) for (let gy = 0.5; gy < 24; gy++) {
          n++;
          if (!inside(pn, [x0 + (gx / 24) * pn.pw, y0 + (gy / 24) * pn.ph])) out++;
        }
        if (out / n < 0.08) return;
        const edge = outlinePolys.flatMap((poly) => poly.flatMap((r) => {
          const P = r.map(pn.S);
          return P.slice(1).map((b, i) => [P[i], b]);
        }));
        const t = pn.g.append("text").attr("class", "beyond-label").attr("text-anchor", "middle").attr("dy", "0.35em")
          .attr("x", 0).attr("y", 0).text("Outside Bình Thạnh");
        const bb = t.node().getBBox(), ox = bb.x + bb.width / 2, oy = bb.y + bb.height / 2;
        const campusRings = campusList.filter((c) => c._panel === pn).flatMap((c) => c._rings || []);
        // across first; turned up the strip (as the sheet's "Beyond this sheet") when the hatch is too narrow
        const search = (bw, bh) => {
          let best = null, bestD = -1;
          for (let cy = y0 + bh / 2 + 8; cy <= y1 - bh / 2 - 8; cy += 6) {
            for (let cx = x0 + bw / 2 + 8; cx <= x1 - bw / 2 - 8; cx += 6) {
              const b = [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2];
              if (!inView(b, pn.rect)) continue;
              const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [cx, cy],
                [cx, b[1]], [cx, b[3]], [b[0], cy], [b[2], cy]];
              if (pts.some((q) => inside(pn, q))) continue;
              if (pts.some((q) => campusRings.some((R) => inRing(q, R)))) continue;
              const bp = pad(b, 3);
              if (furniture.some((o) => hit(o, bp)) || placed.some((o) => hit(o, pad(b, 4)))) continue;
              if (wardBoxes.some((o) => hit(o, b)) || onStretch(bp)) continue;
              if (outlines.some(([a, e]) => segRect(a, e, b) < 3)) continue;
              const d = Math.min(...edge.map(([a, e]) => segRect(a, e, b)));
              if (d > bestD) { bestD = d; best = [cx, cy]; }
            }
          }
          return best;
        };
        let best = search(bb.width, bb.height), turned = false;
        if (!best) { best = search(bb.height, bb.width); turned = !!best; }
        if (!best) { t.remove(); return; }                 // no clean spot on the hatch: say nothing
        if (turned) {
          t.attr("x", null).attr("y", null).attr("transform",
            `translate(${(best[0] - pn.x).toFixed(1)},${(best[1] - pn.y - top).toFixed(1)}) rotate(90) translate(${(-ox).toFixed(1)},${(-oy).toFixed(1)})`);
        } else {
          t.attr("x", (best[0] - ox - pn.x).toFixed(1)).attr("y", (best[1] - oy - pn.y - top).toFixed(1));
        }
        placed.push(rel(t.node()));
      });
    }

    // v2.4 oddities: a named one-off, upright, with a short leader (<= 24 px) from its own grey stretch to the
    // name; never a dot
    if (pocketZoom) (data.oddities || []).forEach((od) => {
      const s = context.find((q) => q.i === od.segment_index);
      if (!s) return;
      const rings = (data.campuses || []).flatMap((c) => c._rings || []);
      // a street name beside it would read as one run ("Quán Thái Sawasdee Phạm Viết Chánh"): keep 12 px clear
      const streetBoxes = [];
      svg.selectAll("text.street-label").each(function () { streetBoxes.push(pad(rel(this), 12)); });
      const near = (box) => {            // the leader: stroke edge -> the name's nearest box point
        const c = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy || 1;
        const f = Math.max(0.1, Math.min(0.9, ((c[0] - s.a[0]) * dx + (c[1] - s.a[1]) * dy) / L2));
        const p = [s.a[0] + f * dx, s.a[1] + f * dy];
        const q = [Math.max(box[0], Math.min(box[2], p[0])), Math.max(box[1], Math.min(box[3], p[1]))];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        return { a: [p[0] + ((q[0] - p[0]) / L) * s.hw, p[1] + ((q[1] - p[1]) / L) * s.hw], b: q, len: L - s.hw };
      };
      const fs = [0.2, 0.35, 0.5, 0.65, 0.8, 0.1, 0.9];
      const pts = fs.map((f) => [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f]);
      const g = svg.append("g").attr("class", "oddity").attr("data-id", od.id).attr("data-seg", od.segment_index);
      const place = (text) => placeQuad("oddity-label", text, {},
        (tw, th) => pts.flatMap((p) => [8, 12, 16, 5, 20].flatMap((gap) => DIRS.map(([dx, dy]) =>
          ({ c: [p[0] + dx * (s.hw + gap + tw / 2), p[1] + dy * (s.hw + gap + th / 2)], ang: 0 })))),
        ({ quad, box }) => {
          const l = near(box);
          let k = l.len > 24 || l.len < 5 ? 600 : 0;
          if (outlines.some(([a, e]) => segQuad(a, e, quad) < 1.5)) k += 400;
          if (quad.some((q) => rings.some((R) => inPoly(q, R)))) k += 400;
          if (coloured.some((r) => segQuad(r.a, r.b, [l.a, l.b, l.b, l.a]) < r.hw)) k += 300;   // leader over red
          if (streetBoxes.some((o) => quadsHit(quad, boxQuad(o)))) k += 200;
          // v2.4-S5 fix 2: a grey one-off set close to the colour reads as one of the pocket's own listings
          if (coloured.some((r) => segQuad(r.a, r.b, quad) < r.hw + 12)) k += 250;
          return k + l.len * 0.5;
        });
      let t = place(od.name);
      // v2.4-S5 (Task 7): where a one-line name finds no clear spot (Little Tokyo on a phone), it breaks into
      // two lines at the space nearest its middle
      const sp = [...od.name].map((ch, i) => (ch === " " ? i : -1)).filter((i) => i > 0);
      if (+t.attr("data-cost") >= 500 && sp.length) {
        const at = sp.reduce((a, b) => (Math.abs(b - od.name.length / 2) < Math.abs(a - od.name.length / 2) ? b : a));
        const t2 = place([od.name.slice(0, at), od.name.slice(at + 1)]);
        if (+t2.attr("data-cost") < +t.attr("data-cost")) {
          placed.splice(placed.length - 2, 1);   // t's box (placeQuad pushed t, then t2)
          t.remove();
          t = t2;
        } else { placed.pop(); t2.remove(); }
      }
      const l = near(rel(t.node()));                 // the placed name's box, svg coordinates
      g.append("line").attr("class", "oddity-leader")
        .attr("x1", l.a[0].toFixed(1)).attr("y1", l.a[1].toFixed(1)).attr("x2", l.b[0].toFixed(1)).attr("y2", l.b[1].toFixed(1));
      g.node().appendChild(t.node());
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
