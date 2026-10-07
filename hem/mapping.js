// OSM-import poster: multi-line growth of mapped hẻm per year, 2019 jump annotated.
async function initMapping(){
  const d = await (await fetch("data/osm_growth.json")).json();
  const svg = document.getElementById("growth-svg");
  const W=720, H=380, x0=46, y0=H-40, maxY=Math.max(...d.hem);
  const X=i=>x0+(W-x0-20)*i/(d.years.length-1);
  const Y=v=>y0-(y0-30)*v/maxY;
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);

  // baseline
  svg.insertAdjacentHTML("beforeend",
    `<line x1="${x0}" y1="${y0}" x2="${W-20}" y2="${y0}" stroke="#e4ddcf"/>`);

  const line=(arr,c)=>svg.insertAdjacentHTML("beforeend",
    `<polyline fill="none" stroke="${c}" stroke-width="2" points="${
      arr.map((v,i)=>`${X(i)},${Y(v)}`).join(" ")}"/>`);
  line(d.hem,"#c0552f"); line(d.d1,"#7c2d16"); line(d.d2,"#3a160b");

  // 2019 jump annotation
  const j = d.years.indexOf(2019);
  if (j > 0){
    svg.insertAdjacentHTML("beforeend",
      `<line x1="${X(j)}" y1="20" x2="${X(j)}" y2="${y0}" stroke="#c0552f"
             stroke-dasharray="3 3" opacity="0.5"/>`);
    svg.insertAdjacentHTML("beforeend",
      `<text x="${X(j)+6}" y="34" font-size="12" fill="#c0552f" font-weight="600">
         2019 mapping campaign</text>`);
    svg.insertAdjacentHTML("beforeend",
      `<text x="${X(j)+6}" y="50" font-size="11" fill="#7a6f60">${
         d.hem[d.years.indexOf(2018)]} → ${d.hem[j]} named alleys</text>`);
  }

  // year ticks
  d.years.forEach((y,i)=> svg.insertAdjacentHTML("beforeend",
    `<text x="${X(i)}" y="${H-18}" font-size="10" text-anchor="middle" fill="#7a6f60">${y}</text>`));
  document.getElementById("growth-caveat").textContent = d.caveat;
}
document.addEventListener("DOMContentLoaded", initMapping);
