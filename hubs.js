// hubs.js — the atlas index: district map of 23 hubs + a sortable card grid.
(function () {
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

  const PALETTE = {sustenance:"#3e7a5e", anchors:"#44608c",
                   third_places:"#c0532a", display:"#c99a2e"};
  const CHAIN = "#7a3f1d", INDEP = "#44608c";
  const LIVES = ["sustenance","anchors","third_places","display"];

  const TYPE_COLOR = {heritage:"#8a5a2b", food:"#b5532a", riverside:"#2f7d8a",
                      bridge:"#6a6f3a", knot:"#7a6a6a"};
  const TYPE_LABEL = {heritage:"Heritage", food:"Food", riverside:"Riverside",
                      bridge:"Bridge", knot:"Everyday knot"};
  const TYPE_GLYPH  = {heritage:"shrine", food:"bowl", riverside:"tower",
                       bridge:"bridge", knot:"bikes"};

  // 23 distinct paper-friendly hues, one per hub (IDENTITY). Tested against the
  // live territory render for adjacency separability.
  const HUE = d3.quantize(t => d3.interpolateRainbow(t * 0.92 + 0.02), 23);
  const CONTESTED = "#9c8a5a", FAINT = "#cfc6b6";

  d3.json("hubs.json").then(render).catch((e) =>
    document.getElementById("cards").innerHTML =
      `<pre style="color:#c00">Failed to load hubs.json: ${e}</pre>`);

  function render(data) {
    drawMap(data);
    drawRelations(data);
    wireViewToggle();
    let sort = "diversity";
    drawCards(data, sort);
    document.querySelectorAll(".atlas-controls button").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll(".atlas-controls button")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        drawCards(data, b.dataset.sort);
      }));
    const t = data.totals;
    document.getElementById("between").textContent =
      `Between the hubs: ${t.contested} places on contested frontiers and ` +
      `${t.unclaimed} beyond every hub's walk — counted, but in no hub.`;
  }

  function drawMap(data) {
    const W = 760, H = 560, pad = 16;
    const byId = new Map(data.hubs.map(h => [h.id, h]));
    const hueOf = id => HUE[((byId.get(id)?.rank || 1) - 1) % 23];
    const svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`)
      .on("click", dismissPop);

    d3.json("chains-territory.json").then(terr => {
      const [x0, y0, x1, y1] = terr.bounds;
      const x = d3.scaleLinear([x0, x1], [pad, W - pad]);
      const y = d3.scaleLinear([y0, y1], [H - pad, pad]);
      const line = d3.line().x(p => x(p[0])).y(p => y(p[1]));
      const owner = e => e.cls.startsWith("hub:") ? e.cls : null;

      // faint background: unclaimed + solo-brand seeds
      svg.append("g").selectAll("path")
        .data(terr.edges.filter(e => e.cls === "unclaimed" ||
                                     e.cls.startsWith("brand:")))
        .join("path").attr("d", e => line(e.c)).attr("fill", "none")
        .attr("stroke", FAINT).attr("stroke-width", 0.8).attr("stroke-opacity", 0.5);
      // contested frontiers: dashed
      svg.append("g").selectAll("path")
        .data(terr.edges.filter(e => e.cls === "contested"))
        .join("path").attr("d", e => line(e.c)).attr("fill", "none")
        .attr("stroke", CONTESTED).attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2").attr("stroke-opacity", 0.6);
      // one <g> per hub kingdom: fat invisible hit stroke + visible colored stroke
      const byHub = d3.group(terr.edges.filter(owner), e => e.cls);
      for (const [cls, edges] of byHub) {
        const hub = byId.get(cls);
        if (!hub) continue;
        const col = hueOf(cls);
        const g = svg.append("g").attr("class", "kingdom")
          .attr("data-type", hub.type).attr("data-id", hub.id)
          .style("cursor", "pointer")
          .on("mouseenter", function () {
            d3.select(this).selectAll(".vis").attr("stroke-width", 2.6).attr("stroke-opacity", 1);
          })
          .on("mouseleave", function () {
            d3.select(this).selectAll(".vis").attr("stroke-width", 1.6).attr("stroke-opacity", 0.85);
          })
          .on("click", (ev) => { ev.stopPropagation(); openPop(hub, edges, col, x, y); });
        g.selectAll("path.hit").data(edges).join("path").attr("class", "hit")
          .attr("d", e => line(e.c)).attr("fill", "none")
          .attr("stroke", "transparent").attr("stroke-width", 9);
        g.selectAll("path.vis").data(edges).join("path").attr("class", "vis")
          .attr("d", e => line(e.c)).attr("fill", "none").attr("stroke", col)
          .attr("stroke-width", 1.6).attr("stroke-opacity", 0.85);
      }

      // Glyph pin layer — one marker per hub, colored by type
      const pinLayer = svg.append("g").attr("class", "pin-layer");
      data.hubs.forEach(hub => {
        if (hub.lon == null || hub.lat == null) return;
        const glyphMarkup = (window.HUB_GLYPHS && window.HUB_GLYPHS[hub.glyph])
          ? window.HUB_GLYPHS[hub.glyph]
          : (window.glyphSVG ? window.glyphSVG(hub.glyph, {size: 24}) : "");
        const fo = pinLayer.append("foreignObject")
          .attr("class", "hub-pin")
          .attr("data-type", hub.type)
          .attr("x", x(hub.lon) - 14)
          .attr("y", y(hub.lat) - 14)
          .attr("width", 28)
          .attr("height", 28)
          .style("cursor", "pointer")
          .style("color", TYPE_COLOR[hub.type] || "#7a6a6a")
          .on("click", (ev) => {
            ev.stopPropagation();
            window.location.href = `hub.html?h=${hub.rank}`;
          });
        fo.append("xhtml:div")
          .style("width", "28px")
          .style("height", "28px")
          .style("color", TYPE_COLOR[hub.type] || "#7a6a6a")
          .html(glyphMarkup);
      });

      // Type legend
      const legEl = document.getElementById("type-legend");
      if (legEl && window.glyphSVG) {
        legEl.innerHTML = Object.keys(TYPE_LABEL).map(t =>
          `<span class="leg" style="color:${TYPE_COLOR[t]}">${
            window.glyphSVG(TYPE_GLYPH[t], {size: 18})
          } ${TYPE_LABEL[t]}</span>`
        ).join("");
      }

      // Type filter — drives BOTH the hero territory layer AND the pins, and
      // reports a count. On "all", everything is full color and the count clears.
      const TOTAL = data.hubs.length;
      function applyFilter(want) {
        let shown = 0;
        document.querySelectorAll("svg#map .kingdom").forEach(g => {
          const match = want === "all" || g.getAttribute("data-type") === want;
          g.classList.toggle("muted", !match);
          g.classList.toggle("match", match && want !== "all");
          if (match) shown++;
        });
        document.querySelectorAll(".hub-pin").forEach(pin => {
          const match = want === "all" || pin.getAttribute("data-type") === want;
          pin.classList.toggle("dim", !match);
        });
        const cnt = document.getElementById("filter-count");
        if (cnt) cnt.textContent =
          want === "all" ? "" : `${shown} of ${TOTAL} hubs`;
      }
      document.querySelectorAll("#intent-filter button").forEach(b => {
        b.addEventListener("click", () => {
          document.querySelectorAll("#intent-filter button")
            .forEach(x => x.classList.remove("on"));
          b.classList.add("on");
          applyFilter(b.dataset.type);
        });
      });
    }).catch((e) => d3.select("#map").append("text").attr("x", 16).attr("y", 28)
      .attr("fill", "#c00").text(`Failed to load chains-territory.json: ${e}`));
  }

  // D16: light label de-collision for the relations node-link map. Default
  // label position is dy=-12 (above the node). When another node's default
  // label point sits within `near` px above this node's own position, flip
  // this node's label to dy=+16 (below) so the two labels don't overlap the
  // same circle. Returns a per-node dy accessor.
  function declashLabels(hubs, x, y) {
    const above = -12, below = 16, near = 14;
    const pts = hubs.map(h => ({ h, px: x(h.lon), py: y(h.lat) + above }));
    const flipped = new Set();
    pts.forEach((p, i) => {
      pts.forEach((q, j) => {
        if (i === j || flipped.has(q.h)) return;
        if (Math.abs(p.px - q.px) < 40 && Math.abs(p.py - q.py) < near) {
          flipped.add(q.h);
        }
      });
    });
    return h => flipped.has(h) ? below : above;
  }

  // Relations view: a node-link map. Hubs sit at true lon/lat; edges link hubs
  // whose street territories touch — red where they compete for the same blocks,
  // faint sand where they merely border. Edge weight = shared boundary nodes.
  function drawRelations(data) {
    const svg = d3.select("#relmap"), W = 720, H = 560, pad = 48;
    svg.attr("viewBox", `0 0 ${W} ${H}`); svg.selectAll("*").remove();
    const hubs = data.hubs, byId = new Map(hubs.map(h => [h.id, h]));
    const x = d3.scaleLinear(d3.extent(hubs, h => h.lon), [pad, W - pad]);
    const y = d3.scaleLinear(d3.extent(hubs, h => h.lat), [H - pad, pad]);
    const REL = {compete: "#c0453a", complement: "#3e7a5e", border: "#cabfa8"};
    const maxShared = d3.max(data.relations, r => r.shared_nodes) || 1;
    const w = d3.scaleSqrt([1, maxShared], [1, 7]);

    svg.append("g").selectAll("line").data(data.relations).join("line")
      .attr("x1", r => x(byId.get(r.a).lon)).attr("y1", r => y(byId.get(r.a).lat))
      .attr("x2", r => x(byId.get(r.b).lon)).attr("y2", r => y(byId.get(r.b).lat))
      .attr("stroke", r => REL[r.type] || REL.border)
      .attr("stroke-width", r => w(r.shared_nodes))
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", r => r.type === "border" ? 0.45 : 0.82)
      .append("title").text(r =>
        `${byId.get(r.a).title} ↔ ${byId.get(r.b).title}: ` +
        `${r.type}, ${r.shared_nodes} shared node${r.shared_nodes === 1 ? "" : "s"}`);

    const sz = d3.scaleSqrt(
      d3.extent(hubs, h => h.split.chain + h.split.indep), [5, 20]);
    const g = svg.append("g").selectAll("a").data(hubs).join("a")
      .attr("href", h => `hub.html?h=${h.rank}`)
      .attr("aria-label", h => `${h.title} — open hub profile`)
      .style("cursor", "pointer");
    g.append("circle").attr("cx", h => x(h.lon)).attr("cy", h => y(h.lat))
      .attr("r", h => sz(h.split.chain + h.split.indep))
      .attr("fill", "#fffdf8").attr("stroke", "#7a3f1d").attr("stroke-width", 1.5)
      .append("title").text(h =>
        `${h.title}: ${h.split.chain + h.split.indep} places`);
    // D16: default labels sit 12px above the node, but with 23 hubs some
    // labels collide with a neighbour's circle (e.g. "Văn Thánh" behind Hàng
    // Xanh). declashLabels flips a label below the node (dy=+16) whenever
    // another node's label would otherwise sit within N px above it.
    const labelOffset = declashLabels(hubs, x, y);
    g.append("text").attr("x", h => x(h.lon)).attr("y", h => y(h.lat) + labelOffset(h))
      .attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#4a4030")
      .attr("paint-order", "stroke").attr("stroke", "#faf6ef").attr("stroke-width", 2.5)
      .text(h => h.title);

    const lg = svg.append("g").attr("transform", `translate(${pad},${H - 22})`);
    [["compete", "Compete"], ["complement", "Complement"], ["border", "Border"]]
      .forEach(([k, lab], i) => {
        lg.append("line").attr("x1", i * 130).attr("x2", i * 130 + 22)
          .attr("y1", 0).attr("y2", 0)
          .attr("stroke", REL[k]).attr("stroke-width", 3).attr("stroke-linecap", "round");
        lg.append("text").attr("x", i * 130 + 28).attr("y", 4).attr("font-size", 11)
          .attr("fill", "#5a5040").text(lab);
      });
  }

  function wireViewToggle() {
    const terr = document.getElementById("viewTerr");
    const rel = document.getElementById("viewRel");
    const relmap = document.getElementById("relmap");
    // REAL territory container: the <figure class="atlas-map"> wrapping the
    // #map svg AND the #kpop overlay — toggle the wrapper so the popup hides too.
    const terrEl = document.querySelector("figure.atlas-map") ||
                   relmap.previousElementSibling;
    function show(which) {
      const isRel = which === "rel";
      relmap.hidden = !isRel;
      if (terrEl) terrEl.hidden = isRel;
      if (isRel) dismissPop();
      terr.classList.toggle("on", !isRel);
      rel.classList.toggle("on", isRel);
    }
    terr.onclick = () => show("terr");
    rel.onclick = () => show("rel");
  }

  function openPop(hub, edges, col, x, y) {
    let sx = 0, sy = 0, n = 0;
    edges.forEach(e => e.c.forEach(p => { sx += p[0]; sy += p[1]; n++; }));
    const cx = x(sx / n), cy = y(sy / n);
    const nTotal = hub.split.chain + hub.split.indep;
    const pop = document.getElementById("kpop");
    const chainPct = 100 * hub.split.chain / Math.max(1, nTotal);
    pop.innerHTML =
      `<span class="kx">&times;</span>` +
      `<h3 style="color:${col}">${hub.title}</h3>` +
      `<p class="kmeta">${nTotal} places · diversity ${hub.diversity.toFixed(2)}</p>` +
      `<div class="kbar"><span style="width:${100 - chainPct}%;background:#44608c"></span>` +
      `<span style="width:${chainPct}%;background:#7a3f1d"></span></div>` +
      `<p class="krow">${hub.split.indep} independent · ${hub.split.chain} chain</p>` +
      `<p class="krow">${hub.signature}</p>` +
      `<a class="kgo" href="hub.html?h=${hub.rank}">Deeper dive →</a>`;
    pop.querySelector(".kx").onclick = (e) => { e.stopPropagation(); dismissPop(); };
    const fig = document.querySelector(".atlas-map").getBoundingClientRect();
    pop.style.left = Math.min(fig.width - 240, Math.max(6, cx / 760 * fig.width)) + "px";
    pop.style.top = Math.min(fig.height - 170, Math.max(6, cy / 560 * fig.height)) + "px";
    pop.style.display = "block";
  }
  function dismissPop() {
    const pop = document.getElementById("kpop");
    if (pop) pop.style.display = "none";
  }

  function drawCards(data, sort) {
    const hubs = data.hubs.slice();
    const keys = {
      diversity: (h) => -h.diversity,
      chain: (h) => -(h.split.chain / Math.max(1, h.split.chain + h.split.indep)),
      size: (h) => -(h.split.chain + h.split.indep),
    };
    hubs.sort((a, b) => keys[sort](a) - keys[sort](b) || a.rank - b.rank);
    document.getElementById("cards").innerHTML = hubs.map(card).join("");
  }

  function bar(counts, total, parts, colors) {
    if (!total) return "";
    return `<div class="mini-bar">` + parts.map((p) =>
      `<span style="width:${100*(counts[p]||0)/total}%;background:${colors[p]}"></span>`
    ).join("") + `</div>`;
  }

  function card(h) {
    const n = h.split.chain + h.split.indep;
    const lifeTotal = LIVES.reduce((s, l) => s + (h.lives[l]||0), 0);
    return `<a class="hub-card" href="hub.html?h=${h.rank}">
      ${h.hero_image ? `<img class="card-thumb" src="${esc(h.hero_image.src)}" alt="" loading="lazy">` : ""}
      <h3>${h.title}</h3>
      <div class="hub-stat">${n} places · diversity ${h.diversity.toFixed(2)}</div>
      ${bar(h.lives, lifeTotal, LIVES, PALETTE)}
      ${bar({chain:h.split.chain, indep:h.split.indep}, n,
            ["chain","indep"], {chain:CHAIN, indep:INDEP})}
      <div class="hub-split">${h.split.chain} chain · ${h.split.indep} independent</div>
    </a>`;
  }
})();
