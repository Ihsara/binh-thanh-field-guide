// Stacked share bars: one row per depth, width = class share. Public uses accent.
const BUCKET_COLOR = {FOOD:"#e8a679", PRIVATE:"#cdbfa6", PUBLIC:"#c0552f"};

async function initInversion() {
  const data = await (await fetch("data/inversion.json")).json();
  const svg = document.getElementById("inv-svg");
  const W = 720, rowH = 54, pad = 8, x0 = 150, barW = W - x0 - 20;
  svg.setAttribute("viewBox", `0 0 ${W} ${data.rows.length*rowH + 20}`);
  data.rows.forEach((row, i) => {
    const y = i*rowH + pad;
    let x = x0;
    // label
    svg.insertAdjacentHTML("beforeend",
      `<text x="10" y="${y+22}" font-size="13" fill="#2b2622">${row.label} (n=${row.n})</text>`);
    if (row.n === 0) {
      svg.insertAdjacentHTML("beforeend",
        `<text x="${x0}" y="${y+21}" font-size="11" fill="#a99f8f">no mapped amenities</text>`);
      return;
    }
    data.buckets.forEach(b => {
      const w = row[b]*barW;
      svg.insertAdjacentHTML("beforeend",
        `<rect x="${x}" y="${y}" width="${w}" height="32" fill="${BUCKET_COLOR[b]}"></rect>`);
      if (row[b] > 0.08) svg.insertAdjacentHTML("beforeend",
        `<text x="${x+4}" y="${y+21}" font-size="11" fill="#2b2622">${Math.round(row[b]*100)}%</text>`);
      x += w;
    });
  });
  document.getElementById("inv-caveat").textContent = data.caveat;
}
document.addEventListener("DOMContentLoaded", initInversion);
