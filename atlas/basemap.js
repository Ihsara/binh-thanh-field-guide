/* Bình Thạnh atlas — the shared, knocked-back basemap and map furniture.
   One projection and one crop for every page (spec §4). Every hero renderer
   calls drawBase, then locator, scaleBar and north (or Atlas.furniture).
   Colours and faces come from the CSS custom properties in atlas.css. */
(function () {
  "use strict";
  const A = (window.Atlas = window.Atlas || {});
  const NS = "http://www.w3.org/2000/svg";

  /** Read a CSS custom property from :root (e.g. A.css("--chapter-hue")). */
  A.css = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };

  /* d3-geo is spherical: a polygon ring must run CLOCKWISE or it means "the
     whole globe minus this box" and fitExtent shrinks the district to a dot.
     The plan's ring (w,s → e,s → e,n → w,n) is counter-clockwise, so the
     ring here walks w,s → w,n → e,n → e,s — same box, right winding. */
  function boundsFeature(b) {
    return { type: "Feature", properties: {}, geometry: { type: "Polygon",
      coordinates: [[[b[0], b[1]], [b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]]] } };
  }

  /** The one projection: Mercator fitted to the shared bounds with an 8 px margin. */
  A.projection = function (bounds, width, height) {
    return d3.geoMercator().fitExtent([[8, 8], [width - 8, height - 8]], boundsFeature(bounds));
  };

  /** Ward names as a visitor reads them on a street sign: drop the "Phường" prefix. */
  A.wardName = function (name) {
    return String(name).replace(/^Phường\s+/u, "");
  };

  /** Outline fill, streets (one path), ward hairlines, ward names in small caps. */
  A.drawBase = function (svg, base, proj) {
    const path = d3.geoPath(proj);
    const g = svg.append("g").attr("class", "base");
    g.append("path").attr("class", "base-outline")
      .attr("d", path(base.outline))
      .attr("fill", "var(--base-fill)").attr("stroke", "none");
    g.append("path").attr("class", "base-streets")
      .attr("d", path({ type: "MultiLineString", coordinates: base.streets }))
      .attr("fill", "none").attr("stroke", "var(--base-line)")
      .attr("stroke-width", 0.5).attr("stroke-linejoin", "round");
    // knocked back by TINT, not stacked opacities: wards are a second tone, same weight
    g.append("g").attr("class", "base-wards").selectAll("path")
      .data(base.wards).join("path")
      .attr("d", (w) => path(w.geometry))
      .attr("fill", "none").attr("stroke", "var(--base-ward)")
      .attr("stroke-width", 0.5).attr("stroke-dasharray", "2 1.5");
    g.append("path").attr("class", "base-edge")
      .attr("d", path(base.outline))
      .attr("fill", "none").attr("stroke", "var(--ink-soft)").attr("stroke-width", 0.9);
    // Labels sit on their own layer so a renderer can raise them above its marks.
    const labels = svg.append("g").attr("class", "base-labels");
    labels.selectAll("text").data(base.wards).join("text")
      .attr("class", "ward-label")
      .attr("transform", (w) => {
        const c = path.centroid(w.geometry);
        return `translate(${c[0].toFixed(1)},${c[1].toFixed(1)})`;
      })
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .text((w) => A.wardName(w.name));
    return { base: g, labels };
  };

  /** A tiny district outline — "you are here" — inside a size × size box at (x, y).
      Optional `mark` ([w, s, e, n]) outlines an enlarged area on the district. */
  A.locator = function (svg, base, x, y, size, mark) {
    const g = svg.append("g").attr("class", "locator").attr("transform", `translate(${x},${y})`);
    g.append("rect").attr("width", size).attr("height", size)
      .attr("fill", "var(--ground)").attr("stroke", "var(--ink-soft)").attr("stroke-width", 0.6);
    const p = d3.geoMercator().fitExtent([[5, 5], [size - 5, size - 5]], base.outline);
    g.append("path").attr("d", d3.geoPath(p)(base.outline))
      .attr("fill", "var(--chapter-hue-soft)").attr("stroke", "var(--ink)").attr("stroke-width", 0.6);
    if (mark) {
      const a = p([mark[0], mark[3]]), b = p([mark[2], mark[1]]);
      g.append("rect").attr("class", "locator-mark")
        .attr("x", a[0].toFixed(1)).attr("y", a[1].toFixed(1))
        .attr("width", Math.max(3, b[0] - a[0]).toFixed(1)).attr("height", Math.max(3, b[1] - a[1]).toFixed(1))
        .attr("fill", "none").attr("stroke", "var(--chapter-hue)").attr("stroke-width", 1.4);
    }
    g.append("text").attr("class", "furniture-label").attr("x", size / 2).attr("y", size + 11)
      .attr("text-anchor", "middle").text("The district");
    return g;
  };

  /** A scale bar (500 m unless `metres` says otherwise) measured on the projection at the map's latitude. */
  A.scaleBar = function (svg, proj, x, y, metres) {
    const m = metres || 500;
    const centre = proj.invert([x, y]);
    const lat = centre ? centre[1] : 10.81;
    const lon = centre ? centre[0] : 106.71;
    const dLon = m / (111320 * Math.cos((lat * Math.PI) / 180));
    const len = proj([lon + dLon, lat])[0] - proj([lon, lat])[0];
    const g = svg.append("g").attr("class", "scale-bar").attr("transform", `translate(${x},${y})`);
    g.append("path").attr("d", `M0,-4V0H${len.toFixed(1)}V-4`)
      .attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 1);
    g.append("text").attr("class", "furniture-label").attr("x", len + 5).attr("y", 0)
      .text(`${m} m`);
    return g;
  };

  /** A plain north arrow: a half-filled needle and an N. */
  A.north = function (svg, x, y) {
    const g = svg.append("g").attr("class", "north").attr("transform", `translate(${x},${y})`);
    g.append("path").attr("d", "M0,-11L4,4L0,1Z").attr("fill", "var(--ink)");
    g.append("path").attr("d", "M0,-11L-4,4L0,1Z")
      .attr("fill", "var(--ground)").attr("stroke", "var(--ink)").attr("stroke-width", 0.7);
    g.append("text").attr("class", "furniture-label").attr("y", 16)
      .attr("text-anchor", "middle").text("N");
    return g;
  };

  A.NS = NS;
})();
