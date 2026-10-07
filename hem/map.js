// Interactive depth map: vector road basemap + d3-zoom SVG POI overlay (all in one zoom group).
// Registration: map_points.json carries `bounds`=[minx,miny,maxx,maxy] (the padded
// square district extent the bake fits to (total_bounds + 1% pad), aspect-preserving);
// we fit a square equirectangular x/y scale to it with the same Math.min letterbox so
// roads and dots share one coordinate space. Click a dot -> identity card.
// Legend hover dims other depths. t1 = PUBLIC (civic) only, t2 = all. Play animates.
const YEARS = Array.from({length:11}, (_,i)=>2015+i);
const RAMP = {"-1":"var(--d-art)","0":"var(--d0)","1":"var(--d1)","2":"var(--d2)","3":"var(--d3)"};
const clampDepth = d => Math.max(-1, Math.min(3, d));   // -2 frontage folds into arterial
const depthColor = d => RAMP[String(clampDepth(d))];
const GHOST = "var(--d-ghost)";
// civic-landmark glyphs for t1: school/hospital/worship/market
const ICON_FOR = v => {
  if (["school","kindergarten","college","university"].includes(v)) return "▢";
  if (["hospital","clinic","doctors","pharmacy"].includes(v)) return "✚";
  if (v === "place_of_worship") return "▲";
  if (v === "marketplace") return "◆";
  return null;
};
let DATA=null, ROADS=null, type="t1", year=2025, playing=null;
let svg, gZoom, gRoads, gDots, gIcons, x, y, zoom;

const VIEW = 600;  // square SVG viewBox (matches the square padded district extent)

function fit(bounds){
  const [minx,miny,maxx,maxy] = bounds;
  const sx = VIEW/(maxx-minx), sy = VIEW/(maxy-miny), s = Math.min(sx,sy);
  const ox = (VIEW - s*(maxx-minx))/2, oy = (VIEW - s*(maxy-miny))/2;
  x = lon => ox + (lon-minx)*s;
  y = lat => VIEW - (oy + (lat-miny)*s);
}

function visiblePoints(){
  const frame = DATA.frames.find(f=>f.year===year) || {points:[]};
  // t1 = civic layer. A civic landmark that has its own glyph (school/clinic/
  // worship/market) is drawn ONLY as that glyph by drawIcons(); drawing a dot
  // under it too put a coloured circle and a glyph on the exact same spot — the
  // "duplication on the same spot" the map showed. So here we keep only the
  // PUBLIC points that have NO glyph (they still need a dot to be visible).
  if (type==="t1") return frame.points.filter(p=>p.klass==="PUBLIC" && !ICON_FOR(p.value));
  return frame.points;
}

const line = d3.line().x(d=>x(d[0])).y(d=>y(d[1]));

function currentRoads(){
  const frame = (ROADS.frames || []).find(f=>f.year===year) || {roads:[]};
  return frame.roads;
}

function drawRoads(){
  const roads = currentRoads();
  const sel = gRoads.selectAll("path").data(roads, (d,i)=>i);
  sel.exit().remove();
  // Paths are index-keyed, so nodes are reused across years/toggle. Every
  // type/depth-varying attr MUST stay in the .merge() chain (not .enter()), or a
  // retained path would keep a stale stroke/width from the previous frame.
  sel.enter().append("path")
   .merge(sel)
     .attr("d", d=>line(d.coords))
     .attr("stroke", d=> type==="t1" ? depthColor(d.depth) : GHOST)
     // t1: arterials (depth<=-1) a touch heavier than hẻm for legibility on
     // screen; t2: uniform hairline. (The matplotlib bake used 0.7/0.5 px.)
     .attr("stroke-width", d=> type==="t2" ? 0.5 : (d.depth<=-1 ? 1.1 : 0.7))
     .attr("opacity", type==="t2" ? 0.9 : 1);
}

function drawIcons(){
  // t1 only: civic landmarks as glyph markers coloured by depth. In t2 the field
  // is "every dot", so icons add nothing — clear the layer.
  if (type !== "t1"){ gIcons.selectAll("*").remove(); return; }
  const pts = (DATA.frames.find(f=>f.year===year) || {points:[]}).points
                .filter(p=>p.klass==="PUBLIC" && ICON_FOR(p.value));
  const sel = gIcons.selectAll("text").data(pts, (d,i)=>i);
  sel.exit().remove();
  sel.enter().append("text")
     .attr("text-anchor","middle").attr("dominant-baseline","central")
     .attr("font-size", 7).style("cursor","pointer")
     // glyphs are now the ONLY mark for civic landmarks, so they carry the click
     // that used to live on the (removed) dot underneath them.
     .on("click", (e,d)=>{ e.stopPropagation(); showCard(d, e); })
   .merge(sel)
     .attr("x", d=>x(d.lon)).attr("y", d=>y(d.lat))
     .attr("fill", d=>depthColor(d.depth))
     .text(d=>ICON_FOR(d.value));
}

