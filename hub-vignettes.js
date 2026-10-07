/**
 * hub-vignettes.js — inline SVG vignettes for illustration hubs
 *
 * Exposes: window.HUB_VIGNETTE(slug, type) → "<svg …>…</svg>" string
 *          window.HUB_VIGNETTE.DEFAULT        → neutral fallback string
 *
 * Keying order:
 *   1. Bespoke by place slug (hang-xanh flyover, no-trang-long typographic) —
 *      slug is place-derived (hubs_build._TITLE_SLUG), stable across renumbering
 *   2. Fallback by type   (knot / food / bridge / heritage / riverside)
 *   3. DEFAULT neutral
 *
 * Palette (spine.css :root):
 *   paper  #f7f3ea   ink    #1d1a16   accent  #c0532a
 *   jade   #3e7a5e   muted  #8a8175   gold    #c99a2e
 *   rule   #e4ddcf
 */
(function () {
  "use strict";

  /* ── palette ────────────────────────────────────────────────────── */
  var P = "#f7f3ea";   /* paper   */
  var I = "#1d1a16";   /* ink     */
  var A = "#c0532a";   /* accent  */
  var J = "#3e7a5e";   /* jade    */
  var M = "#8a8175";   /* muted   */
  var G = "#c99a2e";   /* gold    */
  var R = "#e4ddcf";   /* rule    */

  /* ── SVG shell helpers ───────────────────────────────────────────── */
  function svg(body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"'
         + ' width="100%" aria-hidden="true">'
         + '<rect width="400" height="220" fill="' + P + '"/>'
         + body
         + '</svg>';
  }

  /* ── type fallbacks ─────────────────────────────────────────────── */

  /**
   * knot — converging roads / roundabout glyph
   * Five thin lines fanning into a central ring, suggesting a busy node.
   */
  var KNOT = svg(
    /* central ring */
    '<circle cx="200" cy="110" r="28" fill="none" stroke="' + A + '" stroke-width="3"/>'
    /* spokes (5 roads converging) */
  + '<line x1="200" y1="82"  x2="200" y2="18"  stroke="' + I + '" stroke-width="2.5"/>'
  + '<line x1="172" y1="93"  x2="60"  y2="48"  stroke="' + I + '" stroke-width="2.5"/>'
  + '<line x1="172" y1="128" x2="42"  y2="175" stroke="' + I + '" stroke-width="2.5"/>'
  + '<line x1="228" y1="128" x2="358" y2="175" stroke="' + I + '" stroke-width="2.5"/>'
  + '<line x1="228" y1="93"  x2="340" y2="48"  stroke="' + I + '" stroke-width="2.5"/>'
    /* tick marks for lane dividers */
  + '<circle cx="200" cy="110" r="8" fill="' + A + '" opacity=".35"/>'
    /* decorative label text */
  + '<text x="200" y="198" text-anchor="middle" font-family="serif" font-size="11"'
  + ' fill="' + M + '" letter-spacing=".15em">NÚT GIAO</text>'
  );

  /**
   * food — steaming bowl line vignette
   * A simple bowl silhouette with three curling steam wisps above it.
   */
  var FOOD = svg(
    /* bowl */
    '<path d="M130,145 Q200,185 270,145" fill="none" stroke="' + I + '" stroke-width="2.5" stroke-linecap="round"/>'
  + '<line x1="130" y1="145" x2="130" y2="158" stroke="' + I + '" stroke-width="2.5" stroke-linecap="round"/>'
  + '<line x1="270" y1="145" x2="270" y2="158" stroke="' + I + '" stroke-width="2.5" stroke-linecap="round"/>'
  + '<path d="M130,158 Q200,190 270,158" fill="' + R + '" stroke="' + I + '" stroke-width="2"/>'
    /* rim line */
  + '<path d="M125,145 Q200,155 275,145" fill="none" stroke="' + M + '" stroke-width="1.5"/>'
    /* steam wisps */
  + '<path d="M168,138 C166,120 172,114 170,96" fill="none" stroke="' + A + '"'
  + ' stroke-width="2" stroke-linecap="round"/>'
  + '<path d="M200,132 C198,112 204,106 202,86" fill="none" stroke="' + A + '"'
  + ' stroke-width="2" stroke-linecap="round"/>'
  + '<path d="M232,138 C230,120 236,114 234,96" fill="none" stroke="' + A + '"'
  + ' stroke-width="2" stroke-linecap="round"/>'
    /* label */
  + '<text x="200" y="40" text-anchor="middle" font-family="serif" font-size="11"'
  + ' fill="' + M + '" letter-spacing=".15em">ẨM THỰC</text>'
  );

  /**
   * bridge — span silhouette over a wavy canal
   * A clean arch bridge with two thin towers and a wavy water line below.
   */
  var BRIDGE = svg(
    /* water */
    '<path d="M20,160 Q80,148 140,160 Q200,172 260,160 Q320,148 380,160 L380,180 L20,180 Z"'
  + ' fill="' + J + '" opacity=".25"/>'
  + '<path d="M20,165 Q80,153 140,165 Q200,177 260,165 Q320,153 380,165"'
  + ' fill="none" stroke="' + J + '" stroke-width="1.5" opacity=".7"/>'
    /* roadway deck */
  + '<rect x="40" y="118" width="320" height="10" fill="' + M + '" rx="1"/>'
    /* arch */
  + '<path d="M80,128 Q200,58 320,128" fill="none" stroke="' + I + '" stroke-width="3"/>'
    /* towers */
  + '<rect x="95"  y="82" width="10" height="46" fill="' + I + '"/>'
  + '<rect x="295" y="82" width="10" height="46" fill="' + I + '"/>'
    /* suspension cables */
  + '<line x1="100" y1="82" x2="200" y2="118" stroke="' + M + '" stroke-width="1" opacity=".6"/>'
  + '<line x1="300" y1="82" x2="200" y2="118" stroke="' + M + '" stroke-width="1" opacity=".6"/>'
  + '<line x1="100" y1="82" x2="145" y2="118" stroke="' + M + '" stroke-width="1" opacity=".6"/>'
  + '<line x1="300" y1="82" x2="255" y2="118" stroke="' + M + '" stroke-width="1" opacity=".6"/>'
    /* label */
  + '<text x="200" y="200" text-anchor="middle" font-family="serif" font-size="11"'
  + ' fill="' + M + '" letter-spacing=".15em">CẦU KÊNH</text>'
  );

  /**
   * heritage — shrine gateway / temple roof silhouette
   * A tiered roof glyph with upswept eaves, suggesting a đình or pagoda gate.
   */
  var HERITAGE = svg(
    /* upper roof tier */
    '<path d="M130,80 L200,40 L270,80 L260,80 L200,48 L140,80 Z"'
  + ' fill="' + G + '" opacity=".85"/>'
  + '<line x1="200" y1="40" x2="200" y2="35" stroke="' + G + '" stroke-width="2.5" stroke-linecap="round"/>'
    /* eave curl left + right */
  + '<path d="M130,80 Q118,80 114,72" fill="none" stroke="' + G + '" stroke-width="2" stroke-linecap="round"/>'
  + '<path d="M270,80 Q282,80 286,72" fill="none" stroke="' + G + '" stroke-width="2" stroke-linecap="round"/>'
    /* lower roof tier */
  + '<path d="M105,115 L200,78 L295,115 L283,115 L200,88 L117,115 Z"'
  + ' fill="' + I + '" opacity=".8"/>'
  + '<path d="M105,115 Q92,115 88,106" fill="none" stroke="' + I + '" stroke-width="2" stroke-linecap="round"/>'
  + '<path d="M295,115 Q308,115 312,106" fill="none" stroke="' + I + '" stroke-width="2" stroke-linecap="round"/>'
    /* columns */
  + '<rect x="148" y="115" width="8" height="60" fill="' + M + '"/>'
  + '<rect x="244" y="115" width="8" height="60" fill="' + M + '"/>'
    /* base lintel */
  + '<rect x="100" y="172" width="200" height="6" fill="' + M + '" rx="1"/>'
    /* doorway opening */
  + '<path d="M176,172 Q200,148 224,172" fill="' + P + '" stroke="' + I + '" stroke-width="1.5"/>'
    /* label */
  + '<text x="200" y="208" text-anchor="middle" font-family="serif" font-size="11"'
  + ' fill="' + M + '" letter-spacing=".15em">DI TÍCH</text>'
  );

  /**
   * riverside — lake / canal with a willow frond and water rings
   */
  var RIVERSIDE = svg(
    /* water body */
    '<ellipse cx="200" cy="155" rx="160" ry="35" fill="' + J + '" opacity=".18"/>'
  + '<ellipse cx="200" cy="155" rx="160" ry="35" fill="none" stroke="' + J + '" stroke-width="1.5" opacity=".5"/>'
    /* ripple rings */
  + '<ellipse cx="200" cy="155" rx="40"  ry="8"  fill="none" stroke="' + J + '" stroke-width="1" opacity=".4"/>'
  + '<ellipse cx="200" cy="155" rx="80"  ry="16" fill="none" stroke="' + J + '" stroke-width="1" opacity=".3"/>'
  + '<ellipse cx="200" cy="155" rx="120" ry="24" fill="none" stroke="' + J + '" stroke-width="1" opacity=".2"/>'
    /* willow trunk */
  + '<line x1="120" y1="50" x2="120" y2="148" stroke="' + I + '" stroke-width="2.5" stroke-linecap="round"/>'
    /* willow fronds */
  + '<path d="M120,70 C140,95 135,120 130,135" fill="none" stroke="' + J + '" stroke-width="1.5" opacity=".8"/>'
  + '<path d="M120,65 C155,85 155,115 148,132" fill="none" stroke="' + J + '" stroke-width="1.5" opacity=".7"/>'
  + '<path d="M120,60 C100,88 98,115 105,133"  fill="none" stroke="' + J + '" stroke-width="1.5" opacity=".7"/>'
    /* distant skyline silhouette */
  + '<rect x="250" y="118" width="14" height="32" fill="' + M + '" opacity=".35"/>'
  + '<rect x="268" y="110" width="10" height="40" fill="' + M + '" opacity=".35"/>'
  + '<rect x="282" y="124" width="18" height="26" fill="' + M + '" opacity=".35"/>'
    /* label */
  + '<text x="200" y="208" text-anchor="middle" font-family="serif" font-size="11"'
  + ' fill="' + M + '" letter-spacing=".15em">BỜ KÊNH</text>'
  );

  /* ── bespoke by place slug ──────────────────────────────────────── */

  /**
   * hang-xanh (Hàng Xanh) — five-road flyover convergence
   * A bolder version of the knot glyph: thicker roads, overpass arc, accent ring.
   */
  var HANG_XANH = svg(
    /* overpass arc */
    '<path d="M60,140 Q200,60 340,140" fill="none" stroke="' + M + '" stroke-width="4" opacity=".5"/>'
    /* five thick roads */
  + '<line x1="200" y1="82"  x2="200" y2="12"  stroke="' + I + '" stroke-width="4"/>'
  + '<line x1="170" y1="96"  x2="44"  y2="44"  stroke="' + I + '" stroke-width="4"/>'
  + '<line x1="168" y1="130" x2="30"  y2="190" stroke="' + I + '" stroke-width="4"/>'
  + '<line x1="232" y1="130" x2="370" y2="190" stroke="' + I + '" stroke-width="4"/>'
  + '<line x1="230" y1="96"  x2="356" y2="44"  stroke="' + I + '" stroke-width="4"/>'
    /* central ring */
  + '<circle cx="200" cy="110" r="36" fill="' + P + '" stroke="' + A + '" stroke-width="3"/>'
  + '<circle cx="200" cy="110" r="14" fill="' + A + '" opacity=".2"/>'
    /* directional dot */
  + '<circle cx="200" cy="110" r="5" fill="' + A + '"/>'
    /* label */
  + '<text x="200" y="200" text-anchor="middle" font-family="serif" font-style="italic" font-size="13"'
  + ' fill="' + I + '">Hàng Xanh</text>'
  );

  /**
   * no-trang-long (Nơ Trang Long) — street name as styled typographic vignette
   * The street name set large in the display serif, with a thin accent underline.
   */
  var NO_TRANG_LONG = svg(
    /* decorative thin rule at top */
    '<line x1="80" y1="62" x2="320" y2="62" stroke="' + R + '" stroke-width="1"/>'
    /* street name — two lines for breath */
  + '<text x="200" y="110" text-anchor="middle"'
  + ' font-family="Alegreya,Georgia,serif" font-weight="600" font-size="36"'
  + ' fill="' + I + '">Nơ Trang</text>'
  + '<text x="200" y="152" text-anchor="middle"'
  + ' font-family="Alegreya,Georgia,serif" font-weight="600" font-size="36"'
  + ' fill="' + I + '">Long</text>'
    /* accent underline */
  + '<line x1="110" y1="162" x2="290" y2="162" stroke="' + A + '" stroke-width="2.5"/>'
    /* kicker label */
  + '<text x="200" y="192" text-anchor="middle"'
  + ' font-family="Be Vietnam Pro,system-ui,sans-serif" font-size="10"'
  + ' fill="' + M + '" letter-spacing=".2em">ĐƯỜNG / STREET</text>'
  );

  /* ── DEFAULT neutral ────────────────────────────────────────────── */
  var DEFAULT = svg(
    /* simple grid of dots suggesting a map index */
    (function () {
      var dots = "";
      var xs = [120, 160, 200, 240, 280];
      var ys = [82, 110, 138];
      for (var yi = 0; yi < ys.length; yi++) {
        for (var xi = 0; xi < xs.length; xi++) {
          var op = (xi === 2 && yi === 1) ? "1" : ".3";
          var r  = (xi === 2 && yi === 1) ? "6"  : "3";
          var c  = (xi === 2 && yi === 1) ? A     : M;
          dots += '<circle cx="' + xs[xi] + '" cy="' + ys[yi]
               + '" r="' + r + '" fill="' + c + '" opacity="' + op + '"/>';
        }
      }
      return dots;
    }())
  + '<line x1="90" y1="170" x2="310" y2="170" stroke="' + R + '" stroke-width="1"/>'
  + '<text x="200" y="194" text-anchor="middle" font-family="serif" font-size="11"'
  + ' fill="' + M + '" letter-spacing=".15em">BÌNH THẠNH</text>'
  );

  /* ── type → vignette map ────────────────────────────────────────── */
  var TYPE_MAP = {
    knot:      KNOT,
    food:      FOOD,
    bridge:    BRIDGE,
    heritage:  HERITAGE,
    riverside: RIVERSIDE
  };

  /* ── bespoke slug map ───────────────────────────────────────────── */
  var ID_MAP = {
    "hang-xanh":    HANG_XANH,
    "no-trang-long": NO_TRANG_LONG
  };

  /* ── public API ─────────────────────────────────────────────────── */
  function HUB_VIGNETTE(slug, type) {
    if (slug && ID_MAP[slug])   return ID_MAP[slug];
    if (type && TYPE_MAP[type]) return TYPE_MAP[type];
    return DEFAULT;
  }

  HUB_VIGNETTE.DEFAULT = DEFAULT;

  window.HUB_VIGNETTE = HUB_VIGNETTE;
}());
