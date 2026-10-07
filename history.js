// history.js — district history ribbon from history.json.
// LOCKED DESIGN (docs/dataviz-D-decision.md):
//   - Horizontal time axis, beats (dots) placed by year, lanes by type.
//   - 5 lanes: heritage / food / riverside / bridge / knot (top→bottom).
//   - Undated beats in a SEPARATE qualitative rail (hollow dots + era caption).
//   - Guided STEPPER: intro → era steps → explorer (full clickable ribbon).
//   - Palette: TYPE_COLOR from hubs.js verbatim.
//   - Gradient-core dot accent (not feGaussianBlur).
(function () {
  "use strict";

  // ── HTML escape helper (safe interpolation of Vietnamese titles) ──────────
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Palette (verbatim from hubs.js) ──────────────────────────────────────
  const TYPE_COLOR = {
    heritage: "#8a5a2b",
    food:     "#b5532a",
    riverside:"#2f7d8a",
    bridge:   "#6a6f3a",
    knot:     "#7a6a6a"
  };
  const TYPE_FALLBACK = "#7a6a6a";
  const LANE_ORDER = ["heritage", "food", "riverside", "bridge", "knot"];

  // ── Ribbon drawing ────────────────────────────────────────────────────────
  // Returns a render(slot) function for the Stepper.
  // highlightPredicate(beat) → true = full opacity, false = dimmed (null = all visible).
  function makeRibbon(dated, undated, { highlightPredicate = null, clickable = true } = {}) {
    return function render(slot) {
      slot.className = "ribbon-slot";

      const W = 880, PAD_L = 52, PAD_R = 36, PAD_T = 18, LANE_H = 34, AXIS_Y_OFFSET = 10;
      const LANES = LANE_ORDER.length;
      const DATED_H = LANES * LANE_H + PAD_T + AXIS_Y_OFFSET + 24; // axis label space
      const UNDATED_H = undated.length > 0 ? 64 + undated.length * 0 + 28 : 0; // rail height
      const H = DATED_H + (undated.length ? UNDATED_H + 12 : 0);

      const years = dated.map((b) => b.year);
      const yMin = Math.min(...years), yMax = Math.max(...years);
      // Pad domain a bit so edge beats aren't clipped
      const xScale = d3.scaleLinear([yMin - 5, yMax + 5], [PAD_L, W - PAD_R]);
      const laneY = (type) => {
        const idx = LANE_ORDER.indexOf(type);
        const i = idx >= 0 ? idx : LANE_ORDER.length - 1;
        return PAD_T + AXIS_Y_OFFSET + i * LANE_H + LANE_H / 2;
      };

      // Outer scroll wrapper for small screens
      const wrap = document.createElement("div");
      wrap.className = "ribbon-scroll";

      const svg = d3.select(wrap).append("svg")
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("width", W)
        .attr("height", H)
        .attr("role", "img")
        .attr("aria-label", "Timeline of district history beats");

      // ── Defs: gradient-core accent for beat glow ──────────────────────
      const defs = svg.append("defs");
      LANE_ORDER.forEach((type) => {
        const col = TYPE_COLOR[type] || TYPE_FALLBACK;
        const grad = defs.append("radialGradient")
          .attr("id", `bg-${type}`)
          .attr("cx", "40%").attr("cy", "35%")
          .attr("r", "65%");
        grad.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 0.55);
        grad.append("stop").attr("offset", "100%").attr("stop-color", col).attr("stop-opacity", 1);
      });
      // Hollow-dot gradient for undated
      const undGrad = defs.append("radialGradient").attr("id", "bg-undated")
        .attr("cx", "40%").attr("cy", "35%").attr("r", "65%");
      undGrad.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 0.8);
      undGrad.append("stop").attr("offset", "100%").attr("stop-color", "#fff").attr("stop-opacity", 0);

      // ── Lane separators (light horizontal rules) ──────────────────────
      LANE_ORDER.forEach((type, i) => {
        const y = PAD_T + AXIS_Y_OFFSET + i * LANE_H;
        svg.append("line")
          .attr("x1", PAD_L - 4).attr("x2", W - PAD_R + 4)
          .attr("y1", y).attr("y2", y)
          .attr("stroke", "#e4ddcf").attr("stroke-width", 0.5);
        // Lane label
        svg.append("text")
          .attr("x", PAD_L - 8).attr("y", y + LANE_H / 2 + 4)
          .attr("text-anchor", "end")
          .attr("class", "lane-label")
          .text(type);
      });
      // Bottom lane rule
      const bottomY = PAD_T + AXIS_Y_OFFSET + LANES * LANE_H;
      svg.append("line")
        .attr("x1", PAD_L - 4).attr("x2", W - PAD_R + 4)
        .attr("y1", bottomY).attr("y2", bottomY)
        .attr("stroke", "#e4ddcf").attr("stroke-width", 0.5);

      // ── Time axis ────────────────────────────────────────────────────
      const axisY = bottomY + 16;
      svg.append("line")
        .attr("x1", PAD_L).attr("x2", W - PAD_R)
        .attr("y1", axisY).attr("y2", axisY)
        .attr("stroke", "#cdbfa6").attr("stroke-width", 1.5);

      // Axis ticks at century/half-century marks
      [1800, 1850, 1900, 1950, 2000].forEach((yr) => {
        if (yr < yMin - 20 || yr > yMax + 20) return;
        const x = xScale(yr);
        svg.append("line")
          .attr("x1", x).attr("x2", x)
          .attr("y1", axisY - 4).attr("y2", axisY + 4)
          .attr("stroke", "#a09080").attr("stroke-width", 1);
        svg.append("text")
          .attr("x", x).attr("y", axisY + 16)
          .attr("text-anchor", "middle")
          .attr("class", "axis-tick")
          .text(yr);
      });

      // ── Tooltip div ──────────────────────────────────────────────────
      const tip = d3.select(wrap).append("div").attr("class", "ribbon-tip").style("opacity", 0);

      function showTip(event, b) {
        const srcLink = b.source
          ? `<a href="${b.source}" target="_blank" rel="noopener">source ↗</a>`
          : "";
        const hubLink = clickable
          ? `<a href="${b.href}" class="tip-hub">Go to ${b.title} →</a>`
          : `<em>${b.title}</em>`;
        tip.html(
          `<b>${b.title}</b> · <span class="tip-era">${b.era}</span><br>` +
          `<span class="tip-fact">${b.fact}</span><br>` +
          `<span class="tip-links">${srcLink} ${hubLink}</span>`
        ).style("opacity", 1);
        // Position near cursor but keep inside wrapper
        const wRect = wrap.getBoundingClientRect();
        const ex = (event.clientX || 0) - wRect.left + 12;
        tip.style("left", Math.min(ex, W - 320) + "px").style("top", "4px");
      }
      function hideTip() { tip.style("opacity", 0); }

      // ── Dated beats ──────────────────────────────────────────────────
      const beatG = svg.append("g").attr("class", "beats-dated");
      const beatEls = beatG.selectAll("a.beat")
        .data(dated)
        .join("a")
        .attr("href", (b) => clickable ? b.href : null)
        .attr("class", "beat")
        .attr("aria-label", (b) => `${b.title} ${b.year}: ${b.era}`);

      beatEls.append("circle")
        .attr("cx", (b) => xScale(b.year))
        .attr("cy", (b) => laneY(b.type))
        .attr("r", 7)
        .attr("fill", (b) => `url(#bg-${b.type})`)
        .attr("stroke", (b) => TYPE_COLOR[b.type] || TYPE_FALLBACK)
        .attr("stroke-width", 1.5)
        .attr("class", "beat-circle");

      // Year label below each beat
      beatEls.append("text")
        .attr("x", (b) => xScale(b.year))
        .attr("y", (b) => laneY(b.type) + 18)
        .attr("text-anchor", "middle")
        .attr("class", "beat-year")
        .text((b) => b.year);

      // Highlight / dim logic
      if (highlightPredicate !== null) {
        beatEls.style("opacity", (b) => highlightPredicate(b) ? 1 : 0.12);
      }

      beatEls
        .on("mouseenter focus", (e, b) => showTip(e, b))
        .on("mouseleave blur", hideTip);

      // ── Undated rail ─────────────────────────────────────────────────
      if (undated.length) {
        const RAIL_Y = bottomY + 40;
        const RAIL_LABEL_Y = RAIL_Y + 14;
        const DOT_SPACING = (W - PAD_L - PAD_R) / Math.max(undated.length, 1);
        const DOT_CX = (i) => PAD_L + i * DOT_SPACING + DOT_SPACING / 2;
        const DOT_CY = RAIL_Y + 28;

        // Rail header
        svg.append("text")
          .attr("x", PAD_L).attr("y", RAIL_LABEL_Y)
          .attr("class", "undated-rail-label")
          .text("Undated / qualitative — placed by hub, not by year");

        const undG = svg.append("g").attr("class", "beats-undated");
        const undEls = undG.selectAll("a.beat-und")
          .data(undated)
          .join("a")
          .attr("href", (b) => clickable ? b.href : null)
          .attr("class", "beat-und")
          .attr("aria-label", (b) => `${b.title} (undated): ${b.era}`);

        undEls.append("circle")
          .attr("cx", (b, i) => DOT_CX(i))
          .attr("cy", DOT_CY)
          .attr("r", 7)
          .attr("fill", "none")
          .attr("stroke", (b) => TYPE_COLOR[b.type] || TYPE_FALLBACK)
          .attr("stroke-width", 2)
          .attr("class", "beat-circle-undated");

        undEls.append("text")
          .attr("x", (b, i) => DOT_CX(i))
          .attr("y", DOT_CY + 18)
          .attr("text-anchor", "middle")
          .attr("class", "beat-era-und")
          .text((b) => b.era.length > 14 ? b.era.slice(0, 12) + "…" : b.era);

        undEls
          .on("mouseenter focus", (e, b) => showTip(e, b))
          .on("mouseleave blur", hideTip);
      }

      slot.append(wrap);
    };
  }

  // ── Main ──────────────────────────────────────────────────────────────────
  Promise.all([d3.json("history.json"), d3.json("hubs.json")]).then(function ([data, hubsData]) {
    // Build a rank+title lookup keyed by hub id (e.g. "hub:4")
    const hubMeta = new Map(
      (hubsData.hubs || []).map(function (h) { return [h.id, { rank: h.rank, title: h.title }]; })
    );

    // Render excluded corners as a quiet chip row instead of a wall paragraph.
    // #excluded-note is a <p>; put chips as a sibling <div> (valid HTML).
    const noteEl = document.getElementById("excluded-note");
    if (noteEl) {
      if (data.excluded && data.excluded.length > 0) {
        // Set the honesty text on the <p> itself; .gap-note styles it
        noteEl.classList.add("gap-note");
        noteEl.textContent = data.excluded_note || "";
        // Build chip HTML for each excluded hub id
        const chips = data.excluded.map(function (id) {
          const meta = hubMeta.get(id);
          if (!meta) return "";
          return '<a class="excluded-chip" href="hub.html?h=' + meta.rank + '">' + esc(meta.title) + '</a>';
        }).join("");
        // Insert chips div as sibling AFTER the <p> (not inside it — invalid HTML)
        noteEl.insertAdjacentHTML("afterend", '<div class="gap-chips">' + chips + '</div>');
      } else {
        // Nothing excluded → no wall, no chips
        noteEl.classList.remove("gap-note");
        noteEl.textContent = "";
      }
    }

    const dated   = data.beats.filter((b) => b.dated && b.year !== null);
    const undated = data.beats.filter((b) => !b.dated || b.year === null);

    // Era spans for guided steps
    const ERA_STEPS = [
      {
        label:   "The colonial era, 1831–1902",
        kicker:  "Era 1",
        headline:"Tombs, bridges and the <em>first rail</em>",
        narr:    "Lê Văn Duyệt's tomb was raised after 1831. Half a century later, the French built Bình Lợi Railway Bridge — the first crossing of the Saigon River — completing it in 1902. These two beats anchor the earliest layer of the district's recorded history.",
        pred:    (b) => b.year !== null && b.year <= 1910
      },
      {
        label:   "The mid-century, 1912–1961",
        kicker:  "Era 2",
        headline:"Streets named, roads built, <em>a port founded</em>",
        narr:    "Streets earned their names from colonial-era figures (N'Trang Lơng 1912, Điện Biên Phủ 1954). The Hanoi Highway confirmed Hàng Xanh as a major node. Newport — a US Army logistics port — opened by 1967 on the Saigon River bank that would later become Vinhomes.",
        pred:    (b) => b.year !== null && b.year >= 1911 && b.year <= 1967
      },
      {
        label:   "Post-1975 to the present",
        kicker:  "Era 3",
        headline:"Reunification, <em>renovation, Landmark 81</em>",
        narr:    "After 1975 the port became state property. A World Bank canal restoration began in 2002. By 2018 Landmark 81 rose 461 m above the former Newport site — and in 2020 Đinh Tiên Hoàng Street was restored to its pre-1975 name, Lê Văn Duyệt.",
        pred:    (b) => b.year !== null && b.year >= 1975
      }
    ];

    const steps = [
      // Step 0: intro
      {
        kind:     "intro",
        kicker:   "Field Guide · The Hubs",
        headline: "Three centuries of <em>Bình Thạnh</em> in dated facts",
        narrative:"Each beat on this ribbon is a fact that cleared our two-independent-sources gate. " +
          "Colour encodes the hub's type (heritage, food, riverside, bridge, knot). " +
          "Undated or qualitative events appear in a separate rail below the axis — " +
          "we don't invent a year for 'early 18th century' or 'annual festival.'"
      },
      // Steps 1–3: guided era steps
      ...ERA_STEPS.map((era) => ({
        kind:      "data",
        kicker:    era.kicker,
        headline:  era.headline,
        narrative: era.narr,
        render:    makeRibbon(dated, [], { highlightPredicate: era.pred, clickable: false })
      })),
      // Final step: full explorer
      {
        kind:      "data",
        kicker:    "All 21 dated beats",
        headline:  "The full ribbon — <em>tap any beat</em> to visit its hub",
        narrative: "Every dated history entry, placed on the axis. The undated and qualitative " +
          "beats appear in the rail below. Click any beat to open its Field Guide page.",
        cta:       "Start over ↺",
        render:    makeRibbon(dated, undated, { highlightPredicate: null, clickable: true })
      }
    ];

    const el = document.getElementById("history-stepper");
    window.Stepper.mount(el, steps);

  }).catch(function (err) {
    const main = document.getElementById("history-main");
    if (main) {
      main.innerHTML = `<pre style="color:#c00;padding:1rem">Failed to load history.json: ${err}</pre>`;
    }
  });
})();
