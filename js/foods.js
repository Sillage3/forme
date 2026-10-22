// Base d'aliments : aliments perso, table Ciqual (ANSES) importée, produits Open Food Facts mis en cache.
const Foods = {
  cache: null,

  norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
  },

  async load() {
    if (!this.cache) this.cache = await DB.all("foods");
    return this.cache;
  },

  invalidate() { this.cache = null; },

  CIQUAL_VERSION: "2025-11-03",

  async seedIfEmpty() {
    if ((await DB.count("foods")) === 0) {
      await DB.bulkPut("foods", window.SEED_FOODS);
      this.invalidate();
    }
    // La table Ciqual est fournie avec l'appli : chargée une fois, puis à chaque nouvelle version.
    if ((await DB.setting("ciqualVersion")) !== this.CIQUAL_VERSION) {
      await loadScript("data/ciqual.js");
      await this.saveCiqual(window.CIQUAL.map(([code, name, group, kcal, p, g, l, fibres]) =>
        ({ ciqual: code, name, group, kcal, p, g, l, fibres, source: "ciqual", unit: "100g" })));
      await DB.saveSetting("ciqualVersion", window.CIQUAL_VERSION);
    }
  },

  // Remplace les aliments Ciqual existants (même code) pour ne pas créer de doublons.
  async saveCiqual(foods) {
    const byCode = new Map((await this.load()).filter((f) => f.source === "ciqual").map((f) => [f.ciqual, f.id]));
    foods.forEach((f) => { const id = byCode.get(f.ciqual); if (id != null) f.id = id; });
    await DB.bulkPut("foods", foods);
    this.invalidate();
  },

  // Recherche locale : tous les mots doivent apparaître. Aliments perso et récents d'abord.
  async search(query, limit = 40) {
    const words = this.norm(query).split(/\s+/).filter(Boolean);
    const foods = await this.load();
    const rank = { perso: 0, recette: 0, off: 1, ciqual: 2 };
    return foods
      .filter((f) => { const n = this.norm(f.name + " " + (f.brand || "")); return words.every((w) => n.includes(w)); })
      .sort((a, b) => (b.uses || 0) - (a.uses || 0) || rank[a.source] - rank[b.source] || a.name.length - b.name.length)
      .slice(0, limit);
  },

  async save(food) {
    const id = await DB.put("foods", food);
    this.invalidate();
    return id;
  },

  // --- Open Food Facts (produits emballés, nécessite Internet) ---
  OFF_FIELDS: "code,product_name,product_name_fr,brands,nutriments,serving_quantity",

  fromOff(p) {
    const n = p.nutriments || {};
    const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : null);
    if (kcal == null) return null;
    return {
      name: p.product_name_fr || p.product_name || "Produit " + p.code,
      brand: (p.brands || "").split(",")[0].trim(),
      barcode: p.code, source: "off", unit: "100g",
      kcal: round1(kcal), p: round1(n.proteins_100g || 0), g: round1(n.carbohydrates_100g || 0),
      l: round1(n.fat_100g || 0), fibres: round1(n.fiber_100g || 0),
      serving: Number(p.serving_quantity) || null,
    };
  },

  async searchOff(query) {
    const url = "https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=25&lc=fr&cc=fr"
      + "&fields=" + this.OFF_FIELDS + "&search_terms=" + encodeURIComponent(query);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Open Food Facts ne répond pas (" + res.status + ")");
    const data = await res.json();
    return (data.products || []).map((p) => this.fromOff(p)).filter(Boolean);
  },

  async byBarcode(code) {
    const local = (await this.load()).find((f) => f.barcode === code);
    if (local) return local;
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${this.OFF_FIELDS}`);
    const data = await res.json();
    if (data.status !== 1) return null;
    return this.fromOff(data.product);
  },

  // --- Import de la table Ciqual (fichier .xls/.xlsx téléchargé sur ciqual.anses.fr) ---
  async importCiqual(file, onProgress) {
    await loadScript("lib/xlsx.full.min.js");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (!rows.length) throw new Error("Fichier vide");
    const headers = Object.keys(rows[0]);
    const col = (...keys) => headers.find((h) => keys.every((k) => this.norm(h).includes(k)));
    const c = {
      name: col("alim nom fr"), group: col("alim ssgrp nom fr") || col("alim grp nom fr"), code: col("alim code"),
      kcal: col("energie", "kcal", "1169") || col("energie", "kcal"),
      p: col("proteines", "jones") || col("proteines"), g: col("glucides"), l: col("lipides"), fibres: col("fibres", "alimentaires"),
    };
    if (!c.name || !c.kcal) throw new Error("Colonnes Ciqual introuvables : est-ce bien la table Ciqual ?");
    const num = (v) => {
      const s = String(v).replace(",", ".").replace("<", "").trim();
      return s === "" || s === "-" || /traces/i.test(s) ? 0 : Number(s) || 0;
    };
    const foods = rows.filter((r) => r[c.name]).map((r) => ({
      name: String(r[c.name]).trim(), group: r[c.group] || "",
      ciqual: String(r[c.code]), source: "ciqual", unit: "100g",
      kcal: round1(num(r[c.kcal])), p: round1(num(r[c.p])), g: round1(num(r[c.g])), l: round1(num(r[c.l])),
      fibres: c.fibres ? round1(num(r[c.fibres])) : 0,
    }));
    onProgress && onProgress(foods.length);
    await this.saveCiqual(foods);
    return foods.length;
  },

  // Une recette devient un aliment « pour 100 g » calculé à partir des ingrédients.
  async recipeToFood(recipe) {
    const foods = await this.load();
    const parts = recipe.items.map((it) => {
      const f = foods.find((x) => x.id === it.foodId);
      return f ? Calc.portion(f, it.qty) : null;
    }).filter(Boolean);
    const t = Calc.sum(parts);
    const weight = recipe.cookedWeight || recipe.items.reduce((s, it) => s + Number(it.qty), 0) || 100;
    const k = 100 / weight;
    return {
      id: recipe.foodId, name: recipe.name, source: "recette", unit: "100g", recipeId: recipe.id,
      kcal: round1(t.kcal * k), p: round1(t.p * k), g: round1(t.g * k), l: round1(t.l * k),
    };
  },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Impossible de charger " + src));
    document.head.appendChild(s);
  });
}
