// cuisine.js — district-wide cuisine cluster map.
(function () {
  const FG = window.FOOD_GROUPS, FREG = window.FOOD_REGION_ORDER;
  let active = null;   // null = all; else Set of groups shown

  d3.json("cuisine.json").then((data) => {
    const W = 900, H = 680, pad = 18;
    const [x0, y0, x1, y1] = data.bounds;
    const x = d3.scaleLinear([x0, x1], [pad, W - pad]);
    const y = d3.scaleLinear([y0, y1], [H - pad, pad]);
    const cv = document.getElementById("ddots");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = "100%"; cv.style.height = "auto";
    const ctx = cv.getContext("2d");

    function paint() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawBoundary(ctx, x, y, data.boundary);
      data.points.forEach((p) => {
        if (active && !active.has(p.group)) return;
        const G = FG[p.group] || FG.unclassified;
        ctx.beginPath(); ctx.arc(x(p.lon), y(p.lat), 2.2, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.7; ctx.fillStyle = G.color; ctx.fill();
      });
      ctx.globalAlpha = 1;
      // selection highlight
      if (selection) {
        const sel = selection.kind === "point" ? [selection.p] : selection.pts;
        sel.forEach((p) => {
          ctx.beginPath();
          ctx.arc(x(p.lon), y(p.lat), 4.5, 0, 2 * Math.PI);
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = "#1c1a17";
          ctx.globalAlpha = 1;
          ctx.stroke();
        });
      }
    }

    let selection = null;   // null | {kind:"point", p} | {kind:"cluster", pts}

    function shown(p) { return !active || active.has(p.group); }

    function nearestPoint(mx, my) {
      // mx,my in CSS pixels relative to the canvas; data uses the same x()/y().
      const R = 14;                 // hit radius in px
      let best = null, bestD = R * R;
      for (const p of data.points) {
        if (!shown(p)) continue;
        const dx = x(p.lon) - mx, dy = y(p.lat) - my;
        const d = dx * dx + dy * dy;
        if (d <= bestD) { bestD = d; best = p; }
      }
      return best;
    }

    const card = document.getElementById("cuisine-card");
    const ANON = "Mapped anonymously — this layer carries no business names.";

    function titleCase(s) {
      return String(s || "").replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    function ruleToProse(rule, dish) {
      if (!rule) return "Counted as a generic eatery.";
      if (rule.startsWith("name") || rule.includes("name:"))
        return dish ? `Detected from its name (${esc(dish)}).` : "Detected from its name.";
      if (rule.startsWith("tag:") || rule.includes("category") || rule.includes("overture"))
        return "Classified from its Overture category.";
      if (rule.includes("fallback")) return "No dish named — counted as a generic eatery.";
      return titleCase(rule);
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function swatch(group) {
      const G = FG[group] || FG.unclassified;
      return `<i class="cuisine-sw" style="background:${G.color}"></i>${esc(G.label)}`;
    }
    function topCounts(pts, key, n) {
      const m = new Map();
      pts.forEach((p) => { const k = p[key]; if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    }

    function renderCard(sel) {
      card.classList.toggle("has-selection", !!sel);
      if (!sel) {
        card.innerHTML = `<p class="cuisine-card-empty">Tap a dot, or drag a box over a cluster, to see what's here.</p>`;
        return;
      }
      if (sel.kind === "point") {
        const p = sel.p;
        card.innerHTML =
          `<button class="cuisine-card-close" aria-label="Close">×</button>` +
          `<h3 class="cuisine-card-h">${swatch(p.group)}</h3>` +
          `<dl class="cuisine-card-dl">` +
          `<div><dt>Kind</dt><dd>${p.chain ? "Chain" : "Independent"}</dd></div>` +
          `<div><dt>Category</dt><dd>${esc(titleCase(p.primary))}</dd></div>` +
          `<div><dt>How classed</dt><dd>${esc(ruleToProse(p.rule, p.dish))}</dd></div>` +
          `</dl>` +
          `<p class="cuisine-card-anon">${ANON}</p>`;
      } else {
        const pts = sel.pts;
        const dishes = topCounts(pts, "group", 6)
          .map(([g, n]) => `<div class="cuisine-bar-row">${swatch(g)}<b>${n}</b></div>`).join("");
        const chains = pts.filter((p) => p.chain).length;
        const cats = topCounts(pts, "primary", 4)
          .map(([c, n]) => `${esc(titleCase(c))} ${n}`).join(" · ");
        card.innerHTML =
          `<button class="cuisine-card-close" aria-label="Close">×</button>` +
          `<h3 class="cuisine-card-h">${pts.length} places in this area</h3>` +
          `<div class="cuisine-bars">${dishes}</div>` +
          `<p class="cuisine-card-split">${chains} chain · ${pts.length - chains} independent</p>` +
          `<p class="cuisine-card-cats">${cats}</p>` +
          `<p class="cuisine-card-anon">${ANON}</p>`;
      }
      const close = card.querySelector(".cuisine-card-close");
      if (close) close.onclick = () => setSelection(null);
    }

    function setSelection(sel) {
      selection = sel;
      paint();
      renderCard(sel);            // defined in Task 5
    }

    function evToCanvas(ev) {
      const r = cv.getBoundingClientRect();
      return [ (ev.clientX - r.left) / r.width  * W,
               (ev.clientY - r.top)  / r.height * H ];
    }
    let marqueeMode = false;        // mobile opt-in (Task 6 toggles it); desktop always allows drag
    let mq = null;                  // {x0,y0,x1,y1} in canvas space during drag

    function pointsInBox(b) {
      const [lo, hi] = [Math.min, Math.max];
      const xa = lo(b.x0, b.x1), xb = hi(b.x0, b.x1);
      const ya = lo(b.y0, b.y1), yb = hi(b.y0, b.y1);
      return data.points.filter((p) => {
        if (!shown(p)) return false;
        const px = x(p.lon), py = y(p.lat);
        return px >= xa && px <= xb && py >= ya && py <= yb;
      });
    }

    function isDragSurface(ev) {
      // Desktop (fine pointer) always; touch only when the user armed "Select area".
      return ev.pointerType !== "touch" || marqueeMode;
    }

    cv.addEventListener("pointerdown", (ev) => {
      if (!isDragSurface(ev)) return;
      const [mx, my] = evToCanvas(ev);
      mq = { x0: mx, y0: my, x1: mx, y1: my };
      cv._marqueeMoved = false;
      cv.setPointerCapture(ev.pointerId);
    });
    cv.addEventListener("pointermove", (ev) => {
      if (!mq) return;
      const [mx, my] = evToCanvas(ev);
      if (Math.hypot(mx - mq.x0, my - mq.y0) > 4) cv._marqueeMoved = true;
      mq.x1 = mx; mq.y1 = my;
      paint();
      // draw the marquee rect on top
      ctx.save();
      ctx.strokeStyle = "#1c1a17"; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(mq.x0, mq.x1), Math.min(mq.y0, mq.y1),
                     Math.abs(mq.x1 - mq.x0), Math.abs(mq.y1 - mq.y0));
      ctx.restore();
    });
    cv.addEventListener("pointerup", (ev) => {
      if (!mq) return;
      const box = mq; mq = null;
      try { cv.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (cv._marqueeMoved) {
        const pts = pointsInBox(box);
        setSelection(pts.length ? { kind: "cluster", pts } : null);
      }
      // a non-moved pointerup falls through to the click handler (single select)
    });

    cv.addEventListener("click", (ev) => {
      if (cv._marqueeMoved) { cv._marqueeMoved = false; return; } // ignore drag-end click
      const [mx, my] = evToCanvas(ev);
      const p = nearestPoint(mx, my);
      setSelection(p ? { kind: "point", p } : null);
    });

    paint();
    drawLegend(data, paint);

    const mqBtn = document.getElementById("cuisine-marquee");
    if (mqBtn) mqBtn.addEventListener("click", () => {
      marqueeMode = !marqueeMode;
      mqBtn.setAttribute("aria-pressed", String(marqueeMode));
      cv.style.touchAction = marqueeMode ? "none" : "";   // free scroll when off
    });
  }).catch((e) => document.getElementById("cuisine-main").innerHTML =
    `<pre style="color:#c00">Failed to load cuisine.json: ${e}</pre>`);

  function drawBoundary(ctx, x, y, ring) {
    if (!ring || ring.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      const px = x(lon), py = y(lat);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "#bdae90";       // faint sand fill
    ctx.globalAlpha = 0.06;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#cdbf9f";     // soft outline (the chip-border family)
    ctx.stroke();
    ctx.restore();
  }

  function drawLegend(data, repaint) {
    const present = [...new Set(data.points.map(p => p.group))]
      .sort((a, b) => FREG.indexOf(FG[a].region) - FREG.indexOf(FG[b].region));
    const box = document.getElementById("dchips");
    box.innerHTML = present.map(g =>
      `<button class="fchip" data-g="${g}"><i style="background:${FG[g].color}"></i>` +
      `${FG[g].label}${g === "unclassified" ? " ◌" : ""}</button>`
    ).join("");
    const chips = [...box.querySelectorAll(".fchip")];

    // Reflect `active` (null = all shown) onto the chips, then repaint the map.
    function sync() {
      if (active && active.size >= present.length) active = null;  // "all" collapses to null
      chips.forEach(b => b.classList.toggle("off", !!active && !active.has(b.dataset.g)));
      repaint();
    }

    chips.forEach(btn => {
      btn.onclick = (ev) => {
        const g = btn.dataset.g;
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          // Modifier-click = add / remove this dish from the current selection.
          active = new Set(active || present);
          if (active.has(g)) active.delete(g); else active.add(g);
          if (active.size === 0) active = null;  // emptied → show all
        } else if (active && active.size === 1 && active.has(g)) {
          // Click the lone isolated dish again → back to all.
          active = null;
        } else {
          // Plain click = isolate to just this dish (the headline gesture).
          active = new Set([g]);
        }
        sync();
      };
    });
  }
})();
