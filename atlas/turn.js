/* Bình Thạnh atlas — turning the page. The prev/next <a rel> links work on
   their own (no JS); this adds ←/→ keys and a horizontal swipe that follow them.
   Vertical swipes are never touched: listeners are passive and never call
   preventDefault, so the page always scrolls. */
(function () {
  "use strict";
  const MIN_DX = 60;   // px of horizontal travel
  const MAX_MS = 600;  // a swipe, not a drag

  function go(rel) {
    const a = document.querySelector(`a[rel="${rel}"]`);
    if (a && a.href) window.location.href = a.href;
  }

  // a pinch-zoomed phone pans sideways; that pan must never turn the page
  function zoomed() {
    return !!(window.visualViewport && window.visualViewport.scale > 1.01);
  }

  function typing(el) {
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (typing(e.target) || typing(document.activeElement)) return;
    if (e.key === "ArrowLeft") go("prev");
    else if (e.key === "ArrowRight") go("next");
  });

  let start = null;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || typing(e.target) || zoomed()) { start = null; return; }
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!start) return;
    if (zoomed()) { start = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y, dt = Date.now() - start.t;
    start = null;
    if (dt >= MAX_MS || Math.abs(dx) < MIN_DX || Math.abs(dx) <= Math.abs(dy)) return;
    go(dx < 0 ? "next" : "prev");  // swipe left turns forward, like a book
  }, { passive: true });

  document.addEventListener("touchcancel", () => { start = null; }, { passive: true });
})();
