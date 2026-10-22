// Interface : Repas, Sport, Suivi, Objectifs, Aliments.
const MEALS = [["petitdej", "Petit-déjeuner"], ["dejeuner", "Déjeuner"], ["gouter", "Goûter"], ["diner", "Dîner"]];
const WORKOUT_TYPES = ["Push", "Pull", "Legs", "Abdos", "Cardio", "Étirements", "Autre"];
const MEASURES = [["taille", "Taille (1 cm sous nombril)"], ["hanches", "Taille basse (5 cm sous nombril)"],
  ["epaules", "Épaules"], ["poitrine", "Poitrine"], ["bicepsD", "Biceps droit"], ["bicepsG", "Biceps gauche"],
  ["cuisseD", "Cuisse droite"], ["cuisseG", "Cuisse gauche"], ["molletD", "Mollet droit"], ["molletG", "Mollet gauche"]];

const state = { view: "repas", date: today() };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function today() { return iso(new Date()); }
function iso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function addDays(s, n) { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return iso(d); }
function frDate(s, opts = { weekday: "long", day: "numeric", month: "long" }) {
  return new Date(s + "T12:00").toLocaleDateString("fr-FR", opts);
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function n0(x) { return Math.round(x || 0); }
function fmt(x) { return (Math.round((x || 0) * 10) / 10).toLocaleString("fr-FR"); }
function mondayOf(s) { const d = new Date(s + "T12:00"); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); }

async function getGoals() { return { ...Calc.DEFAULT_GOALS, ...(await DB.setting("goals", {})) }; }

// ---------- Navigation ----------
function setView(v) {
  state.view = v;
  $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $("#view-title").textContent = { repas: "Repas", sport: "Sport", suivi: "Suivi", objectifs: "Objectifs", aliments: "Aliments" }[v];
  $("#date-nav").hidden = !["repas", "sport"].includes(v);
  render();
}

async function render() {
  $("#current-date").value = state.date;
  const view = $("#view");
  view.innerHTML = "";
  await ({ repas: renderRepas, sport: renderSport, suivi: renderSuivi, objectifs: renderObjectifs, aliments: renderAliments })[state.view](view);
}

