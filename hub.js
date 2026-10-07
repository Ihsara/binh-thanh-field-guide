// hub.js — one hub's profile: local map + lives bar + split bar + categories.
(function () {
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

  const PALETTE = {sustenance:"#3e7a5e", anchors:"#44608c",
                   third_places:"#c0532a", display:"#c99a2e", unclassified:"#9c8a72"};
  const CHAIN = "#7a3f1d", INDEP = "#44608c", STREET = "#cfc6b6";
  const LIVES = ["sustenance","anchors","third_places","display"];
  const LIFE_LABEL = {sustenance:"Sustenance", anchors:"Anchors",
                      third_places:"Third places", display:"Display",
                      unclassified:"Back office"};
  const FIELD_LABEL = {coffee:"Coffee/tea",food:"Food",retail:"Retail",
    beauty:"Beauty/care",property:"Property",fashion:"Fashion",
    education:"Education",health:"Health",electronics:"Electronics",
    finance:"Finance",hotel:"Hotel",other:"Other/office"};
  const FG = window.FOOD_GROUPS, FREG = window.FOOD_REGION_ORDER;
  function isSpecialty(group, countInHub) {
    const g = FG[group];
    return g && !g.is_style && group !== "unclassified" &&
           group !== "vn_other" && countInHub <= 2;
  }
  // food-group / non-food-layer filter state
  let activeGroups = null;        // null = all food groups shown; else Set of shown groups
  let activeLayers = new Set();   // non-food fields toggled ON (hidden by default)
  // company-demotion sidecar (hub-demote.json) — lazy-loaded once, cached
  let _demote = null;  // { slug: [n, ...] }
  async function loadDemote() {
    if (_demote === null) {
      _demote = await d3.json("hub-demote.json?v=20260623hub2")
        .then(d => d.hubs || {}).catch(() => ({}));
    }
    return _demote;
  }
  // curated sub-hubs sidecar (hub-subhubs.json) — lazy-loaded once, cached
  let _subhubs = null;  // { slug: [{kind, name, lon, lat, note}, ...] }
  async function loadSubhubs() {
    if (_subhubs === null) {
      _subhubs = await d3.json("hub-subhubs.json?v=20260623hub2")
        .then(d => d.hubs || {}).catch(() => ({}));
    }
    return _subhubs;
  }
  let _subhubsOn = false;
  function applyDemotion(h, m) {
    const slug = (m && m.hub_id) || h.map_slug || "";
    const list = (_demote && _demote[slug]) || [];
    if (!list.length) return;
    let counted = 0;
    list.forEach(n => {
      const g = document.querySelector(`#lmap g[data-n="${n}"]`);
      if (!g) return;
      if (g.getAttribute("data-icon") === "star-unique") return;  // never the signature
      g.classList.add("demoted");
      counted++;
    });
    if (counted) {
      // counted-not-hidden: a single trade & services note
      const note = document.getElementById("map-ledger-note") || (() => {
        const p = document.createElement("p");
        p.id = "map-ledger-note"; p.className = "trade-note";
        const host = document.getElementById("map-ledger") || document.querySelector(".hub-map");
        if (host) host.appendChild(p);
        return p;
      })();
      note.textContent = `+ ${counted} trade & services (offices, shops, garages) shown muted.`;
    }
  }
  function passesFilter(p) {
    if (p.food) return !activeGroups || activeGroups.has(p.food.group);
    return activeLayers.has(p.field);   // non-food only if its layer is on
  }
  // Map a V1.5 ledger icon-category to the active food/layer filter. Mirrors the
  // dot rule: food icons follow the food chips; non-food icons follow the +add layers.
  // star-unique is the corner's signature find and is NEVER dimmed.
  const ICON_FIELD = {                  // ledger icon -> coarse class for filtering
    "food-restaurant":"food","food-cafe":"coffee","food-pho":"food",
    "food-market":"food","heritage-temple":"keep","heritage-colonial":"keep",
    "park-tree":"keep","school":"education","hotel":"hotel",
    "transit-bus":"keep","water-bridge":"keep","office-building":"other",
    "star-unique":"keep"
  };
  function iconPasses(icon) {
    const cls = ICON_FIELD[icon] || "keep";
    if (cls === "keep") return true;                      // heritage/water/park/star always shown
    if (cls === "coffee" || cls === "food")              // food-ish icon -> food chips
      return !activeGroups || activeGroups.size > 0;     // dim only when ALL food groups are off
    return activeLayers.has(cls);                        // non-food icon -> its +add layer must be on
  }
  function applyMapIconFilter() {
    document.querySelectorAll("#lmap g[data-icon]").forEach(g => {
      const on = iconPasses(g.getAttribute("data-icon"));
      g.classList.toggle("filtered-out", !on);
    });
  }

  // --- debug tooltip helpers (module scope) ---
  let _tip = null;
  function ensureTip() {
    if (!_tip) { _tip = document.createElement("div"); _tip.id = "dot-tip";
      document.body.appendChild(_tip); }
    return _tip;
  }
  // D14 review-fix: shared clamp used by every tooltip path (dots, icons,
  // edge-marks) so all of them stay fully on-screen — including against the
  // right/bottom viewport edges, not just the top/left floor. Originally
  // local to drawLocal()'s dot path only; hoisted to module scope so
  // showFeatureTip() (icon + edge-mark path) can reuse the same math instead
  // of a divergent, unclamped-right/bottom implementation.
  function positionTip(tip, clientX, clientY) {
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let lx = clientX + 14, ly = clientY + 14;
    if (lx + tw > window.innerWidth) lx = clientX - tw - 14;
    if (ly + th > window.innerHeight) ly = clientY - th - 14;
    tip.style.left = Math.max(4, lx) + "px";
    tip.style.top = Math.max(4, ly) + "px";
  }
  function chip(text, color) {
    return `<span class="tag-chip" style="background:${color}">${text}</span>`;
  }
  function tooltipHTML(p) {
    if (!p.food) {
      return `<div class="tip-name">${p.name || "(unnamed)"}</div>` +
             `<div class="tip-sub">non-food · ${p.field || "—"}</div>`;
    }
    const f = p.food;
    const g = FG[f.group] || FG.unclassified;
    let html = `<div class="tip-name">${p.name || "(unnamed)"}</div>` +
      `<div class="tip-sub">${p.chain ? "chain" : "independent"}</div>` +
      `<div class="tip-final">→ ${chip(g.label, g.color)} ` +
      `<span class="tip-rule">(${f.rule})</span></div>`;
    if (f.primary)
      html += `<div class="tip-tags"><span class="tip-lbl">primary</span>` +
              `${chip(f.primary, g.color)}</div>`;
    if (f.hierarchy && f.hierarchy.length)
      html += `<div class="tip-tags"><span class="tip-lbl">hierarchy</span>` +
        f.hierarchy.map(t => chip(t, (FG[t] && FG[t].color) || "#6b6b6b")).join("") +
        `</div>`;
    if (f.alternates && f.alternates.length)
      html += `<div class="tip-tags"><span class="tip-lbl">alternates</span>` +
        f.alternates.map(t => chip(t, "#777")).join("") + `</div>`;
    return html;
  }

  const want = Math.max(1, parseInt(
    new URLSearchParams(location.search).get("h") || "1", 10) || 1);

  const TYPE_LABEL = {heritage:"Heritage corner", food:"Food street",
    riverside:"Riverside", bridge:"Bridge & gateway", knot:"Everyday knot"};
  const TOD_COLOR = {0:"#d9d2c6", 1:"#c08a4a", 2:"#a23b1e"};

  function renderFieldGuide(h) {
    document.getElementById("fg-glyph").innerHTML =
      (window.glyphSVG ? window.glyphSVG(h.glyph, {size:48}) : "");
    const badge = document.getElementById("fg-type-badge");
    badge.textContent = TYPE_LABEL[h.type] || h.type;
    badge.setAttribute("data-type", h.type);
    document.getElementById("fg-portrait").textContent = h.portrait || "";
    document.getElementById("fg-expect").textContent = h.what_to_expect || "";

    const tod = h.time_of_day || {morning:1, noon:1, evening:1};
    const TOD_HEIGHT = {0:"30%", 1:"65%", 2:"100%"};
    const TOD_WORD = {0:"quiet", 1:"moderate", 2:"busy"};
    document.getElementById("fg-timeofday").innerHTML =
      `<span class="tod-cap">When it's alive · <span class="tod-swatch" style="background:${TOD_COLOR[0]}"></span>quiet → <span class="tod-swatch" style="background:${TOD_COLOR[1]}"></span>moderate → <span class="tod-swatch" style="background:${TOD_COLOR[2]}"></span>busy</span>` +
      ["morning","noon","evening"].map(k => {
        const v = tod[k] !== undefined ? tod[k] : 1;
        return `<span class="tod" style="background:${TOD_COLOR[v]};height:${TOD_HEIGHT[v]}" title="${k}: ${TOD_WORD[v]}">${k}</span>`;
      }).join("");

    const picks = h.picks || [];
    document.getElementById("fg-picks").innerHTML = picks.length
      ? picks.map(p =>
          `<div class="fg-pick" data-pick="${esc(p.name)}"><span class="intent">${esc(p.intent)}</span>` +
          `<span class="name">${esc(p.name)}</span><span class="why">${esc(p.why)}</span></div>`
        ).join("")
      : `<span class="muted">No standout picks on file for this corner.</span>`;

    document.getElementById("fg-footnote").textContent = h.footnote || "";
  }

  function renderHero(h) {
    const fig = document.getElementById("hub-hero");
    if (!fig) return;
    if (h.hero_image && h.hero_image.src) {
      const img = h.hero_image;
      const cr = h.hero_credit || {};
      const licLink = cr.license_url
        ? `<a href="${esc(cr.license_url)}" target="_blank" rel="noopener">${esc(cr.license) || "license"}</a>`
        : esc(cr.license || "");
      const srcLink = cr.source_url
        ? `<a href="${esc(cr.source_url)}" target="_blank" rel="noopener">${esc(cr.source) || "source"}</a>`
        : esc(cr.source || "");
      fig.innerHTML =
        `<img src="${esc(img.src)}"` +
        (img.srcset ? ` srcset="${esc(img.srcset)}" sizes="(max-width:600px) 100vw, 720px"` : "") +
        ` alt="${esc(img.alt || "")}" loading="lazy">` +
        `<figcaption class="hub-credit">Photo: ${esc(cr.author || "")}` +
        (licLink ? ` · ${licLink}` : "") +
        (srcLink ? ` · ${srcLink}` : "") +
        `</figcaption>`;
      fig.hidden = false;
    } else if (h.research && h.research.photo_verdict === "data-art") {
      fig.hidden = true;
      fig.innerHTML = "";
    } else {
      fig.innerHTML = window.HUB_VIGNETTE ? window.HUB_VIGNETTE(h.map_slug, h.type) : "";
      fig.hidden = !fig.innerHTML;
    }
  }

  // food_breakdown group -> readable label (subset; mirrors hub_field_guide)
  const FOOD_LBL = {ca_phe:"coffee", pho:"pho", bun:"bún", com:"cơm",
    banh_mi:"bánh mì", bbq:"BBQ", korean:"Korean", japanese:"Japanese",
    thai:"Thai", chinese:"Chinese", italian:"Italian", pizza:"pizza",
    seafood:"seafood", bakery:"bakeries", hu_tieu:"hủ tiếu",
    vegetarian:"vegetarian", fast_food:"fast food", chao:"cháo",
    vn_other:"Vietnamese", western_other:"Western", indian:"Indian"};

  function renderUnique(h) {
    const box = document.getElementById("fg-unique");
    if (!box || !h.whats_unique) { if (box) box.innerHTML = ""; return; }
    const s = (h.research && h.research.stats) || {};
    // one honest stat chip when the data supports it (never invented)
    const chips = [];
    if (s.cafes) chips.push(`${s.cafes} cafés`);
    if (s.offices) chips.push(`${s.offices} offices`);
    if (s.schools) chips.push(`${s.schools} schools`);
    const stat = chips.length
      ? `<p class="fg-unique-stat">${chips.map(esc).join(" · ")}</p>` : "";
    box.innerHTML =
      `<h3>What's unique here</h3>` +
      `<p class="fg-unique-line">${esc(h.whats_unique)}</p>` + stat;
  }

  function renderAround(h) {
    const box = document.getElementById("fg-around");
    if (!box) return;
    const anchors = (h.named_anchors || []).slice(0, 3);
    const anchorLis = anchors.map(a =>
      `<li class="anchor"><b>${esc(a.name)}</b>` +
      `<span class="what">${esc(a.what)}</span>` +
      `<span class="why">${esc(a.why)}</span></li>`).join("");
    // top named categories present in the hub (real place names, baked)
    const cats = (h.top_cats || []).slice(0, 6)
      .map(c => `<li class="cat">${esc(c.cat)} <b>×${c.n}</b></li>`).join("");
    // a food-count line (counts only, no invented names)
    const fb = Object.entries(h.food_breakdown || {})
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3)
      .map(([g, n]) => `${n} ${esc(FOOD_LBL[g] || g)}`);
    const foodLine = fb.length
      ? `<p class="fg-around-food">Mostly ${fb.join(", ")}.</p>` : "";
    if (!anchorLis && !cats && !foodLine) { box.innerHTML = ""; return; }
    box.innerHTML = `<h3>What's around</h3>` +
      (anchorLis ? `<ul class="fg-anchors">${anchorLis}</ul>` : "") +
      (cats ? `<ul class="fg-around-cats">${cats}</ul>` : "") +
      foodLine;
  }

  const SHAPE_LBL = {loop: "a loop", oneway: "one way", out_back: "out and back"};

  function renderWalk(h) {
    const box = document.getElementById("fg-walk");
    if (!box) return;
    const wf = h.walking_flow;
    if (!wf || !Array.isArray(wf.stops) || !wf.stops.length) {
      box.innerHTML = ""; return;
    }
    const shape = SHAPE_LBL[wf.shape] || "";
    const head = `<h3>A walking flow${shape ? ` <span class="walk-shape">· ${esc(shape)}</span>` : ""}</h3>`;
    const premise = wf.premise ? `<p class="walk-premise">${esc(wf.premise)}</p>` : "";
    const steps = wf.stops.map((s, i) => {
      const mins = (s.minutes != null)
        ? `<span class="walk-min">${s.minutes === 0 ? "start" : "+" + s.minutes + " min"}</span>` : "";
      return `<li class="walk-step" data-walk="${i}"><span class="walk-n">${i + 1}</span>` +
        `<div class="walk-body"><span class="walk-stop">${esc(s.stop)}</span>` +
        `<span class="walk-intent">${esc(s.intent)}</span>${mins}</div></li>`;
    }).join("");
    box.innerHTML = head + premise + `<ol class="walk-list">${steps}</ol>`;
  }

  function renderCross(h) {
    const box = document.getElementById("fg-cross");
    if (!box) return;
    if (!h.cross_hub_draw) { box.innerHTML = ""; return; }
    box.innerHTML =
      `<h3>Why come here from elsewhere</h3>` +
      `<p class="fg-cross-line">${esc(h.cross_hub_draw)}</p>`;
  }

  function renderVizLinks(h) {
    const box = document.getElementById("fg-viz-links");
    if (!box) return;
    const hash = "";
    box.innerHTML =
      `<h3>See this corner elsewhere</h3>
       <p class="fg-viz-row">
         <a href="rhythm.html${hash}">Its daily rhythm →</a>
         <a href="history.html${hash}">On the history ribbon →</a>
         <a href="cuisine.html">What it eats →</a>
       </p>`;
  }

  Promise.all([
    d3.json("hubs.json"),
    d3.json("uniques.json").catch(() => ({candidates:[]})),
    d3.json("images/uniques/UNIQUES.json").catch(() => ({images:[]})),
  ]).then(async ([data, uniquesData, uniquesLedger]) => {
    const byRank = new Map(data.hubs.map((h) => [h.rank, h]));
    const h = byRank.get(want) || data.hubs[0];
    // V1.5 per-hub illustrated map — only the pilot hubs have one; others fall
    // back to the OSM-edges path. Skip the fetch entirely when there's no slug
    // so non-pilot hubs don't log a 404.
    const mapSlug = h.map_slug || "";
    const hubMap = mapSlug
      ? await d3.json("hub_maps/" + mapSlug + ".json?v=20260622v1_5b").catch(() => null)
      : null;
    document.title = `${h.title} · Bình Thạnh Atlas`;
    document.getElementById("title").textContent = h.title;
    renderFieldGuide(h);
    renderHero(h);
    renderUnique(h);
    renderAround(h);
    renderWalk(h);
    renderCross(h);
    renderVizLinks(h);
    document.getElementById("sig").textContent =
      `${h.split.chain + h.split.indep} places · diversity ${h.diversity.toFixed(2)} · ${h.signature}`;
    // filter confirmed uniques for this hub
    const hubUniques = (uniquesData.candidates || [])
      .filter(c => c.hub_id === h.id && c.research && c.research.confirmed === true);
    // build ledger map: unique_name → file path
    const ledgerMap = new Map((uniquesLedger.images || []).map(img => [img.unique_name, img.file]));
    // annotate each unique with its svg file path so card rendering can use it
    hubUniques.forEach(u => { u._svgFile = ledgerMap.get(u.name) || null; });
    await loadDemote();
    await loadSubhubs();
    drawLocal(h, hubUniques, ledgerMap, hubMap);
    // C1: fullscreen lightbox — redraw() re-runs the current hub's map at the new size
    const redrawMap = () => drawLocal(h, hubUniques, ledgerMap, hubMap);
    initMapLightbox(redrawMap);
    // C3: 1895 ghost overlay — only on the 7 verified anchor hubs
    fetch("hist1895.json").then(r => r.ok ? r.json() : {}).then(man => {
      const entry = man[h.id];
      if (!entry) return;
      const section = document.querySelector(".hub-grid-b2 .hub-map");
      if (!section) return;
      const img = document.createElement("img");
      img.className = "hist1895-img";
      img.src = entry.img;
      img.alt = "1895 Gia Định survey (Plan des environs de Saïgon), georeferenced to ±400 m";
      // D2: insert as the section's first child, same as #lmap was before this
      // insert — section has no padding, so img top:0/left:0 (hub.css
      // .hist1895-img, position:absolute against this position:relative
      // section) lands exactly on the SVG's rendered rect, not the section's
      // full height (chips/ctl/note below are unaffected).
      section.insertBefore(img, section.firstChild);

      const ctl = document.createElement("div");
      ctl.className = "hist1895-ctl";
      ctl.innerHTML =
        '<label>1895 Gia Định ghost <span class="pm">±400 m</span></label>' +
        '<input type="range" min="0" max="50" value="0" aria-label="1895 overlay opacity">';
      // Append ctl inside the .hub-map section so it travels into the
      // fullscreen lightbox alongside the canvas (approach a).
      section.appendChild(ctl);
      ctl.querySelector("input").addEventListener("input", (e) => {
        img.style.opacity = String(e.target.value / 100);  // 0–0.5 (cap 50%)
      });

      const note = document.createElement("details");
      note.className = "hist1895-note";
      note.innerHTML = `<summary>What survived from 1895</summary><p>${entry.note}</p>` +
        `<p class="muted">Source: Plan des environs de Saïgon (Joly, 1895) — ` +
        `Wikimedia Commons, public domain mark (PD-Mark). ` +
        `Georeferenced to RMSE ${entry.rmse_m} m — atmospheric, not survey-accurate.</p>`;
      section.appendChild(note);
    });
    wireFieldSpotlight(hubMap);
    renderHubCards(h, hubUniques);
    drawBars(h);
    drawCats(h);
    drawFood(h);
    drawWhy(h);
    drawGenerators(h);
    drawNeighbours(h, byRank, data.relations);
    pager(h, data.hubs.length, byRank);
  }).catch((e) => document.getElementById("hub-main").innerHTML =
    `<pre style="color:#c00">Failed to load hubs.json: ${e}</pre>`);

  // lives palette for quiet dot colouring (maps life → muted colour)
  const LIFE_COLOR = {
    sustenance: "#6faa88", anchors: "#7898b8",
    third_places: "#d4826a", display: "#d4b460", unclassified: "#c0b49e"
  };

  // ---- B3 exploration cards ----

  // Module-scope: the confirmed uniques for the currently displayed hub
  // (set during renderHubCards so spotlight can reference them)
  let _hubUniques = [];

  function renderHubCards(h, uniques) {
    const box = document.getElementById("hub-cards");
    if (!box) return;
    _hubUniques = uniques || [];
    _renderDefaultCards(box, h, _hubUniques);
    // Wire the map→card spotlight event from Task 5
    const cv = document.getElementById("ldots");
    if (cv) {
      cv.addEventListener("hub:select", (ev) => {
        _handleSpotlight(ev.detail, box, h, _hubUniques);
      });
      // clicking on the map backdrop (canvas itself, not a vignette/cluster)
      // clears back to the default all-cards view
      cv.addEventListener("click", (ev) => {
        // only clear if the click landed on the canvas, not a bubbling cluster/vignette
        if (ev.target === cv) _renderDefaultCards(box, h, _hubUniques);
      });
    }
  }

  function _renderDefaultCards(box, h, uniques) {
    if (!uniques.length) {
      box.innerHTML =
        `<p class="hub-cards-empty">` +
        `No single stall here is district-unique in our data — ` +
        `the corner's character is in its mix.` +
        `</p>`;
      return;
    }
    box.innerHTML =
      `<h3 class="hub-cards-title">Only here in the district</h3>` +
      uniques.map(u => _uniqueCardHTML(u, false)).join("");
  }

  function _uniqueCardHTML(u, highlighted) {
    const r = u.research || {};
    const what = esc(r.what || u.category || "");
    const note = esc(r.note || "");
    const name = esc(u.name || "");
    const caveat = "the only one we found in the district";
    // optional vignette image (small, from the ledger)
    const imgHref = u._svgFile
      ? `<img class="hub-card-vig" src="${esc(u._svgFile)}" alt="${name}" loading="lazy">` : "";
    return `<div class="hub-card unique-card${highlighted ? " spotlight" : ""}" data-unique="${name}">` +
      imgHref +
      (name ? `<span class="hub-card-name">${name}</span>` : "") +
      (what  ? `<span class="hub-card-what">${what}</span>` : "") +
      (note  ? `<p class="hub-card-note">${note}</p>` : "") +
      `<span class="hub-card-caveat">${esc(caveat)}</span>` +
      `</div>`;
  }

  function _handleSpotlight(sel, box, h, uniques) {
    if (!sel) { _renderDefaultCards(box, h, uniques); return; }
    // pick/walkstop/feature are handled exclusively by wireFieldSpotlight — don't fight it
    if (sel.type === "pick" || sel.type === "walkstop" || sel.type === "feature") return;

    if (sel.type === "unique") {
      // Highlight the matching card; scroll it into view
      const name = sel.name || "";
      if (!uniques.length) { _renderDefaultCards(box, h, uniques); return; }
      // Re-render all cards, spotlighting the matching one
      box.innerHTML =
        `<h3 class="hub-cards-title">Only here in the district</h3>` +
        uniques.map(u => _uniqueCardHTML(u, u.name === name)).join("") +
        `<button class="hub-cards-clear">Show all →</button>`;
      const target = box.querySelector(`.hub-card[data-unique="${CSS.escape(name)}"]`);
      if (target && sel.scroll) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      box.querySelector(".hub-cards-clear").onclick =
        () => _renderDefaultCards(box, h, uniques);
      return;
    }

    if (sel.type === "cluster") {
      // List the cluster's contents: named by name (escaped), anonymous by count only
      const places = sel.places || [];
      const named = places.filter(p => p.name);
      const anonCount = places.length - named.length;
      const nameList = named.map(p =>
        `<li class="hub-card-cluster-item">${esc(p.name)}</li>`
      ).join("");
      const anonLine = anonCount > 0
        ? `<li class="hub-card-cluster-anon">+ ${anonCount} unnamed here</li>` : "";
      box.innerHTML =
        `<div class="hub-card cluster-card">` +
        `<span class="hub-card-name">${sel.count} places co-located</span>` +
        `<ul class="hub-card-cluster-list">${nameList}${anonLine}</ul>` +
        `</div>` +
        (uniques.length
          ? `<button class="hub-cards-clear">Back to district-unique →</button>` : "");
      const clearBtn = box.querySelector(".hub-cards-clear");
      if (clearBtn) clearBtn.onclick = () => _renderDefaultCards(box, h, uniques);
      return;
    }

    // Fallback: clear to default
    _renderDefaultCards(box, h, uniques);
  }

  // ---- selection state + event dispatch ----
  let _selected = null;
  function spotlight(selection) {
    _selected = selection;
    const cv = document.getElementById("ldots");
    if (cv) cv.dispatchEvent(new CustomEvent("hub:select", { detail: selection, bubbles: true }));
  }

  function drawLocal(h, hubUniques, ledgerMap, hubMap) {
    hubUniques = hubUniques || [];
    ledgerMap  = ledgerMap  || new Map();

    const W = 720, H = 460, pad = 16;
    const [x0, y0, x1, y1] = h.bbox;
    const x = d3.scaleLinear([x0, x1], [pad, W - pad]);
    const y = d3.scaleLinear([y0, y1], [H - pad, pad]);

    // streets stay SVG (crisp vectors)
    const svg = d3.select("#lmap").attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();

    // show/hide the honesty caption depending on whether we have a hub map
    const cap = document.getElementById("map-caption");
    if (cap) cap.hidden = !hubMap;

    if (hubMap) {
      drawHubMap(h, hubMap, svg, W, H);
    } else {
      // ----- existing OSM path: edges, anchor legend, clusters, vignettes -----
      const line = d3.line().x(p => x(p[0])).y(p => y(p[1]));
      svg.append("g").selectAll("path").data(h.edges).join("path")
        .attr("d", line).attr("fill", "none").attr("stroke", STREET)
        .attr("stroke-width", 1.4);

    // named_anchors legend (no lon/lat — placed as a small overlay inside SVG)
    const anchors = (h.named_anchors || []).slice(0, 3);
    if (anchors.length) {
      const ag = svg.append("g").attr("class", "anchor-legend")
        .attr("transform", `translate(${W - pad - 4}, ${pad + 4})`);
      ag.append("rect")
        .attr("x", -148).attr("y", -2)
        .attr("width", 152).attr("height", anchors.length * 22 + 6)
        .attr("fill", "rgba(250,246,239,0.88)").attr("rx", 5);
      anchors.forEach((a, i) => {
        const row = ag.append("g").attr("transform", `translate(0, ${i * 22 + 14})`);
        row.append("circle").attr("cx", -140).attr("cy", -4).attr("r", 4)
          .attr("fill", "none").attr("stroke", "#8a5a2b").attr("stroke-width", 1.5);
        row.append("text")
          .attr("x", -132).attr("y", 0)
          .attr("font-size", "10px").attr("fill", "#4a3020")
          .attr("font-family", "var(--body, sans-serif)")
          .text(a.name.length > 22 ? a.name.slice(0, 21) + "…" : a.name)
          .append("title").text(esc(a.name) + " — " + esc(a.what));
      });
    }

    // ---- cluster detection ----
    // Group places whose projected pixel positions are within CLUSTER_PX of each other
    const CLUSTER_PX = 8;
    const clusters = []; // [{cx, cy, places:[]}]
    h.places.forEach((p) => {
      const px = x(p.lon), py = y(p.lat);
      let found = false;
      for (const cl of clusters) {
        if (Math.abs(cl.cx - px) < CLUSTER_PX && Math.abs(cl.cy - py) < CLUSTER_PX) {
          cl.places.push(p); found = true; break;
        }
      }
      if (!found) clusters.push({ cx: px, cy: py, places: [p] });
    });
    // multi-place clusters (2+)
    const multiClusters = clusters.filter(cl => cl.places.length >= 2);

    // ---- cluster glyphs (SVG, above roads, below vignettes) ----
    const clusterG = svg.append("g").attr("class", "cluster-glyphs");
    multiClusters.forEach(cl => {
      const cg = clusterG.append("g")
        .attr("transform", `translate(${cl.cx}, ${cl.cy})`)
        .style("cursor", "pointer")
        .attr("aria-label", `${cl.places.length} places co-located here`);
      cg.append("circle").attr("r", 9)
        .attr("fill", "rgba(255,253,248,0.82)").attr("stroke", "#9c8a72")
        .attr("stroke-width", 1.2);
      cg.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("font-size", "8px").attr("fill", "#4a4030")
        .attr("font-family", "var(--body, sans-serif)").attr("font-weight", "600")
        .text(cl.places.length);
      cg.append("title").text(`${cl.places.length} here`);
      cg.on("click", () => spotlight({ type: "cluster", count: cl.places.length,
        cx: cl.cx, cy: cl.cy, places: cl.places }));
      cg.on("mouseenter", () => spotlight({ type: "cluster", count: cl.places.length,
        cx: cl.cx, cy: cl.cy, places: cl.places }));
    });

    // ---- unique dish vignettes (SVG <image> at projected lon/lat) ----
    // Honest caveat: "the only one we found in the district" — never an absolute claim
    const VIGNETTE_SIZE = 36;
    const vigG = svg.append("g").attr("class", "unique-vignettes");
    hubUniques.forEach(u => {
      const svgFile = ledgerMap.get(u.name);
      if (!svgFile) return;
      const px = x(u.lon), py = y(u.lat);
      // connector line from anchor point to vignette centre
      const vx = Math.min(W - pad - VIGNETTE_SIZE, Math.max(pad, px));
      const vy = Math.min(H - pad - VIGNETTE_SIZE, Math.max(pad, py - VIGNETTE_SIZE - 6));
      const vg = vigG.append("g").attr("class", "unique-vignette").style("cursor", "pointer");
      // dot at exact location
      vg.append("circle").attr("cx", px).attr("cy", py).attr("r", 4)
        .attr("fill", "#c0453a").attr("stroke", "#fffdf8").attr("stroke-width", 1.5);
      // connector
      vg.append("line")
        .attr("x1", px).attr("y1", py)
        .attr("x2", vx + VIGNETTE_SIZE / 2).attr("y2", vy + VIGNETTE_SIZE)
        .attr("stroke", "#c0453a").attr("stroke-width", 1).attr("stroke-dasharray", "3,2")
        .attr("opacity", 0.6);
      // vignette frame
      vg.append("rect")
        .attr("x", vx).attr("y", vy)
        .attr("width", VIGNETTE_SIZE).attr("height", VIGNETTE_SIZE)
        .attr("fill", "#faf6ef").attr("stroke", "#c0453a").attr("stroke-width", 1.2)
        .attr("rx", 5);
      // SVG illustration via <image> (browser resolves relative to the page URL)
      vg.append("image")
        .attr("href", svgFile)
        .attr("x", vx + 2).attr("y", vy + 2)
        .attr("width", VIGNETTE_SIZE - 4).attr("height", VIGNETTE_SIZE - 4)
        .attr("alt", esc("the only one we found in the district") + " · " + esc(u.name))
        .append("title")
          .text(esc(u.name) + " — the only one we found in the district");
      vg.on("click", () => spotlight({ type: "unique", name: u.name, hub_id: u.hub_id,
        lon: u.lon, lat: u.lat, svgFile, caveat: "the only one we found in the district" }));
      vg.on("mouseenter", () => spotlight({ type: "unique", name: u.name, hub_id: u.hub_id,
        lon: u.lon, lat: u.lat, svgFile, caveat: "the only one we found in the district" }));
    });
    } // end else (OSM path)

    // ----- quiet dot texture on canvas: runs in both modes -----
    // dots on canvas (scales to ~1000+ places) — QUIET / low-contrast: life colours, low alpha
    const cv = document.getElementById("ldots");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // D9: size the backing buffer to the box the canvas is ACTUALLY rendered
    // at (inline card width, or the wider lightbox column), not a fixed
    // 720x460 — else the browser upscales the small buffer and dots go soft.
    // The canvas's parentNode (.hub-map) also holds chips/key/slider/note
    // below the map, so its full box height isn't the map's height — derive
    // height from the box WIDTH times the fixed W:H aspect ratio instead
    // (same aspect the SVG viewBox uses), and fall back to W/H if the box
    // isn't laid out yet (width 0, e.g. hidden ancestor at first paint).
    const box = cv.parentNode.getBoundingClientRect();
    const cw = box.width || W;
    const ch = box.width ? cw * (H / W) : H;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.position = "absolute"; cv.style.left = 0; cv.style.top = 0;
    cv.style.width = "100%"; cv.style.height = "auto";
    const ctx = cv.getContext("2d");

    function jit(seed) { const s = Math.sin(seed * 12.9898) * 43758.5453;
      return (s - Math.floor(s)) - 0.5; }

    function paint() {
      // Map the fixed 720x460 viewBox coordinate space (which x()/y() paint
      // into) onto the real backing buffer, whatever size it was measured
      // at above — this is what keeps dots sharp instead of blurry-upscaled.
      const sx = cv.width / W, sy = cv.height / H;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Quiet uniform dots: life-coloured, low alpha — texture, not clutter;
      // vignettes carry the emphasis now
      h.places.forEach((p, i) => {
        if (!passesFilter(p)) return;
        const jx = jit(p.lon * 1000 + i) * 4, jy = jit(p.lat * 1000 + i * 7) * 4;
        const X = x(p.lon) + jx, Y = y(p.lat) + jy;
        const life = p.life || (p.food ? "sustenance" : "unclassified");
        ctx.beginPath(); ctx.arc(X, Y, 2.2, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = LIFE_COLOR[life] || LIFE_COLOR.unclassified;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    paint();
    drawChips(h, paint);

    // per-dot debug tooltip — canvas hover hit-test.
    // Factored out so the pointerup (touch) path can reuse the exact same
    // nearest-dot math instead of duplicating it.
    function nearestDot(clientX, clientY) {
      const r = cv.getBoundingClientRect();
      const mx = (clientX - r.left) * (W / r.width);
      const my = (clientY - r.top) * (H / r.height);
      let best = null, bd = 64;  // 8px squared, in canvas units
      h.places.forEach((p) => {
        if (!passesFilter(p)) return;
        const dx = x(p.lon) - mx, dy = y(p.lat) - my;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = p; }
      });
      return best;
    }
    cv.onmousemove = (ev) => {
      const best = nearestDot(ev.clientX, ev.clientY);
      const tip = ensureTip();
      if (best) {
        tip.innerHTML = tooltipHTML(best);
        tip.style.display = "block";
        positionTip(tip, ev.clientX, ev.clientY);
      } else {
        tip.style.display = "none";
      }
    };
    cv.onmouseleave = () => { if (_tip) _tip.style.display = "none"; };

    // D14 touch parity: dots were mousemove-only and thus unreachable on
    // touch devices. A tap runs the same nearestDot() hit-test; if it hits a
    // dot that isn't already shown, show its tooltip, else hide (toggle-off
    // on repeat tap). Guarded on pointerType so mouse clicks (which already
    // get hover via onmousemove) don't double-fire this path.
    let _tappedDot = null;
    cv.onpointerup = (ev) => {
      if (ev.pointerType === "mouse") return;
      ev.stopPropagation();
      const best = nearestDot(ev.clientX, ev.clientY);
      const tip = ensureTip();
      if (best && best !== _tappedDot) {
        tip.innerHTML = tooltipHTML(best);
        tip.style.display = "block";
        positionTip(tip, ev.clientX, ev.clientY);
        _tappedDot = best;
      } else {
        tip.style.display = "none";
        _tappedDot = null;
      }
    };

    // Sub-hubs toggle: curated malls
    const st = document.getElementById("subhub-toggle") || (() => {
      const b = document.createElement("button"); b.id = "subhub-toggle";
      b.type = "button"; b.textContent = "Sub-hubs";
      const sec = document.querySelector(".hub-map"); if (sec) sec.appendChild(b);
      return b;
    })();
    if (st) st.onclick = () => {
      _subhubsOn = !_subhubsOn;
      st.classList.toggle("on", _subhubsOn);
      svg.select("g.subhub-layer").remove();
      if (_subhubsOn && hubMap) {
        const ext = hubMap.extent;  // [lon0, lat0, lon1, lat1]
        const subProjX = (lon) => (lon - ext[0]) / (ext[2] - ext[0]) * W;
        const subProjY = (lat) => (ext[3] - lat) / (ext[3] - ext[1]) * H;
        drawSubhubs(h, svg, subProjX, subProjY, W, H);
      }
    };
  }

  // ---- 4-layer real-geometry illustrated map (V1.5) ----
  const CAT_FILL = {
    "heritage-temple":"#C47B45","heritage-colonial":"#C47B45",
    "food-restaurant":"#E8A838","food-cafe":"#E8A838","food-pho":"#E8A838",
    "food-market":"#E8A838","park-tree":"#7A9B6A","school":"#7A6AA8",
    "hotel":"#A87A6A","transit-bus":"#4A8FA8","water-bridge":"#4A8FA8",
    "office-building":"#6A7A8A","star-unique":"#C43838"
  };
  function sprite(svg, icon, cx, cy, size, color, deg) {
    const g = svg.append("g").attr("transform",
      `translate(${cx},${cy})` + (deg != null ? ` rotate(${deg})` : ""));
    g.append("circle").attr("r", size * 0.85).attr("fill", color).attr("opacity", 0.22);
    g.append("use").attr("href", "icons/hub-icons.svg#" + icon)
      .attr("x", -size/2).attr("y", -size/2).attr("width", size).attr("height", size)
      .attr("color", "#2A1F14");   // currentColor for the stroke
    return g;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  const MAX_NUDGE = 18;      // px hard cap on total displacement (~4% of the 460px frame);
                              // shared honesty leash used by both declashIcons and the D15 badge inset
  // D3 honesty: draw a small chevron pointing FROM the clamped border position
  // TOWARD the true off-extent location, so a place that's real but off the
  // drawn frame is never silently dropped or stacked invisibly in a corner.
  function edgeMark(svg, cx, cy, angleDeg, color) {
    const g = svg.append("g").attr("class", "edge-mark")
      .attr("transform", `translate(${cx},${cy}) rotate(${angleDeg})`);
    g.append("circle").attr("r", 9).attr("fill", color).attr("opacity", 0.28);
    // simple chevron/arrowhead pointing along +x (rotation aims it off-frame)
    g.append("path").attr("d", "M -4,-6 L 5,0 L -4,6 Z")
      .attr("fill", "#2A1F14").attr("class", "edge-mark-chevron");
    return g;
  }
  // Quiet always-on de-clash: nudge overlapping ledger icons apart, but keep each
  // within MAX_NUDGE of its true position (honesty leash) and never move the signature.
  function declashIcons(items) {
    // items: [{n, x, y, icon}] in viewBox px. Returns same array with x,y nudged.
    const MIN_SEP = 22;        // px below which two icons are "clashing"
    const ITERS = 24;
    const orig = items.map(it => ({ x: it.x, y: it.y }));
    for (let k = 0; k < ITERS; k++) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy) || 0.01;
          if (d < MIN_SEP) {
            const push = (MIN_SEP - d) / 2;
            const ux = dx / d, uy = dy / d;
            if (a.icon !== "star-unique") { a.x -= ux * push; a.y -= uy * push; }
            if (b.icon !== "star-unique") { b.x += ux * push; b.y += uy * push; }
          }
        }
      }
      // enforce the leash: clamp each icon to MAX_NUDGE from its origin
      items.forEach((it, idx) => {
        if (it.icon === "star-unique") { it.x = orig[idx].x; it.y = orig[idx].y; return; }
        const dx = it.x - orig[idx].x, dy = it.y - orig[idx].y;
        const d = Math.hypot(dx, dy);
        if (d > MAX_NUDGE) { it.x = orig[idx].x + dx / d * MAX_NUDGE; it.y = orig[idx].y + dy / d * MAX_NUDGE; }
      });
    }
    return items;
  }
  function drawHubMap(h, m, svg, W, H) {
    // Ledger coords are all in 0-1, but the fetched OSM geometry can extend past
    // the hub bbox, so streets/water may project beyond [0,1] (x>1, y<0, etc).
    // That's intentional full-bleed texture; the SVG viewBox clips it. Not a bug.
    const px = (u) => u * W, py = (u) => u * H;          // 0-1 -> pixels (y down)
    const line = d3.line().x(p => px(p[0])).y(p => py(p[1]));
    const ring = d3.line().x(p => px(p[0])).y(p => py(p[1])).curve(d3.curveLinearClosed);
    // L0 ground
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#F5EDD8");
    (m.geometry.blocks||[]).forEach(b =>
      svg.append("path").attr("d", ring(b)).attr("fill", "#EDE0C4").attr("stroke","none"));
    (m.geometry.parks||[]).forEach(p =>
      svg.append("path").attr("d", ring(p.ring)).attr("fill", "#C8D4B0").attr("stroke","none"));
    (m.geometry.water||[]).forEach(w =>
      svg.append("path").attr("d", ring(w.ring)).attr("fill", "#9BBFCF").attr("stroke","none"));
    // L1 streets (weighted by class) + bridge as its own way
    const SW = {primary:3, secondary:2.2, tertiary:1.6, residential:1.2, service:0.8};
    (m.geometry.streets||[]).forEach(s =>
      svg.append("path").attr("d", line(s.pts)).attr("fill","none")
        .attr("stroke", "#B8A080").attr("stroke-width", SW[s.cls]||1.2)
        .attr("stroke-dasharray", s.cls==="service" ? "2,2" : null));
    (m.geometry.bridges||[]).forEach(br => {
      svg.append("path").attr("d", line(br.pts)).attr("fill","none")
        .attr("stroke", "#fffdf8").attr("stroke-width", 6);          // railing
      svg.append("path").attr("d", line(br.pts)).attr("fill","none")
        .attr("stroke", "#8C7055").attr("stroke-width", 4);
    });
    // L3 route band (beneath icons)
    if ((m.route||[]).length >= 2) {
      const byN = new Map(m.ledger.map(e => [e.n, e]));
      const pts = m.route.map(n => byN.get(n)).filter(Boolean).map(e => [px(e.x), py(e.y)]);
      if (pts.length >= 2)
        svg.append("path").attr("class","route-band")
          .attr("d", d3.line().curve(d3.curveCatmullRom.alpha(0.6))(pts))
          .attr("fill","none").attr("stroke","#7BA7BC").attr("stroke-width", 9)
          .attr("opacity", 0.35).attr("stroke-linecap","round");
    }
    // L2/L3 icons + numbered badges
    const pad = 10;   // frame border inset for clamped off-extent markers
    const BADGE_INSET = 9;   // px: badge circle (r=7) + a 2px margin — the reach
                              // a numbered badge needs clear of the frame edge
    // D3: honest off-extent detection — a ledger place whose projected pixel
    // falls outside the drawn [0,W]x[0,H] frame is real, just off the map;
    // clamp it to the border and edge-mark it rather than let declashIcons
    // stack it invisibly in a corner (declash only sees in-frame targets).
    const rawByN = new Map((m.ledger||[]).map(e => [e.n, { x: px(e.x), y: py(e.y) }]));
    const inFrame = [], offExtent = [];
    (m.ledger||[]).forEach(e => {
      const raw = rawByN.get(e.n);
      const isOffExtent = raw.x < 0 || raw.x > W || raw.y < 0 || raw.y > H;
      (isOffExtent ? offExtent : inFrame).push(e);
    });
    const placed = declashIcons(inFrame.map(e => ({ n: e.n, icon: e.icon, x: px(e.x), y: py(e.y) })));
    const posByN = new Map(placed.map(p => [p.n, p]));
    offExtent.forEach(e => {
      const raw = rawByN.get(e.n);
      posByN.set(e.n, { x: clamp(raw.x, pad, W - pad), y: clamp(raw.y, pad, H - pad), offExtent: true });
    });
    // D15: near-edge in-frame icons get their numbered badge (r=7 circle at
    // translate(size/2-2,-size/2+2)) half-clipped at the frame edge. Nudge the
    // icon inward by the overflow, capped at the MAX_NUDGE(18px) leash already
    // spent by declashIcons — never move star-unique.
    inFrame.forEach(e => {
      if (e.icon === "star-unique") return;
      const size = e.layer === 2 ? 30 : 22;
      const pos = posByN.get(e.n);
      if (!pos) return;
      const raw = rawByN.get(e.n);
      const badgeRight = pos.x + size/2 - 2 + BADGE_INSET;
      const badgeTop = pos.y - size/2 + 2 - BADGE_INSET;
      let nx = pos.x, ny = pos.y;
      if (badgeRight > W) nx -= (badgeRight - W);
      if (badgeTop < 0) ny -= badgeTop;   // badgeTop negative -> pushes ny down (+)
      const dx = nx - raw.x, dy = ny - raw.y;
      const d = Math.hypot(dx, dy);
      if (d > MAX_NUDGE) {
        nx = raw.x + dx / d * MAX_NUDGE;
        ny = raw.y + dy / d * MAX_NUDGE;
      }
      pos.x = nx; pos.y = ny;
    });
    (m.ledger||[]).forEach(e => {
      const size = e.layer === 2 ? 30 : 22;
      const deg = e.icon === "water-bridge" ? bridgeDegFor(m, e) : null;
      const pos = posByN.get(e.n) || { x: px(e.x), y: py(e.y) };
      let g;
      if (pos.offExtent) {
        const raw = rawByN.get(e.n);
        const angleDeg = Math.atan2(raw.y - pos.y, raw.x - pos.x) * 180 / Math.PI;
        g = edgeMark(svg, pos.x, pos.y, angleDeg, CAT_FILL[e.icon] || "#6A7A8A");
      } else {
        g = sprite(svg, e.icon, pos.x, pos.y, size,
                   CAT_FILL[e.icon] || "#6A7A8A", deg);
      }
      g.attr("data-n", e.n).attr("data-icon", e.icon)
        .style("cursor","pointer").attr("aria-label", e.name_vn);
      // numbered badge (L3 only)
      if (e.layer === 3) {
        const badgeOffset = pos.offExtent ? 5 : size/2-2;
        const bg = g.append("g").attr("transform", `translate(${badgeOffset},${-badgeOffset})`);
        bg.append("circle").attr("r", 7).attr("fill","#2A1F14");
        bg.append("text").attr("text-anchor","middle").attr("dy","0.35em")
          .attr("font-size","9px").attr("fill","#fff").attr("font-weight","700").text(e.n);
      }
      g.on("click", () => spotlight({ type:"feature", n:e.n, name:e.name_vn,
        blurb:e.blurb, scroll:true }));
      g.on("mouseenter", () => spotlight({ type:"feature", n:e.n, name:e.name_vn,
        blurb:e.blurb, scroll:false }));
      g.on("mousemove", (ev) => showFeatureTip(ev, e));
      g.on("mouseleave", () => { if (_tip) _tip.style.display = "none"; });
      // D14 touch parity: this handler is shared by both the normal sprite
      // path and the T5 edge-mark path (both assign their <g> to `g` above),
      // so edge-marks get tap-tooltip parity for free. stopPropagation keeps
      // the tap from immediately re-triggering the document-level dismiss
      // listener below. Tap-again on the same lit icon toggles it off.
      g.on("pointerup", (ev) => {
        if (ev.pointerType === "mouse") return;
        ev.stopPropagation();
        const alreadyLit = g.classed("lit");
        if (alreadyLit) {
          dismissTip();
          spotlight({ type:"feature", n:null, scroll:false });
        } else {
          spotlight({ type:"feature", n:e.n, name:e.name_vn,
            blurb:e.blurb, scroll:false });
          showFeatureTip(ev, e);
        }
      });
    });
    renderMapLedger(m);   // numbered margin panel
    applyDemotion(h, m);
  }
  function bridgeDegFor(m, e) {
    // rotate the bridge icon to match the NEAREST bridge way's baked bearing
    const brs = m.geometry.bridges || [];
    if (!brs.length) return null;
    let best = brs[0], bestD = Infinity;
    for (const br of brs) {
      const mid = br.pts[Math.floor(br.pts.length / 2)] || br.pts[0];
      const d = Math.hypot(mid[0] - e.x, mid[1] - e.y);
      if (d < bestD) { bestD = d; best = br; }
    }
    return best.bearing_deg;
  }

  // Draw curated malls onto the hub SVG.
  // All output lives under a single <g class="subhub-layer"> so the toggle
  // can remove everything in one svg.select("g.subhub-layer").remove() call.
  function drawSubhubs(h, svg, projX, projY, W, H) {
    // remove any previous sub-hub layer
    svg.select("g.subhub-layer").remove();

    const layer = svg.append("g").attr("class", "subhub-layer");

    // --- curated malls half (Task 4) ---
    const slug = h.map_slug || "";
    const malls = (_subhubs && _subhubs[slug]) || [];
    malls.filter(m => m.kind === "mall").forEach(m => {
      const cx = projX(m.lon), cy = projY(m.lat);
      const SZ = 10;  // half-side of the square marker
      const g = layer.append("g").attr("class", "subhub-mall");
      g.append("title").text(m.note || m.name);
      g.append("rect")
        .attr("x", cx - SZ).attr("y", cy - SZ)
        .attr("width", SZ * 2).attr("height", SZ * 2);
      g.append("text")
        .attr("x", cx + SZ + 4).attr("y", cy + 4)
        .text(m.name);
    });
  }

  function showFeatureTip(ev, e) {
    const tip = ensureTip();
    tip.innerHTML = "<b>" + esc(e.name_vn) + "</b>" + (e.blurb ? "<br>"+esc(e.blurb) : "");
    tip.style.display = "block";
    // D14 review-fix: route through the same positionTip() clamp used by the
    // dot tooltip so icon/edge-mark tooltips also stay on-screen against the
    // right/bottom viewport edges (not just the top/left floor) — matters on
    // narrow touch viewports where a tap near the map's right/bottom edge
    // would otherwise push the tooltip off-screen.
    positionTip(tip, ev.clientX, ev.clientY);
  }
  // D14 touch parity: hide the tooltip (used by both the icon toggle-off and
  // the tap-elsewhere dismiss below).
  function dismissTip() {
    if (_tip) _tip.style.display = "none";
  }
  // Tap-elsewhere dismiss: any pointerup that reaches `document` (i.e. wasn't
  // stopPropagation()'d by a dot/icon show-handler above) landed outside the
  // interactive map targets, so clear the tooltip + any lit icon/ledger row.
  document.addEventListener("pointerup", (ev) => {
    if (ev.pointerType === "mouse") return;
    dismissTip();
    spotlight({ type:"feature", n:null, scroll:false });
  });
  function renderMapLedger(m) {
    const box = document.getElementById("map-ledger");
    if (!box) return;
    box.innerHTML = (m.ledger||[]).map(e => {
      // D13: h=22 blurbs sometimes just echo the name back ("Starbucks —
      // Starbucks."). Suppress the redundant echo — data untouched.
      const nm = (e.name_vn||"").trim().toLowerCase();
      const bl = (e.blurb||"").trim();
      const echoes = bl && nm && bl.toLowerCase().replace(/[.。]$/, "") === nm;
      const showBlurb = e.blurb && !echoes && !bl.toLowerCase().startsWith(nm);
      return `<li data-n="${e.n}"><b>${e.n}.</b> ${esc(e.name_vn)}` +
      (showBlurb ? ` — <span class="led-blurb">${esc(e.blurb)}</span>` : "") + `</li>`;
    }).join("");
    box.querySelectorAll("li").forEach(li =>
      li.addEventListener("mouseenter", () => spotlight({ type:"feature",
        n: +li.dataset.n, scroll:false })));
  }

  // ---- field-guide spotlight wiring for pick/walkstop/feature ----
  function wireFieldSpotlight(hubMap) {
    const cv = document.getElementById("ldots");
    if (!cv) return;
    cv.addEventListener("hub:select", (ev) => {
      const sel = ev.detail || {};
      document.querySelectorAll(".fg-pick.spotlight,.walk-step.spotlight")
        .forEach(el => el.classList.remove("spotlight"));
      if (sel.type === "pick") {
        const el = document.querySelector(`.fg-pick[data-pick="${CSS.escape(sel.name)}"]`);
        if (el) { el.classList.add("spotlight");
          if (sel.scroll) el.scrollIntoView({behavior:"smooth",block:"nearest"}); }
      } else if (sel.type === "walkstop") {
        const el = document.querySelector(`.walk-step[data-walk="${sel.i}"]`);
        if (el) el.classList.add("spotlight");
      } else if (sel.type === "feature") {
        // light matching icon + ledger row
        document.querySelectorAll("[data-n].lit").forEach(el => el.classList.remove("lit"));
        document.querySelectorAll("#map-ledger li.lit").forEach(el => el.classList.remove("lit"));
        if (sel.n != null) {
          document.querySelectorAll(`[data-n="${sel.n}"]`).forEach(el => el.classList.add("lit"));
          const ledRow = document.querySelector(`#map-ledger li[data-n="${sel.n}"]`);
          if (ledRow) { ledRow.classList.add("lit");
            if (sel.scroll) ledRow.scrollIntoView({behavior:"smooth",block:"nearest"}); }
        }
      }
    });
    // (V1's reverse card→pin/stop hover targeted .pick-pins/.walk-stops SVG
    // groups that only the retired V1 freehand renderer drew. Both are gone in
    // V1.5, so that wiring is removed — drawHubMap's reverse hover runs via
    // [data-n] + #map-ledger above.)
  }

  function drawChips(h, repaint) {
    const counts = h.food_breakdown || {};
    // food groups present, sorted by count desc (region as a stable tiebreak)
    const present = [...new Set(h.places.filter(p => p.food).map(p => p.food.group))]
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) ||
        FREG.indexOf((FG[a] || {}).region) - FREG.indexOf((FG[b] || {}).region));
    // non-food fields present (layers), hidden by default
    const layers = [...new Set(h.places.filter(p => !p.food).map(p => p.field))]
      .filter(Boolean).sort();
    const box = document.getElementById("fieldchips");

    const foodRow = `<div class="chip-row food">` + present.map(g => {
      const fg = FG[g] || FG.unclassified;
      const extra = g === "unclassified" ? " ◌" : "";
      const rare = (counts[g] || 0) <= 2 ? " rare" : "";   // demote singletons
      return `<button class="fchip${rare}" data-g="${g}">` +
        `<i style="background:${fg.color}"></i>${fg.label}${extra}</button>`;
    }).join("") + `</div>`;

    const layerRow = `<div class="chip-row layers"><span class="chip-lbl">+ add</span>` +
      layers.map(f =>
        `<button class="lchip" data-f="${f}">${FIELD_LABEL[f] || f}</button>`
      ).join("") + `</div>`;

    const key = `<p class="specialty-key"><b>✦</b> rare here — a specialty worth the trip</p>`;
    box.innerHTML = foodRow + layerRow + key;

    const fchips = [...box.querySelectorAll(".fchip")];
    function syncGroups() {
      activeGroups = new Set(fchips.filter(b => !b.classList.contains("off"))
        .map(b => b.dataset.g));
      if (activeGroups.size === present.length) activeGroups = null;
    }
    fchips.forEach(btn => {
      btn.onclick = () => {
        if (!activeGroups) activeGroups = new Set(present);
        btn.classList.toggle("off");
        syncGroups();
        repaint();
        applyMapIconFilter();
      };
      btn.ondblclick = () => {
        const g = btn.dataset.g;
        activeGroups = new Set([g]);
        fchips.forEach(b => b.classList.toggle("off", b.dataset.g !== g));
        repaint();
        applyMapIconFilter();
      };
    });

    box.querySelectorAll(".lchip").forEach(btn => btn.onclick = () => {
      const f = btn.dataset.f;
      const on = btn.classList.toggle("on");
      if (on) activeLayers.add(f); else activeLayers.delete(f);
      repaint();
      applyMapIconFilter();
    });

    applyMapIconFilter();   // sync icon layer to the initial filter state
  }

  function drawFood(h) {
    const entries = Object.entries(h.food_breakdown || {})
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const box = document.getElementById("foodbreak");
    if (!entries.length) {
      box.innerHTML = "<span class='muted'>No food places here.</span>";
      document.getElementById("foodline").textContent = "";
      return;
    }
    box.innerHTML = entries.map(([g, n]) => {
      const G = FG[g] || FG.unclassified;
      const spec = isSpecialty(g, n);   // same rule the map ✦ ring uses
      return `<span class="food-stat"><i style="background:${G.color}"></i>` +
        `${G.label} <b>${n}</b>${spec ? " ✦" : ""}</span>`;
    }).join("");
    const total = entries.reduce((s, e) => s + e[1], 0);
    const lab = (g) => ((FG[g] || FG.unclassified).label).toLowerCase();
    let line = "";
    if (total > 0) {
      const top1 = lab(entries[0][0]);
      const top2 = entries[1] ? lab(entries[1][0]) : null;
      line = top2
        ? `${total} places to eat or drink — mostly ${top1} and ${top2}.`
        : `${total} places to eat or drink — mostly ${top1}.`;
    }
    document.getElementById("foodline").textContent = line;
  }

  function stacked(el, counts, parts, colors, labels) {
    const total = parts.reduce((s, p) => s + (counts[p]||0), 0) || 1;
    document.getElementById(el).innerHTML =
      `<div class="big-bar">` + parts.map((p) =>
        `<span style="width:${100*(counts[p]||0)/total}%;background:${colors[p]}"
           title="${labels[p]}: ${counts[p]||0}"></span>`).join("") + `</div>` +
      `<div class="bar-key">` + parts.filter((p) => counts[p]).map((p) =>
        `<span><i style="background:${colors[p]}"></i>${labels[p]} ${counts[p]||0}</span>`
      ).join("") + `</div>`;
  }

  function drawBars(h) {
    stacked("lives", h.lives, [...LIVES, "unclassified"], PALETTE, LIFE_LABEL);
    stacked("split", {chain:h.split.chain, indep:h.split.indep},
            ["chain","indep"], {chain:CHAIN, indep:INDEP},
            {chain:"Chain", indep:"Independent"});
  }

  const GEN_LABEL = {school:"Schools", health:"Health", office:"Offices",
                     hotel:"Hotels", market:"Markets"};
  const GEN_GLYPH = {school:"🎓", health:"🏥", office:"🏢", hotel:"🏨", market:"🛒"};
  const BUILTUP_WORD = (s) => s >= 0.66 ? "high" : s >= 0.33 ? "medium" : "low";

  function drawWhy(h) {
    const f = h.form || {kind:"cluster", streets:[]};
    let where;
    if (f.kind === "crossroads" && f.streets.length >= 2)
      where = `Where ${f.streets[0]} meets ${f.streets[1]}`;
    else if (f.kind === "spine" && f.streets.length)
      where = `Along the ${f.streets[0]} spine`;
    else where = "A dense local cluster";
    const g = h.generators || {};
    const parts = ["school","health","office","hotel"]
      .filter(k => g[k]).map(k => `${g[k]} ${GEN_LABEL[k].toLowerCase()}`);
    const draw = parts.length ? ` with ${parts.join(", ")} within a five-minute walk` : "";
    document.getElementById("why").textContent =
      `${where}${draw} — the crowd that the ${h.split.chain} chains and ${h.split.indep} independents feed.`;
    // built-up mini-bar
    const s = (h.builtup && h.builtup.score) || 0;
    const pct = Math.round(s * 100);
    const cov = h.builtup ? h.builtup.count.toLocaleString() : "0";
    document.getElementById("builtup").innerHTML =
      `<span class="bu-label">Built-up</span>` +
      `<span class="bu-track"><span class="bu-fill" style="width:${pct}%"></span></span>` +
      `<span class="bu-word">${BUILTUP_WORD(s)}</span>` +
      `<span class="bu-note">${cov} buildings (footprint proxy, not population)</span>`;
  }

  function drawGenerators(h) {
    const g = h.generators || {};
    const order = ["school","health","office","hotel","market"];
    const html = order.filter(k => g[k]).map(k =>
      `<span class="gen"><b>${GEN_GLYPH[k]}</b> ${GEN_LABEL[k]} <b>${g[k]}</b></span>`
    ).join("");
    document.getElementById("generators").innerHTML =
      (html || "<span class='gen muted'>No standout draws nearby</span>") +
      `<p class="gen-cap">within ~5-min walk</p>`;
  }

  function drawNeighbours(h, byRank, relations) {
    const mine = (relations || []).filter(r => r.a === h.id || r.b === h.id);
    const other = (r) => r.a === h.id ? r.b : r.a;
    const idToHub = new Map([...byRank.values()].map(x => [x.id, x]));
    const ICON = {compete:"⚔", complement:"🤝", border:"·"};
    const VERB = {compete:"Competes with", complement:"Complements", border:"Borders"};
    const rank = {compete:0, complement:1, border:2};
    mine.sort((p, q) => rank[p.type] - rank[q.type] || q.shared_nodes - p.shared_nodes);
    document.getElementById("neighbours").innerHTML = mine.map(r => {
      const o = idToHub.get(other(r)); if (!o) return "";
      const detail = r.type === "compete"
        ? `${r.shared_nodes} shared-reach nodes`
        : r.type === "complement" ? "different life-mix" : "adjacent";
      return `<li><span class="rel ${r.type}">${ICON[r.type]}</span> ` +
             `${VERB[r.type]} <a href="hub.html?h=${o.rank}">${o.title}</a> ` +
             `<span class="rel-note">— ${detail}</span></li>`;
    }).join("") || "<li class='muted'>Stands alone — no reachable neighbour.</li>";
  }

  function drawCats(h) {
    document.getElementById("cats").innerHTML = (h.top_cats || []).map((c) =>
      `<li>${c.cat} <b>×${c.n}</b></li>`).join("") || "<li>—</li>";
    document.getElementById("examples").innerHTML = (h.examples || []).map((e) =>
      `<li>${e.name}<span class="tag ${e.chain?'chain':'indep'}">${e.chain?'chain':'independent'}</span></li>`
    ).join("") || "<li>—</li>";
  }

  function pager(h, total, byRank) {
    const prev = document.getElementById("prev"), next = document.getElementById("next");
    if (h.rank > 1) {
      const p = byRank.get(h.rank - 1);
      prev.href = `hub.html?h=${h.rank-1}`;
      prev.textContent = "← " + (p ? p.title : "Hub " + (h.rank-1));
    }
    if (h.rank < total) {
      const n = byRank.get(h.rank + 1);
      next.href = `hub.html?h=${h.rank+1}`;
      next.textContent = (n ? n.title : "Hub " + (h.rank+1)) + " →";
    }
  }

  // ---- C1: fullscreen lightbox ----
  let _lightboxInited = false;
  function initMapLightbox(redraw) {
    if (_lightboxInited) return;   // only wire once per page load
    _lightboxInited = true;
    const mapSection = document.querySelector(".hub-grid-b2 .hub-map");
    if (!mapSection) return;
    // inject the ⛶ button
    const btn = document.createElement("button");
    btn.className = "map-fs-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "View map fullscreen");
    btn.textContent = "⛶";
    mapSection.appendChild(btn);

    // build the overlay shell once
    const lb = document.createElement("div");
    lb.className = "map-lightbox";
    lb.hidden = true;
    lb.innerHTML =
      '<button class="lb-close" aria-label="Close fullscreen">×</button>' +
      '<div class="lb-stage"><div class="lb-map"></div><div class="lb-ledger"></div></div>';
    document.body.appendChild(lb);
    const lbMap = lb.querySelector(".lb-map");
    const lbLedger = lb.querySelector(".lb-ledger");
    const closeBtn = lb.querySelector(".lb-close");

    let placeholder = null;       // where the map section came from
    let ledgerHome = null, ledgerEl = null;

    function open() {
      placeholder = document.createComment("map-home");
      mapSection.parentNode.replaceChild(placeholder, mapSection);
      lbMap.appendChild(mapSection);
      ledgerEl = document.getElementById("map-ledger");
      if (ledgerEl) { ledgerHome = document.createComment("ledger-home");
        ledgerEl.parentNode.replaceChild(ledgerHome, ledgerEl); lbLedger.appendChild(ledgerEl); }
      lb.hidden = false; document.body.classList.add("lightbox-open");
      if (typeof redraw === "function") redraw();   // re-size canvas to big box
      closeBtn.focus();
    }
    function close() {
      if (placeholder) placeholder.parentNode.replaceChild(mapSection, placeholder), placeholder = null;
      if (ledgerHome && ledgerEl) ledgerHome.parentNode.replaceChild(ledgerEl, ledgerHome), ledgerHome = null;
      lb.hidden = true; document.body.classList.remove("lightbox-open");
      if (typeof redraw === "function") redraw();   // re-size canvas back to inline box
      btn.focus();
    }
    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) close(); });
  }

})();
