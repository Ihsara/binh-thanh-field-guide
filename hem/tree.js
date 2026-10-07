// Dual-mode hẻm tree: "fan" (abstract radial, made legible) and "geo" (real polylines).
// Shared: boulevard <select>, depth ramp, node tooltip + lineage highlight, stats sidebar.
const RAMP = {"-1":"#cdbfa6","0":"#e8a679","1":"#c0552f","2":"#7c2d16","3":"#3a160b"};
const depthColor = d => RAMP[Math.max(-1, Math.min(3, d))];
const HOWTO = {
  fan:"Centre is the boulevard. Each ring outward is one turn deeper into the alleys. Colour shows depth.",
  geo:"The same boulevard and its alleys, drawn where they really run on the ground."
};
// HTML-escape OSM-derived strings before innerHTML injection (consistent with map.js).
// Only the 4 HTML-significant chars — Vietnamese diacritics pass through untouched.
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let TREE=null, GEO=null, mode="fan", current=null;

async function initTree(){
  TREE = await (await fetch("data/tree.json")).json();
  GEO  = await (await fetch("data/tree_geo.json")).json();
  const sel = document.getElementById("arterial");
  sel.innerHTML = "";
  TREE.order.forEach(a => sel.add(new Option(`${a} (${TREE.counts[a]})`, a)));
  current = TREE.order[0];
  sel.value = current;
  sel.onchange = ()=>{ current = sel.value; render(); };
  document.querySelectorAll("input[name=treemode]").forEach(r =>
    r.onchange = ()=>{ mode = r.value; render(); });
  render();
}

function render(){
  document.getElementById("tree-howto").textContent = HOWTO[mode];
  const svg = d3.select("#tree-svg"); svg.selectAll("*").remove();
  hideTip();
  (mode==="fan" ? drawFan : drawGeo)(svg);
  drawStats();
}

// ---------- shared helpers ----------
function showTip(d, e){
  const tip = document.getElementById("tree-tip");
  const depth = d.depth ?? d.data?.depth;
  const path  = d.path ?? d.data?.path ?? "";
  if (depth === -1){ tip.innerHTML = `<b>${esc(current)}</b><br>the boulevard`; }
  else {
    const segs = String(path).split("/");
    tip.innerHTML = `<b>Hẻm ${esc(path)} ${esc(current)}</b><br>` +
      `house ${esc(segs[0])} off the boulevard` +
      (segs.length>1 ? `, then alley ${esc(segs.slice(1).join(" → "))}` : "") +
      ` · depth ${depth}`;
  }
  tip.hidden=false;
  const fig=document.getElementById("tree-svg").getBoundingClientRect();
  tip.style.left=(e.clientX-fig.left+12)+"px"; tip.style.top=(e.clientY-fig.top+12)+"px";
}
function hideTip(){ document.getElementById("tree-tip").hidden=true; }

function drawStats(){
  const root = d3.hierarchy(TREE.arterials[current], d=>d.children);
  const nodes = root.descendants().filter(n=>n.data.depth>=0);
  const total = nodes.length;
  // root.height counts edges from the depth -1 boulevard root, so the deepest
  // real address sits at depth root.height-1 (matching the tooltip + ring labels).
  const maxDepth = total ? root.height - 1 : -1;
  const d2plus = nodes.filter(n=>n.data.depth>=2).length;
  const pct = total ? Math.round(100*d2plus/total) : 0;
  document.getElementById("tree-stats").innerHTML =
    `<h3>${esc(current)}</h3>
     <p><b>${TREE.counts[current]}</b> alleys branch off this boulevard.</p>
     ${maxDepth>=0 ? `<p>Deepest address reaches <b>depth ${maxDepth}</b>.</p>` : ""}
     <p><b>${pct}%</b> of its mapped branch points lie at depth 2 or deeper.</p>`;
}