function openModal(html, onReady) {
  $("#modal-body").innerHTML = html;
  $("#modal").showModal();
  onReady && onReady($("#modal-body"));
}
function closeModal() { $("#modal").close(); }

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function bar(label, value, target, unit = "g") {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target && value > target * 1.05;
  return `<div class="bar ${over ? "over" : ""}">
    <div class="bar-label"><span>${label}</span><span>${n0(value)} / ${n0(target)} ${unit}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

// ---------- Repas ----------
async function renderRepas(view) {
  const [entries, goals] = [await DB.byIndex("entries", "date", state.date), await getGoals()];
  const target = Calc.compute(goals);
  const all = entries.map((e) => Calc.portion(e.per, e.qty));
  const tot = Calc.sum(all);

  view.innerHTML = `
    <p class="day-label">${esc(frDate(state.date))}</p>
    <section class="card summary">
      <div class="kcal-big"><strong>${n0(tot.kcal)}</strong><span>/ ${target.kcal} kcal</span>
        <em>${target.kcal - n0(tot.kcal) >= 0 ? "reste " + (target.kcal - n0(tot.kcal)) : "dépassé de " + (n0(tot.kcal) - target.kcal)}</em></div>
      ${bar("Protéines", tot.p, target.p)}${bar("Glucides", tot.g, target.g)}${bar("Lipides", tot.l, target.l)}
    </section>
    ${MEALS.map(([key, label]) => {
      const list = entries.filter((e) => e.meal === key);
      const t = Calc.sum(list.map((e) => Calc.portion(e.per, e.qty)));
      return `<section class="card meal">
        <header><h2>${label}</h2><span class="muted">${n0(t.kcal)} kcal · P ${n0(t.p)} · G ${n0(t.g)} · L ${n0(t.l)}</span></header>
        <ul class="entries">${list.map((e) => {
          const p = Calc.portion(e.per, e.qty);
          return `<li data-id="${e.id}"><span class="name">${esc(e.name)}</span>
            <span class="qty">${fmt(e.qty)} ${e.per.unit === "u" ? "u" : "g"}</span><span class="kcal">${n0(p.kcal)} kcal</span></li>`;
        }).join("")}</ul>
        <button class="add" data-meal="${key}">+ Ajouter un aliment</button>
      </section>`;
    }).join("")}
    <div class="row-actions"><button id="copy-yesterday" class="secondary">Copier les repas de la veille</button></div>`;

  $$(".add", view).forEach((b) => b.onclick = () => pickFood(b.dataset.meal));
  $$(".entries li", view).forEach((li) => li.onclick = () => editEntry(Number(li.dataset.id)));
  $("#copy-yesterday", view).onclick = async () => {
    const prev = await DB.byIndex("entries", "date", addDays(state.date, -1));
    if (!prev.length) return toast("Rien la veille");
    await DB.bulkPut("entries", prev.map(({ id, ...e }) => ({ ...e, date: state.date })));
    toast(prev.length + " aliments copiés"); render();
  };
}

function foodRow(f) {
  const tag = { perso: "perso", ciqual: "Ciqual", off: "OFF", recette: "recette" }[f.source] || f.source;
  return `<span class="name">${esc(f.name)}${f.brand ? ` <em>${esc(f.brand)}</em>` : ""}</span>
    <span class="muted small">${n0(f.kcal)} kcal · P ${fmt(f.p)} · G ${fmt(f.g)} · L ${fmt(f.l)} ${f.unit === "u" ? "/ unité" : "/ 100 g"} <b class="tag">${tag}</b></span>`;
}

function pickFood(meal) {
  openModal(`
    <h2>Ajouter · ${MEALS.find((m) => m[0] === meal)[1]}</h2>
    <input type="search" id="q" placeholder="Rechercher un aliment…" autocomplete="off">
    <div class="row-actions">
      <button id="off" class="secondary">Chercher sur Open Food Facts</button>
      <button id="scan" class="secondary">Scanner un code-barres</button>
      <button id="new" class="secondary">Créer un aliment</button>
    </div>
    <ul id="results" class="results"></ul>
    <div class="modal-actions"><button class="secondary" id="close">Fermer</button></div>`, (m) => {
    const q = $("#q", m), results = $("#results", m);
    let shown = [];
    const show = (foods, note) => {
      shown = foods;
      results.innerHTML = (note ? `<li class="muted">${note}</li>` : "")
        + foods.map((f, i) => `<li data-i="${i}">${foodRow(f)}</li>`).join("");
      $$("li[data-i]", results).forEach((li) => li.onclick = () => chooseQty(meal, shown[li.dataset.i]));
    };
    const local = async () => show(await Foods.search(q.value), q.value ? "" : "Aliments les plus utilisés");
    q.oninput = local; local(); q.focus();
    $("#off", m).onclick = async () => {
      if (!q.value.trim()) return toast("Tape d'abord un nom de produit");
      results.innerHTML = `<li class="muted">Recherche sur Open Food Facts…</li>`;
      try { show(await Foods.searchOff(q.value), "Résultats Open Food Facts"); }
      catch (e) { results.innerHTML = `<li class="muted">${esc(e.message)}. Vérifie la connexion.</li>`; }
    };
    $("#scan", m).onclick = () => scanBarcode((food) => food ? chooseQty(meal, food) : toast("Produit inconnu d'Open Food Facts"));
    $("#new", m).onclick = () => editFood({ name: q.value, source: "perso", unit: "100g", kcal: 0, p: 0, g: 0, l: 0 }, (f) => chooseQty(meal, f));
    $("#close", m).onclick = closeModal;
  });
}

async function chooseQty(meal, food, entry) {
  const unit = food.unit === "u" ? "unité(s)" : "g";
  const def = entry ? entry.qty : food.unit === "u" ? 1 : food.serving || 100;
  openModal(`
    <h2>${esc(food.name)}</h2>
    <p class="muted small">${foodRow(food)}</p>
    <label>Quantité (${unit})<input type="number" id="qty" inputmode="decimal" step="any" value="${def}"></label>
    <p id="preview" class="preview"></p>
    <div class="modal-actions">
      ${entry ? `<button class="danger" id="del">Supprimer</button>` : ""}
      <button class="secondary" id="cancel">Annuler</button><button id="ok">${entry ? "Enregistrer" : "Ajouter"}</button>
    </div>`, (m) => {
    const qty = $("#qty", m);
    const upd = () => { const p = Calc.portion(food, Number(qty.value) || 0);
      $("#preview", m).textContent = `${n0(p.kcal)} kcal · P ${fmt(p.p)} g · G ${fmt(p.g)} g · L ${fmt(p.l)} g`; };
    qty.oninput = upd; upd(); qty.select();
    $("#cancel", m).onclick = closeModal;
    if (entry) $("#del", m).onclick = async () => { await DB.del("entries", entry.id); closeModal(); render(); };
    $("#ok", m).onclick = async () => {
      if (!food.id) {                                               // produit OFF : gardé en local
        const known = food.barcode && (await Foods.load()).find((f) => f.barcode === food.barcode);
        food.id = known ? known.id : await Foods.save({ ...food, uses: 1 });
      }
      else if (!entry) { food.uses = (food.uses || 0) + 1; await Foods.save(food); }
      const per = { kcal: food.kcal, p: food.p, g: food.g, l: food.l, unit: food.unit };
      await DB.put("entries", { ...(entry || {}), date: state.date, meal, foodId: food.id, name: food.name, per, qty: Number(qty.value) || 0 });
      closeModal(); render();
    };
  });
}

async function editEntry(id) {
  const e = await DB.get("entries", id);
  chooseQty(e.meal, { id: e.foodId, name: e.name, ...e.per }, e);
}

// Scan via la caméra (BarcodeDetector, dispo sur Chrome Android) ou saisie du code à la main.
async function scanBarcode(done) {
  const lookup = async (code) => { toast("Recherche du produit " + code + "…"); try { done(await Foods.byBarcode(code)); } catch { toast("Pas de connexion"); } };
  if (!("BarcodeDetector" in window)) {
    const code = prompt("Ce navigateur ne sait pas scanner. Entre le code-barres :");
    return code && lookup(code.trim());
  }
  openModal(`<h2>Scanner</h2><video id="cam" playsinline muted></video>
    <div class="modal-actions"><button class="secondary" id="stop">Annuler</button></div>`, async (m) => {
    const video = $("#cam", m);
    let stream, stopped = false;
    const stop = () => { stopped = true; stream && stream.getTracks().forEach((t) => t.stop()); };
    $("#stop", m).onclick = () => { stop(); closeModal(); };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
    catch { closeModal(); return toast("Caméra inaccessible"); }
    video.srcObject = stream; await video.play();
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const loop = async () => {
      if (stopped) return;
      const codes = await detector.detect(video).catch(() => []);
      if (codes.length) { stop(); closeModal(); return lookup(codes[0].rawValue); }
      requestAnimationFrame(loop);
    };
    loop();
  });
}

function editFood(food, after) {
  openModal(`
    <h2>${food.id ? "Modifier" : "Nouvel"} aliment</h2>
    <label>Nom<input id="f-name" value="${esc(food.name)}"></label>
    <label>Valeurs pour<select id="f-unit"><option value="100g">100 g / 100 ml</option><option value="u" ${food.unit === "u" ? "selected" : ""}>1 unité</option></select></label>
    <div class="grid4">
      <label>Kcal<input type="number" step="any" id="f-kcal" value="${food.kcal}"></label>
      <label>Protéines<input type="number" step="any" id="f-p" value="${food.p}"></label>
      <label>Glucides<input type="number" step="any" id="f-g" value="${food.g}"></label>
      <label>Lipides<input type="number" step="any" id="f-l" value="${food.l}"></label>
    </div>
    <button class="link" id="f-auto">Calculer les kcal depuis les macros</button>
    <div class="modal-actions">
      ${food.id ? `<button class="danger" id="f-del">Supprimer</button>` : ""}
      <button class="secondary" id="f-cancel">Annuler</button><button id="f-save">Enregistrer</button>
    </div>`, (m) => {
    const v = (id) => Number($(id, m).value) || 0;
    $("#f-auto", m).onclick = () => { $("#f-kcal", m).value = n0(v("#f-p") * 4 + v("#f-g") * 4 + v("#f-l") * 9); };
    $("#f-cancel", m).onclick = closeModal;
    if (food.id) $("#f-del", m).onclick = async () => { await DB.del("foods", food.id); Foods.invalidate(); closeModal(); render(); };
    $("#f-save", m).onclick = async () => {
      const f = { ...food, source: food.source === "ciqual" || food.source === "off" ? "perso" : food.source || "perso",
        name: $("#f-name", m).value.trim() || "Sans nom", unit: $("#f-unit", m).value,
        kcal: v("#f-kcal"), p: v("#f-p"), g: v("#f-g"), l: v("#f-l") };
      if (food.source === "ciqual" || food.source === "off") delete f.id;   // une copie perso, l'original reste
      f.id = await Foods.save(f);
      closeModal(); after ? after(f) : render();
    };
  });
}

// ---------- Sport ----------
async function renderSport(view) {
  const all = (await DB.all("workouts")).sort((a, b) => b.date.localeCompare(a.date));
  const todays = all.filter((w) => w.date === state.date);
  const history = all.filter((w) => w.date !== state.date).slice(0, 15);

  view.innerHTML = `
    <p class="day-label">${esc(frDate(state.date))}</p>
    ${todays.map(workoutCard).join("") || `<section class="card muted">Pas de séance ce jour-là.</section>`}
    <div class="row-actions"><button id="new-w">+ Nouvelle séance</button><button id="prog" class="secondary">Progression d'un exercice</button></div>
    <h2 class="section">Dernières séances</h2>
    ${history.map(workoutCard).join("") || `<p class="muted">Importe tes journaux depuis l'onglet Aliments › Importer.</p>`}`;

  $("#new-w", view).onclick = () => editWorkout({ date: state.date, type: "Push", text: "", comment: "" }, all);
  $("#prog", view).onclick = () => showProgress(all);
  $$(".workout", view).forEach((c) => c.onclick = () => editWorkout(all.find((w) => w.id === Number(c.dataset.id)), all));
}

function workoutCard(w) {
  const lines = (w.text || "").split("\n").filter((l) => l.trim());
  return `<section class="card workout" data-id="${w.id}">
    <header><h2>${esc(w.type || "Séance")}</h2><span class="muted">${esc(frDate(w.date, { weekday: "short", day: "numeric", month: "short", year: "2-digit" }))}</span></header>
    <table class="ex">${lines.map((l) => {
      const e = Calc.parseExercise(l);
      if (!e.sets) return `<tr><td colspan="3">${esc(l)}</td></tr>`;
      const res = e.results.length ? e.results.map((r) => `<i class="${r === "=" ? "ok" : /x/i.test(r) ? "ko" : "part"}">${r === "=" ? "✓" : esc(r)}</i>`).join("") : "";
      return `<tr><td>${esc(e.name)}</td><td>${e.sets}×${esc(e.reps)}${e.each ? " /côté" : ""}${e.kg ? " · " + fmt(e.kg) + " kg" : ""}</td><td class="res">${res}</td></tr>`;
    }).join("")}</table>
    ${w.comment ? `<p class="comment">${esc(w.comment)}</p>` : ""}
  </section>`;
}

function editWorkout(w, all) {
  openModal(`
    <h2>${w.id ? "Modifier la séance" : "Nouvelle séance"}</h2>
    <div class="grid2">
      <label>Date<input type="date" id="w-date" value="${w.date}"></label>
      <label>Type<input id="w-type" list="types" value="${esc(w.type)}"></label>
    </div>
    <datalist id="types">${WORKOUT_TYPES.map((t) => `<option value="${t}">`).join("")}</datalist>
    <button class="link" id="w-last">Reprendre la dernière séance de ce type</button>
    <label>Déroulé <span class="muted small">(un exercice par ligne : « Row each 3x15 12kg = = = », = réussi, un chiffre = reps faites, X = échec)</span>
      <textarea id="w-text" rows="8">${esc(w.text)}</textarea></label>
    <label>Commentaire<textarea id="w-comment" rows="3">${esc(w.comment)}</textarea></label>
    <div class="modal-actions">
      ${w.id ? `<button class="danger" id="w-del">Supprimer</button>` : ""}
      <button class="secondary" id="w-cancel">Annuler</button><button id="w-save">Enregistrer</button>
    </div>`, (m) => {
    $("#w-last", m).onclick = () => {
      const type = $("#w-type", m).value.trim().toLowerCase();
      const last = all.find((x) => (x.type || "").toLowerCase() === type && x.id !== w.id && x.text);
      if (!last) return toast("Aucune séance « " + type + " » trouvée");
      // On garde le programme, sans les résultats, pour les noter pendant la séance.
      $("#w-text", m).value = last.text.split("\n").map((l) => l.replace(/(\d+\s*x\s*[\d\-]+s?(?:\s+each)?(?:\s+\d+(?:[.,]\d+)?\s*kg)?).*$/i, "$1")).join("\n");
      toast("Repris du " + frDate(last.date, { day: "numeric", month: "short" }));
    };
    $("#w-cancel", m).onclick = closeModal;
    if (w.id) $("#w-del", m).onclick = async () => { await DB.del("workouts", w.id); closeModal(); render(); };
    $("#w-save", m).onclick = async () => {
      await DB.put("workouts", { ...w, date: $("#w-date", m).value, type: $("#w-type", m).value.trim(),
        text: $("#w-text", m).value, comment: $("#w-comment", m).value });
      closeModal(); render();
    };
  });
}

function showProgress(all) {
  const names = new Map();
  all.forEach((w) => (w.text || "").split("\n").forEach((l) => {
    const e = Calc.parseExercise(l);
    if (e.sets) { const k = e.name.toLowerCase(); names.set(k, (names.get(k) || 0) + 1); }
  }));
  const options = [...names.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  openModal(`<h2>Progression</h2>
    <label>Exercice<select id="p-ex">${options.map((o) => `<option>${esc(o)}</option>`).join("")}</select></label>
    <div id="p-out"></div><div class="modal-actions"><button id="p-close">Fermer</button></div>`, (m) => {
    const draw = () => {
      const key = $("#p-ex", m).value;
      const rows = [];
      [...all].reverse().forEach((w) => (w.text || "").split("\n").forEach((l) => {
        const e = Calc.parseExercise(l);
        if (e.sets && e.name.toLowerCase() === key) rows.push({ date: w.date, e });
      }));
      $("#p-out", m).innerHTML = lineChart(rows.filter((r) => r.e.kg).map((r) => ({ x: r.date, y: Calc.volume(r.e) })), "Volume (reps × kg)")
        + `<table class="ex">${rows.slice(-30).reverse().map((r) => `<tr><td>${esc(frDate(r.date, { day: "numeric", month: "short", year: "2-digit" }))}</td>
          <td>${r.e.sets}×${esc(r.e.reps)}${r.e.kg ? " · " + fmt(r.e.kg) + " kg" : ""}</td><td>${esc(r.e.results.join(" "))}</td></tr>`).join("")}</table>`;
    };
    $("#p-ex", m).onchange = draw; if (options.length) draw();
    $("#p-close", m).onclick = closeModal;
  });
}

// ---------- Suivi ----------
async function renderSuivi(view) {
  const body = (await DB.all("body")).sort((a, b) => a.date.localeCompare(b.date));
  const entries = await DB.all("entries");
  const weights = body.filter((b) => b.weight);

  // Moyennes par semaine (lundi → dimanche), comme dans le journal des calories.
  const weeks = new Map();
  weights.forEach((b) => { const k = mondayOf(b.date); const w = weeks.get(k) || { w: [], kcal: new Map() }; w.w.push(b.weight); weeks.set(k, w); });
  entries.forEach((e) => {
    const k = mondayOf(e.date); const w = weeks.get(k) || { w: [], kcal: new Map() }; weeks.set(k, w);
    w.kcal.set(e.date, (w.kcal.get(e.date) || 0) + Calc.portion(e.per, e.qty).kcal);
  });
  const weekRows = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 16).map(([k, w]) => ({
    week: k, avg: w.w.length ? w.w.reduce((s, x) => s + x, 0) / w.w.length : null,
    kcal: w.kcal.size ? [...w.kcal.values()].reduce((s, x) => s + x, 0) / w.kcal.size : null,
  }));
  const lastDate = weights.length ? weights.at(-1).date : today();
  const recent = weights.filter((b) => b.date >= addDays(lastDate, -180));

  view.innerHTML = `
    <section class="card">
      <h2>Pesée du jour</h2>
      <div class="grid2">
        <label>Date<input type="date" id="b-date" value="${today()}"></label>
        <label>Poids (kg)<input type="number" step="0.1" inputmode="decimal" id="b-weight"></label>
      </div>
      <button class="link" id="b-more">+ % de graisse et mensurations</button>
      <div id="b-extra" hidden>
        <label>% de graisse<input type="number" step="0.1" id="b-bf"></label>
        <div class="grid2">${MEASURES.map(([k, l]) => `<label>${l}<input type="number" step="0.1" data-m="${k}"></label>`).join("")}</div>
      </div>
      <button id="b-save">Enregistrer</button>
    </section>
    <section class="card"><h2>Poids · 6 derniers mois de pesées</h2>${lineChart(recent.map((b) => ({ x: b.date, y: b.weight })), "kg", weekRows.filter((w) => w.avg && w.week >= addDays(lastDate, -186)).map((w) => ({ x: addDays(w.week, 3), y: w.avg })))}</section>
    <section class="card"><h2>Par semaine</h2>
      <table class="weeks"><tr><th>Semaine du</th><th>Poids moyen</th><th>Écart</th><th>Kcal / jour</th></tr>
      ${weekRows.map((w, i) => { const prev = weekRows.find((x) => x.week === addDays(w.week, -7) && x.avg); const d = w.avg && prev ? w.avg - prev.avg : null;
        return `<tr><td>${esc(frDate(w.week, { day: "numeric", month: "short", year: "2-digit" }))}</td><td>${w.avg ? fmt(w.avg) : "–"}</td>
        <td class="${d < 0 ? "down" : d > 0 ? "up" : ""}">${d == null ? "" : (d > 0 ? "+" : "") + fmt(d)}</td><td>${w.kcal ? n0(w.kcal) : "–"}</td></tr>`; }).join("")}
      </table></section>
    <section class="card"><h2>Mensurations</h2>${measuresTable(body.filter((b) => b.measures || b.bodyFat))}</section>`;

  $("#b-more", view).onclick = () => { $("#b-extra", view).hidden = false; };
  const fill = async () => {
    const b = await DB.get("body", $("#b-date", view).value) || {};
    $("#b-weight", view).value = b.weight || ""; $("#b-bf", view).value = b.bodyFat || "";
    $$("[data-m]", view).forEach((i) => i.value = (b.measures || {})[i.dataset.m] || "");
  };
  $("#b-date", view).onchange = fill; fill();
  $("#b-save", view).onclick = async () => {
    const date = $("#b-date", view).value;
    const prev = await DB.get("body", date) || { date };
    const measures = {};
    $$("[data-m]", view).forEach((i) => { if (i.value) measures[i.dataset.m] = Number(i.value); });
    const rec = { ...prev, weight: Number($("#b-weight", view).value) || prev.weight || null,
      bodyFat: Number($("#b-bf", view).value) || prev.bodyFat || null, measures: Object.keys(measures).length ? measures : prev.measures };
    await DB.put("body", rec);
    // Le poids le plus récent met à jour les objectifs, comme on le faisait à la main dans le calculateur.
    const latest = (await DB.all("body")).filter((b) => b.weight).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest && latest.date === date) {
      const goals = await getGoals();
      await DB.saveSetting("goals", { ...goals, weight: rec.weight, bodyFat: rec.bodyFat || goals.bodyFat });
    }
    toast("Enregistré"); render();
  };
}

function measuresTable(rows) {
  if (!rows.length) return `<p class="muted">Aucune mensuration pour l'instant.</p>`;
  rows = rows.slice(-6);
  return `<div class="scroll"><table class="weeks"><tr><th></th>${rows.map((r) => `<th>${esc(frDate(r.date, { day: "numeric", month: "short", year: "2-digit" }))}</th>`).join("")}</tr>
    <tr><td>Poids</td>${rows.map((r) => `<td>${r.weight ? fmt(r.weight) : ""}</td>`).join("")}</tr>
    <tr><td>% graisse</td>${rows.map((r) => `<td>${r.bodyFat ? fmt(r.bodyFat) : ""}</td>`).join("")}</tr>
    ${MEASURES.map(([k, l]) => `<tr><td>${l}</td>${rows.map((r) => `<td>${(r.measures || {})[k] ? fmt(r.measures[k]) : ""}</td>`).join("")}</tr>`).join("")}
  </table></div>`;
}

