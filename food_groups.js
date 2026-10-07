// web/food_groups.js — MIRROR of src/food_taxonomy.py GROUPS (parity test pins it).
// Do NOT edit values here without changing the Python source; the guard will fail.
window.FOOD_GROUPS = {
  "pho":           {"label": "Phở",                    "color": "#7d2418", "region": "vietnamese", "is_style": false},
  "bun":           {"label": "Bún",                    "color": "#8f3322", "region": "vietnamese", "is_style": false},
  "com":           {"label": "Cơm",                    "color": "#a0432e", "region": "vietnamese", "is_style": false},
  "banh_mi":       {"label": "Bánh mì",                "color": "#b1543a", "region": "vietnamese", "is_style": false},
  "hu_tieu":       {"label": "Hủ tiếu",                "color": "#c06550", "region": "vietnamese", "is_style": false},
  "chao":          {"label": "Cháo",                   "color": "#cd7666", "region": "vietnamese", "is_style": false},
  "vn_other":      {"label": "Vietnamese (other)",      "color": "#d8897c", "region": "vietnamese", "is_style": false},
  "japanese":      {"label": "Japanese",               "color": "#23476e", "region": "east_asian", "is_style": false},
  "korean":        {"label": "Korean",                 "color": "#3a6ea5", "region": "east_asian", "is_style": false},
  "chinese":       {"label": "Chinese",                "color": "#6f96bd", "region": "east_asian", "is_style": false},
  "thai":          {"label": "Thai",                   "color": "#2f5e47", "region": "se_asian",   "is_style": false},
  "se_other":      {"label": "SE-Asian (other)",        "color": "#7aa890", "region": "se_asian",   "is_style": false},
  "pizza":         {"label": "Pizza",                  "color": "#8a6a16", "region": "western",    "is_style": false},
  "indian":        {"label": "Indian",                 "color": "#a07f1f", "region": "western",    "is_style": false},
  "italian":       {"label": "Italian",                "color": "#c99a2e", "region": "western",    "is_style": false},
  "western_other": {"label": "Western (other)",         "color": "#dab95e", "region": "western",    "is_style": false},
  "vegetarian":    {"label": "Vegetarian",             "color": "#6a5a8f", "region": "diet",       "is_style": false},
  "ca_phe":        {"label": "Cà phê / trà sữa",       "color": "#8a5a2b", "region": "style",      "is_style": true},
  "bakery":        {"label": "Bakery / sweets",         "color": "#a8702f", "region": "style",      "is_style": true},
  "fast_food":     {"label": "Fast food",              "color": "#c99a2e", "region": "style",      "is_style": true},
  "seafood":       {"label": "Seafood",                "color": "#3e7a5e", "region": "style",      "is_style": true},
  "bbq":           {"label": "BBQ / grill",            "color": "#b08a4a", "region": "style",      "is_style": true},
  "unclassified":  {"label": "Eateries (dish not named)", "color": "#9a9a9a", "region": "other",   "is_style": false}
};
window.FOOD_REGION_ORDER = ["vietnamese", "east_asian", "se_asian", "western", "diet", "style", "other"];
