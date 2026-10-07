// Field-guide top nav. SECTIONS is the single source of truth. Pages declare
// document.body.dataset.page: "hubs", "cuisine", "rhythm", "history" ("hem"
// pages use hem/nav-hem.js). The story lives on its own site: STORY_BASE.
(function () {
  const STORY_BASE = "https://ihsara.github.io/binh-thanh-story/";
  const SECTIONS = [
    { page: "hubs", label: "Hubs", href: "hubs.html" },
    { page: "cuisine", label: "Food", href: "cuisine.html" },
    { page: "rhythm", label: "Rhythm", href: "rhythm.html" },
    { page: "history", label: "History", href: "history.html" },
    { page: "hem", label: "Alleys", href: "hem/" },
  ];
  const page = document.body.dataset.page;
  const nav = document.getElementById("site-nav");
  if (!nav) return;
  nav.className = "site-nav";
  nav.innerHTML =
    `<a href="hubs.html" class="brand">Bình Thạnh field guide</a>` +
    SECTIONS.map((s) =>
      `<a href="${s.href}" class="${s.page === page ? "active" : ""}">${s.label}</a>`
    ).join("") +
    `<a href="${STORY_BASE}" class="back-to-story">← The story</a>`;
})();
