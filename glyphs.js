// web/glyphs.js — inline-SVG signature glyphs, shared by hub.js + hubs.js.
// Each entry is the inner markup of a 0..24 viewBox; glyphSVG wraps it.
window.HUB_GLYPHS = {
  "shrine": '<path d="M3 9 12 3l9 6M5 9v10h14V9M9 19v-5h6v5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "market": '<path d="M4 8h16l-1 11H5L4 8Zm3 0V6a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "bowl":   '<path d="M3 11h18a9 9 0 0 1-18 0Zm6-3c0-2 1-3 0-5m3 5c0-2 1-3 0-5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "bridge": '<path d="M2 16c5 0 5-6 10-6s5 6 10 6M2 16v3M22 16v3M7 13v6M17 13v6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "bikes":  '<circle cx="6" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 16l4-7h5l3 7M9 9h4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "cup":    '<path d="M5 8h12v5a6 6 0 0 1-12 0V8Zm12 1h2a2 2 0 0 1 0 4h-2M6 4v2M10 3v3M14 4v2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "tower":  '<path d="M10 21V6l2-3 2 3v15M8 21h8M11 9h2M11 13h2M11 17h2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "park":   '<path d="M12 14c-4 0-6-3-6-6a6 6 0 0 1 12 0c0 3-2 6-6 6Zm0 0v7" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  "canal":  '<path d="M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 14c3 0 3 2 6 2s3-2 6-2 3 2 6 2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
};

window.glyphSVG = function (sig, opts) {
  opts = opts || {};
  const inner = window.HUB_GLYPHS[sig] || window.HUB_GLYPHS.bikes;
  const cls = opts.cls ? ` class="${opts.cls}"` : "";
  const size = opts.size || 24;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"${cls} aria-hidden="true">${inner}</svg>`;
};