// Petit graphique SVG : points bruts + ligne de tendance (moyennes hebdo) optionnelle.
function lineChart(points, unit, trend) {
  if (points.length < 2) return `<p class="muted">Pas encore assez de données.</p>`;
  const W = 600, H = 200, P = 32;
  const xs = points.map((p) => +new Date(p.x)), ys = points.concat(trend || []).map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = (y1 - y0) * 0.1 || 1;
  const sx = (x) => P + ((+new Date(x) - x0) / (x1 - x0 || 1)) * (W - 2 * P);
  const sy = (y) => H - P - ((y - (y0 - pad)) / (y1 - y0 + 2 * pad)) * (H - 2 * P);
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Graphique ${esc(unit)}">
    <text x="${P}" y="14" class="axis">${fmt(y1)} ${esc(unit)}</text><text x="${P}" y="${H - 8}" class="axis">${fmt(y0)}</text>
    <text x="${W - P}" y="${H - 8}" class="axis" text-anchor="end">${esc(frDate(points.at(-1).x, { day: "numeric", month: "short" }))}</text>
    ${trend && trend.length > 1 ? "" : `<path d="${path(points)}" class="line"/>`}
    ${points.map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.5" class="dot"><title>${p.x} : ${fmt(p.y)}</title></circle>`).join("")}
    ${trend && trend.length > 1 ? `<path d="${path(trend.sort((a, b) => a.x.localeCompare(b.x)))}" class="line"/>` : ""}
  </svg>`;
}

// ---------- Objectifs ----------
async function renderObjectifs(view) {
  const goals = await getGoals();
  view.innerHTML = `
    <section class="card">
      <h2>Mes données</h2>
      <div class="grid2">
        <label>Poids à jeun (kg)<input type="number" step="0.1" id="g-weight" value="${goals.weight}"></label>
        <label>% de graisse<input type="number" step="0.5" id="g-bf" value="${goals.bodyFat}"></label>
      </div>
      <label>Activité<select id="g-act">${Calc.ACTIVITY.map(([v, l]) => `<option value="${v}" ${v === goals.activity ? "selected" : ""}>${v} · ${l}</option>`).join("")}</select></label>
      <label>Déficit calorique : <b id="g-def-v">${goals.deficit} %</b><input type="range" min="-20" max="35" step="5" id="g-def" value="${goals.deficit}"></label>
      <p class="muted small">Un déficit négatif correspond à un surplus, pour une prise de masse.</p>
      <label>Répartition des macros<select id="g-mode"><option value="pct">En % des calories</option><option value="gkg" ${goals.mode === "gkg" ? "selected" : ""}>En g par kg de masse sèche</option></select></label>
      <div class="grid2" id="g-pct" ${goals.mode === "gkg" ? "hidden" : ""}>
        <label>Protéines (%)<input type="number" id="g-pp" value="${goals.pct.p}"></label>
        <label>Lipides (%)<input type="number" id="g-pl" value="${goals.pct.l}"></label>
      </div>
      <div class="grid2" id="g-gkg" ${goals.mode === "gkg" ? "" : "hidden"}>
        <label>Protéines (g/kg)<input type="number" step="0.1" id="g-kp" value="${goals.gkg.p}"></label>
        <label>Lipides (g/kg)<input type="number" step="0.1" id="g-kl" value="${goals.gkg.l}"></label>
      </div>
      <p class="muted small">Glucides : le reste des calories. Conseils du calculateur : 30 à 35 % de protéines en sèche (1,5 à 2,5 g/kg de masse sèche), au moins 25 % de lipides (0,7 g/kg).</p>
    </section>
    <section class="card result" id="g-out"></section>`;

  const read = () => ({
    weight: Number($("#g-weight", view).value), bodyFat: Number($("#g-bf", view).value),
    activity: Number($("#g-act", view).value), deficit: Number($("#g-def", view).value), mode: $("#g-mode", view).value,
    pct: { p: Number($("#g-pp", view).value), l: Number($("#g-pl", view).value) },
    gkg: { p: Number($("#g-kp", view).value), l: Number($("#g-kl", view).value) },
  });
  const update = async () => {
    const g = read();
    $("#g-def-v", view).textContent = g.deficit + " %";
    $("#g-pct", view).hidden = g.mode !== "pct"; $("#g-gkg", view).hidden = g.mode !== "gkg";
    const r = Calc.compute(g);
    $("#g-out", view).innerHTML = `
      <div class="stats">
        <div><span>Masse sèche</span><b>${fmt(r.lbm)} kg</b></div>
        <div><span>Métabolisme de base</span><b>${r.bmr} kcal</b></div>
        <div><span>Maintenance</span><b>${r.maintenance} kcal</b></div>
      </div>
      <div class="target"><span>Objectif par jour</span><strong>${r.kcal} kcal</strong>
        ${r.floored ? `<em>Le déficit est plafonné pour ne pas descendre sous le métabolisme de base.</em>` : ""}</div>
      <div class="stats macros">
        <div><span>Protéines</span><b>${r.p} g</b></div><div><span>Lipides</span><b>${r.l} g</b></div><div><span>Glucides</span><b>${r.g} g</b></div>
      </div>`;
    await DB.saveSetting("goals", g);
  };
  $$("input, select", view).forEach((i) => i.oninput = update);
  update();
}

// ---------- Aliments, imports et sauvegardes ----------
async function renderAliments(view) {
  const foods = await Foods.load();
  const count = (s) => foods.filter((f) => f.source === s).length;
  const recipes = await DB.all("recipes");
  view.innerHTML = `
    <section class="card">
      <input type="search" id="a-q" placeholder="Rechercher dans ${foods.length} aliments…">
      <p class="muted small">${count("perso")} perso · ${count("recette")} recettes · ${count("off")} Open Food Facts · ${count("ciqual")} Ciqual</p>
      <ul class="results" id="a-res"></ul>
      <div class="row-actions"><button id="a-new">+ Aliment perso</button><button id="a-recipe" class="secondary">+ Recette</button></div>
    </section>
    ${recipes.length ? `<section class="card"><h2>Recettes</h2><ul class="results">${recipes.map((r) => `<li data-r="${r.id}"><span class="name">${esc(r.name)}</span><span class="muted small">${r.items.length} ingrédients</span></li>`).join("")}</ul></section>` : ""}
    <section class="card">
      <h2>Table Ciqual (ANSES)</h2>
      <p class="small">${count("ciqual")} aliments génériques de la table Ciqual 2025, inclus dans l'appli. Quand l'ANSES publie une nouvelle version sur <a href="https://ciqual.anses.fr/#/cms/telechargement/node/20" target="_blank" rel="noopener">ciqual.anses.fr</a>, tu peux l'importer ici.</p>
      <label class="file">Mettre à jour la table Ciqual (.xls, .xlsx)<input type="file" id="a-ciqual" accept=".xls,.xlsx"></label>
    </section>
    <section class="card">
      <h2>Importer mon historique</h2>
      <p class="small">Depuis Google Sheets : Fichier › Télécharger › Microsoft Excel (.xlsx), puis importe le fichier ici.</p>
      <label class="file">Journal de sport (.xlsx)<input type="file" id="a-journal" accept=".xlsx,.xls,.csv" multiple></label>
      <label class="file">Calculateur, pour les pesées (.xlsx)<input type="file" id="a-calc" accept=".xlsx,.xls" multiple></label>
    </section>
    <section class="card">
      <h2>Sauvegarde</h2>
      <p class="small">Les données sont stockées dans ce navigateur. Exporte régulièrement une sauvegarde, par exemple dans ton Drive.</p>
      <div class="row-actions"><button id="a-export">Exporter (.json)</button><label class="file inline secondary">Restaurer<input type="file" id="a-import" accept=".json"></label></div>
    </section>`;

  const res = $("#a-res", view), q = $("#a-q", view);
  const show = async () => {
    const list = await Foods.search(q.value, 30);
    res.innerHTML = list.map((f) => `<li data-id="${f.id}">${foodRow(f)}</li>`).join("");
    $$("li", res).forEach((li) => li.onclick = () => {
      const f = list.find((x) => x.id === Number(li.dataset.id));
      if (f.recipeId) return editRecipe(recipes.find((r) => r.id === f.recipeId));
      editFood(f);
    });
  };
  q.oninput = show; show();
  $("#a-new", view).onclick = () => editFood({ name: "", source: "perso", unit: "100g", kcal: 0, p: 0, g: 0, l: 0 });
  $("#a-recipe", view).onclick = () => editRecipe({ name: "", items: [], cookedWeight: null });
  $$("[data-r]", view).forEach((li) => li.onclick = () => editRecipe(recipes.find((r) => r.id === Number(li.dataset.r))));

  $("#a-ciqual", view).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    toast("Import en cours…");
    try { toast((await Foods.importCiqual(file)) + " aliments Ciqual importés"); render(); }
    catch (err) { alert(err.message); }
  };
  $("#a-journal", view).onchange = async (e) => {
    let total = 0;
    for (const f of e.target.files) total += await importJournal(f).catch((err) => (alert(f.name + " : " + err.message), 0));
    toast(total + " séances importées"); render();
  };
  $("#a-calc", view).onchange = async (e) => {
    let total = 0;
    for (const f of e.target.files) total += await importWeights(f).catch((err) => (alert(f.name + " : " + err.message), 0));
    toast(total + " pesées importées"); render();
  };
  $("#a-export", view).onclick = async () => {
    const blob = new Blob([JSON.stringify(await DB.exportAll())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `forme-sauvegarde-${today()}.json`; a.click();
  };
  $("#a-import", view).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm("Remplacer toutes les données actuelles par cette sauvegarde ?")) return;
    await DB.importAll(JSON.parse(await file.text())); Foods.invalidate(); toast("Sauvegarde restaurée"); render();
  };
}

function editRecipe(recipe) {
  const items = recipe.items.map((it) => ({ ...it }));
  openModal(`
    <h2>${recipe.id ? "Modifier la recette" : "Nouvelle recette"}</h2>
    <label>Nom<input id="r-name" value="${esc(recipe.name)}"></label>
    <ul class="results" id="r-items"></ul>
    <input type="search" id="r-q" placeholder="Ajouter un ingrédient…"><ul class="results" id="r-res"></ul>
    <label>Poids total une fois cuit (g, facultatif)<input type="number" id="r-cooked" value="${recipe.cookedWeight || ""}"></label>
    <p class="preview" id="r-prev"></p>
    <div class="modal-actions">${recipe.id ? `<button class="danger" id="r-del">Supprimer</button>` : ""}
      <button class="secondary" id="r-cancel">Annuler</button><button id="r-save">Enregistrer</button></div>`, async (m) => {
    const foods = await Foods.load();
    const draw = async () => {
      $("#r-items", m).innerHTML = items.map((it, i) => `<li><span class="name">${esc(it.name)}</span>
        <input type="number" class="qty-in" data-i="${i}" value="${it.qty}"> g <button class="link" data-x="${i}">✕</button></li>`).join("");
      $$("[data-i]", m).forEach((inp) => inp.oninput = () => { items[inp.dataset.i].qty = Number(inp.value); preview(); });
      $$("[data-x]", m).forEach((b) => b.onclick = () => { items.splice(b.dataset.x, 1); draw(); });
      preview();
    };
    const preview = async () => {
      const f = await Foods.recipeToFood({ ...recipe, items, cookedWeight: Number($("#r-cooked", m).value) || null });
      $("#r-prev", m).textContent = `Pour 100 g : ${n0(f.kcal)} kcal · P ${fmt(f.p)} · G ${fmt(f.g)} · L ${fmt(f.l)}`;
    };
    $("#r-cooked", m).oninput = preview;
    $("#r-q", m).oninput = async () => {
      const list = $("#r-q", m).value ? (await Foods.search($("#r-q", m).value, 8)).filter((f) => f.source !== "recette") : [];
      $("#r-res", m).innerHTML = list.map((f) => `<li data-id="${f.id}">${foodRow(f)}</li>`).join("");
      $$("#r-res li", m).forEach((li) => li.onclick = () => {
        const f = foods.find((x) => x.id === Number(li.dataset.id));
        items.push({ foodId: f.id, name: f.name, qty: f.unit === "u" ? 1 : 100 });
        $("#r-q", m).value = ""; $("#r-res", m).innerHTML = ""; draw();
      });
    };
    $("#r-cancel", m).onclick = closeModal;
    if (recipe.id) $("#r-del", m).onclick = async () => {
      await DB.del("recipes", recipe.id); if (recipe.foodId) await DB.del("foods", recipe.foodId);
      Foods.invalidate(); closeModal(); render();
    };
    $("#r-save", m).onclick = async () => {
      const r = { ...recipe, name: $("#r-name", m).value.trim() || "Recette", items, cookedWeight: Number($("#r-cooked", m).value) || null };
      r.id = await DB.put("recipes", r);
      const food = await Foods.recipeToFood(r);
      if (!food.id) delete food.id;
      r.foodId = await Foods.save(food);
      await DB.put("recipes", r);
      closeModal(); render();
    };
    draw();
  });
}

// --- Imports depuis les fichiers Google Sheets / Excel ---
function parseSheetDate(v) {
  if (typeof v === "number") return iso(new Date(Math.round((v - 25569) * 86400000)));   // date série Excel
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

async function readWorkbook(file) {
  await loadScript("lib/xlsx.full.min.js");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true }) }));
}

// Journal de sport : colonnes Jour | Date | Type | Déroulé | Commentaire, dans chaque onglet.
async function importJournal(file) {
  const sheets = await readWorkbook(file);
  const existing = new Set((await DB.all("workouts")).map((w) => w.date + "|" + (w.type || "").toLowerCase()));
  const out = [];
  for (const { name, rows } of sheets) {
    if (/template|mod[eè]le/i.test(name)) continue;            // onglets modèles, pas de vraies séances
    const hi = rows.findIndex((r) => r.some((c) => /^type$/i.test(String(c).trim())) && r.some((c) => /d[ée]roul/i.test(c)));
    if (hi < 0) continue;
    const h = rows[hi].map((c) => String(c).trim().toLowerCase());
    const ci = { type: h.indexOf("type"), text: h.findIndex((c) => /d[ée]roul/.test(c)), comment: h.findIndex((c) => /comment/.test(c)) };
    for (const r of rows.slice(hi + 1)) {
      const date = r.slice(0, ci.type > 0 ? ci.type : 3).map(parseSheetDate).find(Boolean);
      const text = String(r[ci.text] || "").trim(), type = String(r[ci.type] || "").trim();
      if (!date || (!text && !type)) continue;
      const key = date + "|" + type.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      out.push({ date, type, text, comment: ci.comment >= 0 ? String(r[ci.comment] || "").trim() : "" });
    }
  }
  await DB.bulkPut("workouts", out);
  return out.length;
}

// Calculateur : onglets « Journal des Calories » (Date … Poids) et « Mesures ».
async function importWeights(file) {
  const sheets = await readWorkbook(file);
  const body = new Map((await DB.all("body")).map((b) => [b.date, b]));
  let n = 0;
  for (const { rows } of sheets) {
    const hi = rows.findIndex((r) => r.some((c) => /^date$/i.test(String(c).trim())) && r.some((c) => /^poids$/i.test(String(c).trim())));
    if (hi < 0) continue;
    const h = rows[hi].map((c) => String(c).trim().toLowerCase());
    const di = h.indexOf("date"), wi = h.indexOf("poids");
    for (const r of rows.slice(hi + 1)) {
      const date = parseSheetDate(r[di]), w = Number(String(r[wi]).replace(",", "."));
      if (!date || !w) continue;
      const b = body.get(date) || { date };
      if (!b.weight) { b.weight = w; body.set(date, b); n++; }
    }
  }
  await DB.bulkPut("body", [...body.values()]);
  return n;
}

// ---------- Démarrage ----------
$$(".tabbar button").forEach((b) => b.onclick = () => setView(b.dataset.view));
$("#prev-day").onclick = () => { state.date = addDays(state.date, -1); render(); };
$("#next-day").onclick = () => { state.date = addDays(state.date, 1); render(); };
$("#current-date").onchange = (e) => { state.date = e.target.value || today(); render(); };
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

(async () => {
  await Foods.seedIfEmpty();
  setView("repas");
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
})();
