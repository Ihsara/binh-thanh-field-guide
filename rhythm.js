// rhythm.js — small-multiple radial day-clocks from rhythm.json.
// authored editorial intensity on a 0–2 scale (time_of_day field), NOT footfall.
// Glow = radial gradient-core on dark fill (Bremer technique), NOT feGaussianBlur.
(function () {
  "use strict";

  // TYPE_COLOR — verbatim from hubs.js live palette
  const TYPE_COLOR = {
    heritage: "#8a5a2b",
    food:     "#b5532a",
    riverside:"#2f7d8a",
    bridge:   "#6a6f3a",
    knot:     "#7a6a6a"
  };
  const FALLBACK_COLOR = "#7a6a6a";

  // Period labels for hover tooltip
  const PERIOD_LABELS = [
    { key: "morning", label: "Morning" },
    { key: "noon",    label: "Noon"    },
    { key: "evening", label: "Evening" }
  ];

  // Food label map — authored display names
  const FOOD_LABELS = {
    ca_phe:   "Cà phê",
    bakery:   "Bánh mì",
    bun:      "Bún",
    com:      "Cơm",
    pho:      "Phở",
    seafood:  "Seafood",
    bbq:      "BBQ",
    banh_mi:  "Bánh mì",
    japanese: "Japanese",
    chinese:  "Chinese",
    vn_other: "Món Việt"
  };

  function foodLabel(key) {
    return FOOD_LABELS[key] || key.replace(/_/g, " ");
  }

  d3.json("rhythm.json").then(function (data) {
    const grid = document.getElementById("rhythm-grid");
    if (!grid) return;

    data.hubs.forEach(function (h) {
      const col = TYPE_COLOR[h.type] || FALLBACK_COLOR;

      // Wrapper anchor — click goes to hub detail page
      const a = document.createElement("a");
      a.className = "clock-card";
      a.href = "hubs.html#" + h.id;
      a.setAttribute("aria-label", h.title + " hub day rhythm");

      // SVG clock
      const W = 140, H = 150;
      const cx = W / 2, cy = H / 2;
      const R_MAX = 52;   // max wedge radius (fits in 140×140 with label below)
      const R_MIN = 0.18; // minimum fraction so even 0-intensity wedges show a sliver

      const svg = d3.select(a).append("svg")
        .attr("viewBox", "0 0 140 " + H)
        .attr("width", "100%")
        .attr("aria-hidden", "true");

      const defs = svg.append("defs");

      // Radial gradient-core glow (Bremer technique: bright centre → transparent edge)
      const gid = "rg_" + h.id.replace(/[^a-z0-9]/gi, "_");
      const grad = defs.append("radialGradient")
        .attr("id", gid)
        .attr("cx", "50%").attr("cy", "50%").attr("r", "50%");
      grad.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", col)
        .attr("stop-opacity", 1.0);
      grad.append("stop")
        .attr("offset", "60%")
        .attr("stop-color", col)
        .attr("stop-opacity", 0.75);
      grad.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", col)
        .attr("stop-opacity", 0.15);

      // Dark circular background
      svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", R_MAX + 2)
        .attr("fill", "#1a1614");

      // Clock face — faint ring guide
      svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", R_MAX)
        .attr("fill", "none")
        .attr("stroke", "#3a3028")
        .attr("stroke-width", 1);

      // Three wedges, 120° each, starting from top (−π/2)
      const slice = (2 * Math.PI) / 3;
      const startOffset = -Math.PI / 2;  // 12 o'clock

      const arcGen = d3.arc().innerRadius(0);

      PERIOD_LABELS.forEach(function (p, i) {
        const v = h.curve[p.key] != null ? h.curve[p.key] : 0;
        // intensity: curve is already 0–1 normalised (from rhythm.json)
        // map to radius: R_MIN fraction at 0, full R_MAX at 1
        const r = R_MAX * (R_MIN + (1 - R_MIN) * v);

        const startAngle = startOffset + i * slice;
        const endAngle   = startOffset + (i + 1) * slice;

        svg.append("path")
          .attr("transform", "translate(" + cx + "," + cy + ")")
          .attr("d", arcGen
            .outerRadius(r)
            .startAngle(startAngle)
            .endAngle(endAngle)())
          .attr("fill", "url(#" + gid + ")")
          .attr("stroke", "#1a1614")
          .attr("stroke-width", 1.2);
      });

      // Period divider tick marks (thin lines from center to edge)
      for (let i = 0; i < 3; i++) {
        const angle = startOffset + i * slice;
        const x2 = cx + (R_MAX + 2) * Math.sin(angle);
        const y2 = cy - (R_MAX + 2) * Math.cos(angle);
        svg.append("line")
          .attr("x1", cx).attr("y1", cy)
          .attr("x2", x2).attr("y2", y2)
          .attr("stroke", "#1a1614")
          .attr("stroke-width", 1.5);
      }

      // Hub title centred below clock
      svg.append("text")
        .attr("x", cx).attr("y", H - 8)
        .attr("text-anchor", "middle")
        .attr("class", "clock-title")
        .text(h.title);

      // Food caption (one line below SVG via div)
      const food = h.top_food && h.top_food[0]
        ? foodLabel(h.top_food[0][0]) + " · " + h.top_food[0][1]
        : "—";
      const meta = document.createElement("div");
      meta.className = "clock-meta";
      meta.textContent = food;
      a.appendChild(meta);

      // Hover tooltip — period breakdown
      const tip = document.createElement("div");
      tip.className = "clock-tip";
      tip.setAttribute("role", "tooltip");
      tip.innerHTML =
        "<b>" + h.title + "</b>" +
        PERIOD_LABELS.map(function (p) {
          const rawVal = h.clock[p.key] != null ? h.clock[p.key] : 0;
          const desc = rawVal === 2 ? "busy" : rawVal === 1 ? "steady" : "quiet";
          return "<span>" + p.label + " · " + desc + "</span>";
        }).join("") +
        "<span class=\"clock-tip-link\">Field guide →</span>";
      a.appendChild(tip);

      grid.appendChild(a);
    });
  }).catch(function (e) {
    const main = document.getElementById("rhythm-main");
    if (main) {
      main.innerHTML =
        "<pre style=\"color:#c00;padding:2rem\">Failed to load rhythm.json: " + e + "</pre>";
    }
  });
})();