function drawDots(){
  const pts = visiblePoints();
  const sel = gDots.selectAll("circle").data(pts, (d,i)=>i);
  sel.exit().remove();
  sel.enter().append("circle")
     .attr("r", 3.2).attr("stroke","#2b2622").attr("stroke-width",0.3)
     .on("click", (e,d)=>{ e.stopPropagation(); showCard(d, e); })
   .merge(sel)
     .attr("cx", d=>x(d.lon)).attr("cy", d=>y(d.lat))
     .attr("fill", d=>depthColor(d.depth))
     .attr("opacity", 0.85);
}

const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function showCard(d, e){
  const card = document.getElementById("map-card");
  const head = d.name ? `<b>${esc(d.name)}</b> · ${esc(d.value||"place")}`
                      : `${esc(d.value||"place")}`;
  const road = d.road ? `<div class="mc-road">on <i>${esc(d.road)}</i> · depth ${d.depth}</div>`
                      : `<div class="mc-road">depth ${d.depth}</div>`;
  card.innerHTML = `<button class="mc-x" aria-label="close">✕</button>${head}${road}
    <div class="mc-year">first mapped by OSM in ${year}</div>`;
  card.hidden = false;
  const fig = document.getElementById("map-figure").getBoundingClientRect();
  let left = e.clientX - fig.left + 10, top = e.clientY - fig.top + 10;
  card.style.left = Math.max(0, Math.min(left, fig.width-180))+"px";
  card.style.top  = Math.max(0, Math.min(top, fig.height-90))+"px";
  card.querySelector(".mc-x").onclick = ()=>{ card.hidden = true; };
}

function show(y){
  year = y;
  document.getElementById("year").value = y;
  document.getElementById("year-readout").textContent = `as known to OpenStreetMap in ${y}`;
  drawRoads();
  drawDots();
  drawIcons();
}

function legendHover(){
  // Dim by depth across BOTH layers — dots and the civic glyphs (which since the
  // dedup fix are the only mark for school/clinic/worship/market points).
  document.querySelectorAll("#map-legend span").forEach(s=>{
    s.onmouseenter = ()=>{ const d=+s.dataset.depth;
      gDots.selectAll("circle").attr("opacity", p=> (clampDepth(p.depth)===d)?0.95:0.12);
      gIcons.selectAll("text").attr("opacity", p=> (clampDepth(p.depth)===d)?1:0.12); };
    s.onmouseleave = ()=>{ gDots.selectAll("circle").attr("opacity",0.85);
      gIcons.selectAll("text").attr("opacity",1); };
  });
}

async function initMap(){
  DATA = await (await fetch("data/map_points.json")).json();
  ROADS = await (await fetch("data/map_roads.json")).json();
  svg = d3.select("#map-svg").attr("viewBox", `0 0 ${VIEW} ${VIEW}`);
  gZoom = svg.append("g");
  gRoads = gZoom.append("g");   // vector basemap — under the dots
  gDots = gZoom.append("g");
  gIcons = gZoom.append("g");   // t1 civic markers — above the dots
  fit(DATA.bounds);
  zoom = d3.zoom().scaleExtent([1,12]).on("zoom", e=>{
    gZoom.attr("transform", e.transform);
  });
  svg.call(zoom);
  svg.on("click", ()=>{ document.getElementById("map-card").hidden = true; });
  document.getElementById("map-reset").onclick = ()=> svg.transition().call(zoom.transform, d3.zoomIdentity);
  document.querySelectorAll("input[name=maptype]").forEach(r =>
    r.onchange = ()=>{ type=r.value; drawRoads(); drawDots(); drawIcons(); });
  document.getElementById("year").oninput = e => show(+e.target.value);
  document.getElementById("play").onclick = ()=>{
    const btn=document.getElementById("play");
    if (playing){ clearInterval(playing); playing=null; btn.textContent="▶ Play"; return; }
    btn.textContent="❚❚ Pause";
    let i = YEARS.indexOf(year);
    playing = setInterval(()=>{ i=(i+1)%YEARS.length; show(YEARS[i]); }, 900);
  };
  legendHover();
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") document.getElementById("map-card").hidden=true; });
  show(2025);
}
document.addEventListener("DOMContentLoaded", initMap);
