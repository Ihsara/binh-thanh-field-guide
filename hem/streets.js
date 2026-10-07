// Busiest-streets bars: the named roads carrying the most mapped FOOD POIs in
// 2025, each with a tick at its 2015 level (the gap past the tick = how fast it
// filled). Derived CLIENT-SIDE from the already-baked map_points.json — no extra
// data file, no DB. Same vanilla-SVG idiom as inversion.js (no d3 here).
const FOOD_FILL = "#e8a679";   // --d0, the FOOD tone (matches the inversion chart)
const TOP_N = 10;

// Pure: from map_points.json's frames, rank named roads by 2025 FOOD-POI count,
// carrying each road's 2015 count too. Returns [{road, c2025, c2015}], desc by
// c2025 then road name (deterministic — drives a committed-data view). Exported
// on window so a tiny inline test / console check can re-derive the same list.
function rankFoodStreets(mapPoints, n = TOP_N) {
  const frames = Object.fromEntries(mapPoints.frames.map(f => [f.year, f.points]));
  const foodByRoad = (pts) => {
    const c = {};
    for (const p of pts || []) {
      if (p.klass === "FOOD" && p.road) c[p.road] = (c[p.road] || 0) + 1;
    }
    return c;
  };
  const now = foodByRoad(frames[2025]);
  const then = foodByRoad(frames[2015]);
  return Object.keys(now)
    .map(road => ({ road, c2025: now[road], c2015: then[road] || 0 }))
    .sort((a, b) => (b.c2025 - a.c2025) || a.road.localeCompare(b.road))
    .slice(0, n);
}
window.rankFoodStreets = rankFoodStreets;

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));

function drawStreets(rows) {
  const svg = document.getElementById("streets-svg");
  const W = 720, rowH = 34, pad = 6, x0 = 168, barW = W - x0 - 62;
  const maxC = Math.max(1, ...rows.map(r => r.c2025));
  const scale = c => (c / maxC) * barW;
  svg.setAttribute("viewBox", `0 0 ${W} ${rows.length * rowH + 16}`);
  let html = "";
  rows.forEach((r, i) => {
    const y = i * rowH + pad;
    const w = scale(r.c2025);
    const tickX = x0 + scale(r.c2015);
    const grew = r.c2025 - r.c2015;
    const shrank = r.c2015 > r.c2025;   // a street that LOST mapped food since 2015
    const title = `${esc(r.road)}: ${r.c2015} → ${r.c2025} mapped food places`;
    // row label (street name), right-aligned to the bar origin
    html += `<text x="${x0 - 8}" y="${y + 18}" font-size="13" fill="#2b2622"
                   text-anchor="end">${esc(r.road)}</text>`;
    // a "fell back" stub from the 2025 bar end out to the 2015 level, so a tick
    // sitting PAST the bar reads as a decline, not a floating glitch.
    if (shrank) html += `<line x1="${x0 + w}" x2="${tickX}" y1="${y + 13}" y2="${y + 13}"
                   stroke="#cdbfa6" stroke-width="2" stroke-dasharray="2 2"></line>`;
    // the bar (2025 level)
    html += `<rect x="${x0}" y="${y + 3}" width="${w}" height="20" rx="2"
                   fill="${FOOD_FILL}"><title>${title}</title></rect>`;
    // 2015 tick — a short vertical line at the 2015 level. Sits at the bar origin
    // for streets that were empty in 2015 (the clearest "small → busy" signal).
    html += `<line x1="${tickX}" x2="${tickX}" y1="${y}" y2="${y + 26}"
                   stroke="#7c2d16" stroke-width="2"
                   stroke-opacity="${r.c2015 ? 0.85 : 0.35}"></line>`;
    // count at the bar end, plus a "+N" / "−N" change note. The label x-anchors
    // past whichever is further right (bar end or a past-bar tick) so it never
    // collides with a decline tick.
    const labelX = Math.max(x0 + w, tickX) + 6;
    const delta = grew > 0 ? `<tspan fill="#a99f8f"> +${grew}</tspan>`
                : grew < 0 ? `<tspan fill="#a99f8f"> −${-grew}</tspan>` : "";
    html += `<text x="${labelX}" y="${y + 18}" font-size="12"
                   fill="#5b5247">${r.c2025}${delta}</text>`;
  });
  svg.innerHTML = html;
}

async function initStreets() {
  const mp = await (await fetch("data/map_points.json")).json();
  const rows = rankFoodStreets(mp);
  drawStreets(rows);
  // The blind-spot caveat — naming Vạn Kiếp. The arterial "Vạn Kiếp" carries just
  // 2 mapped FOOD POIs (both fast_food), ranking ~#18 — well below the top-10
  // cutoff of 3 — despite its real bún/ốc street-food reputation. Guarded by
  // tests/test_food_streets.py so a data refresh can't silently break this copy.
  document.getElementById("streets-caveat").innerHTML =
    `<b>What this misses.</b> These are the streets where OpenStreetMap volunteers
     <em>pinned</em> food — not where the food actually is. Informal street food barely
     registers: <b>Vạn Kiếp</b>, a street locals know for its bún and ốc stalls and
     whose alleys OSM has mapped, shows only <b>two</b> mapped food points — too few to
     reach this list. Read the bars as a map of mapping effort as much as of appetite.`;
}
document.addEventListener("DOMContentLoaded", initStreets);
