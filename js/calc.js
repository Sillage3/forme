// Calculs repris du Calculateur Excel : métabolisme de base, maintenance, déficit, macros.
const Calc = {
  ACTIVITY: [
    [1.15, "Peu ou pas de sport"],
    [1.25, "1 à 3 h de sport par semaine"],
    [1.4, "4 à 6 h de sport par semaine"],
    [1.55, "Plus de 6 h de sport intense"],
    [1.7, "Plus de 6 h intense + travail physique"],
  ],

  DEFAULT_GOALS: {
    weight: 111.5, bodyFat: 30, activity: 1.4, deficit: 25,
    mode: "pct",                          // "pct" ou "gkg"
    pct: { p: 35, l: 25 },                // glucides = le reste
    gkg: { p: 2.0, l: 0.7 },              // par kg de masse sèche, glucides = le reste
  },

  // Formule de Katch-McArdle (basée sur la masse sèche).
  compute(goals) {
    const lbm = goals.weight * (1 - goals.bodyFat / 100);
    const bmr = Math.round(370 + 21.6 * lbm);
    const maintenance = Math.round(bmr * goals.activity);
    const raw = maintenance * (1 - goals.deficit / 100);
    const kcal = Math.max(bmr, Math.round(raw / 50) * 50);
    let p, l;
    if (goals.mode === "gkg") {
      p = goals.gkg.p * lbm;
      l = goals.gkg.l * lbm;
    } else {
      p = (kcal * goals.pct.p) / 100 / 4;
      l = (kcal * goals.pct.l) / 100 / 9;
    }
    const g = Math.max(0, (kcal - p * 4 - l * 9) / 4);
    return {
      lbm: round1(lbm), bmr, maintenance, kcal, floored: kcal === bmr && raw < bmr,
      p: Math.round(p), l: Math.round(l), g: Math.round(g),
    };
  },

  // Nutriments d'une quantité d'aliment. Les valeurs sont pour 100 g, ou pour 1 unité si unit === "u".
  portion(food, qty) {
    const f = food.unit === "u" ? qty : qty / 100;
    return { kcal: food.kcal * f, p: food.p * f, g: food.g * f, l: food.l * f };
  },

  sum(list) {
    return list.reduce((a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, g: a.g + b.g, l: a.l + b.l }),
      { kcal: 0, p: 0, g: 0, l: 0 });
  },

  // Analyse une ligne de séance façon journal : « Row each 3x15 12kg = = = »
  // « = » = série réussie comme prévu, un nombre = reps réellement faites, « X » = échec.
  parseExercise(line) {
    const m = line.trim().match(/^(.*?)\s+(\d+)\s*x\s*([\d\-]+s?)(?:\s+(each))?(?:\s+(\d+(?:[.,]\d+)?)\s*kg)?\s*(.*)$/i);
    if (!m) return { name: line.trim(), raw: line.trim() };
    const [, name, sets, reps, each, kg, rest] = m;
    const results = (rest.match(/=|X|\d+/gi) || []).slice(0, Number(sets));
    return {
      name: name.replace(/\s+each$/i, "").trim(), sets: Number(sets), reps, each: !!each || /each/i.test(name),
      kg: kg ? Number(kg.replace(",", ".")) : null, results, raw: line.trim(),
    };
  },

  // Volume total (séries × reps × kg) d'un exercice, pour suivre la progression.
  volume(ex) {
    if (!ex.sets || !ex.kg) return 0;
    const planned = parseInt(ex.reps, 10) || 0;
    const done = ex.results && ex.results.length
      ? ex.results.reduce((s, r) => s + (r === "=" ? planned : /x/i.test(r) ? 0 : Number(r)), 0)
      : ex.sets * planned;
    return done * ex.kg * (ex.each ? 2 : 1);
  },
};

function round1(n) { return Math.round(n * 10) / 10; }