// ---------- mode: fan ----------
function drawFan(svg){
  const data = TREE.arterials[current];
  if (!data.children || !data.children.length){
    document.getElementById("tree-cap").textContent = `${current} has no mapped alleys.`; return; }
  const W=720,H=720,R=Math.min(W,H)/2-50;
  const g = svg.append("g").attr("transform",`translate(${W/2},${H/2})`);
  const root = d3.hierarchy(data, d=>d.children);
  d3.cluster().size([2*Math.PI, R])(root);
  const toXY = d => [Math.cos(d.x-Math.PI/2)*d.y, Math.sin(d.x-Math.PI/2)*d.y];
  const ringR = {}; root.each(n=>{ ringR[n.data.depth]=n.y; });
  Object.entries(ringR).sort((a,b)=>a[1]-b[1]).forEach(([d,r])=>{
    g.append("circle").attr("r",r).attr("fill","none").attr("stroke","#e4d8c2").attr("stroke-dasharray","2 4");
    g.append("text").attr("y",-r-2).attr("font-size",10).attr("fill","#a99f8f").attr("text-anchor","middle")
      .text(d==="-1"?"boulevard":`d${d}`);
  });
  g.selectAll("line.link").data(root.links()).join("line")
    .attr("x1",d=>toXY(d.source)[0]).attr("y1",d=>toXY(d.source)[1])
    .attr("x2",d=>toXY(d.target)[0]).attr("y2",d=>toXY(d.target)[1])
    .attr("stroke",d=>depthColor(d.target.data.depth)).attr("stroke-width",1.2)
    .attr("opacity",0.8).style("mix-blend-mode","multiply");
  g.selectAll("circle.node").data(root.descendants()).join("circle")
    .attr("class","node").attr("cx",d=>toXY(d)[0]).attr("cy",d=>toXY(d)[1])
    .attr("r",d=>d.data.depth===-1?6:3).attr("fill",d=>depthColor(d.data.depth))
    .style("cursor","pointer")
    .on("mousemove",(e,d)=>showTip(d.data,e)).on("mouseleave",hideTip);
  document.getElementById("tree-cap").textContent =
    `${current}: ${TREE.counts[current]} alleys branch off this one road, reaching depth ${root.height - 1}.`;
}

// ---------- mode: geo ----------
function drawGeo(svg){
  const a = GEO.arterials[current];
  if (!a || (!a.segments.length && !a.root.coords.length)){
    document.getElementById("tree-cap").textContent = `${current} has no mapped geometry.`; return; }
  const all = [a.root, ...a.segments].filter(s=>s.coords && s.coords.length);
  const xs = all.flatMap(s=>s.coords.map(c=>c[0])), ys = all.flatMap(s=>s.coords.map(c=>c[1]));
  const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  const V=720, pad=30, s=Math.min((V-2*pad)/(maxx-minx||1),(V-2*pad)/(maxy-miny||1));
  const ox=(V-s*(maxx-minx))/2, oy=(V-s*(maxy-miny))/2;
  const X=lon=>ox+(lon-minx)*s, Y=lat=>V-(oy+(lat-miny)*s);
  const line = coords => "M"+coords.map(c=>`${X(c[0])},${Y(c[1])}`).join("L");
  const g = svg.append("g");
  g.append("path").attr("d",line(a.root.coords)).attr("fill","none")
    .attr("stroke",depthColor(-1)).attr("stroke-width",4).attr("stroke-linecap","round");
  a.segments.slice().sort((p,q)=>p.depth-q.depth).forEach(seg=>{
    g.append("path").attr("d",line(seg.coords)).attr("fill","none")
      .attr("stroke",depthColor(seg.depth)).attr("stroke-width",Math.max(1,3-seg.depth*0.6))
      .attr("stroke-linecap","round").style("cursor","pointer")
      .on("mousemove",e=>showTip(seg,e)).on("mouseleave",hideTip);
  });
  document.getElementById("tree-cap").textContent =
    `${current}: its alleys drawn where they actually run` +
    (a.root.synthesized ? " (boulevard trunk inferred from its alleys)." : ".");
}
document.addEventListener("DOMContentLoaded", initTree);
