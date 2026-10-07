const STORY_BASE = "https://ihsara.github.io/binh-thanh-story/";
// Shared sticky masthead for the hẻm sub-site (6 pages): title + tab links + depth strip.
const HEM_PAGES = [
  ["index.html", "Home"], ["map.html", "Map"], ["tree.html", "Your address"],
  ["inversion.html", "Boulevard vs hẻm"], ["mapping.html", "How OSM learned"],
  ["method.html", "Method"],
];

function renderHemNav(active) {
  const el = document.getElementById("hem-nav");
  if (!el) return;
  const links = HEM_PAGES.map(([href, label]) =>
    `<a href="${href}"${href === active ? ` class="is-active" aria-current="page"` : ""}>${label}</a>`
  ).join("");
  el.innerHTML =
    `<div class="hem-mag">
       <a class="hem-mag-brand" href="../hubs.html">Bình Thạnh field guide</a>
       <nav>
         <a href="../hubs.html">Hubs</a>
         <a href="../cuisine.html">Food</a>
         <a href="../rhythm.html">Rhythm</a>
         <a href="../history.html">History</a>
         <a class="is-active" href="index.html">Alleys</a>
         <a href="${STORY_BASE}">← The story</a>
       </nav>
     </div>` +
    `<div class="hem-bar">
       <a class="hem-brand" href="index.html">Bình Thạnh <span>· hẻm</span></a>
       <nav class="hem-tabs">${links}</nav>
     </div>
     <div class="hem-strip" aria-hidden="true"></div>`;
}
