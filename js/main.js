/**
 * Testoberflaeche fuer die 64keys REST API.
 *
 * Haelt den Zustand und verdrahtet die Bedienelemente mit js/api.js (HTTP),
 * js/chart.js (Chartansicht), js/dict.js (Namen zu den Zahlen) und
 * js/explorer.js (Endpunkt-Browser). Hier steht bewusst kein HTML und kein
 * fetch.
 */
import { Api } from "./api.js";
import { Dict } from "./dict.js";
import { Chartansicht } from "./chart.js";
import { Gruppenansicht } from "./gruppen.js";
import { Explorer } from "./explorer.js";
import * as ui from "./ui.js";

const $ = (id) => document.getElementById(id);

const api = Api.fromStorage();
const dict = new Dict(api);

/** Was gerade angezeigt wird. */
const state = {
  chartId: null,
  seite: 1,
  auswahl: new Set(), // Merkliste fuer Interaktion, Penta, Organisationsmodell
  namen: new Map(),   // id => Name, damit die Merkliste lesbar bleibt
};

/** Die beiden grossen Ansichten. */
let explorer = null;

/** Rechnet die Merkliste als Interaktion, Penta oder Organisationsmodell. */
const gruppenansicht = new Gruppenansicht({
  api,
  dict,
  wurzel: $("detail"),
  auswahl: state.auswahl,
  namen: state.namen,
});

const chartansicht = new Chartansicht({
  api,
  dict,
  wurzel: $("detail"),
  auswahl: state.auswahl,
  oeffnen: (id) => oeffneChart(id),
  nachLaden: () => ladeListe(),
});

/** Zeigt eine Gruppenauswertung im rechten Bereich. */
async function zeigeGruppe(art) {
  state.chartId = null;
  await dict.laden();
  await namenHolen([...state.auswahl]);
  await gruppenansicht.zeige(art);
  await ladeListe();
}

function moduswechsel(modus) {
  const aufEndpunkte = modus === "explorer";

  $("viewCharts").hidden = aufEndpunkte;
  $("viewExplorer").hidden = !aufEndpunkte;
  $("modeCharts").setAttribute("aria-selected", String(!aufEndpunkte));
  $("modeExplorer").setAttribute("aria-selected", String(aufEndpunkte));

  if (aufEndpunkte && !explorer) {
    explorer = new Explorer(api, $("viewExplorer"));
    explorer.laden();
  }
}

// ---- Verbindung ----------------------------------------------------------

async function verbinden() {
  api.baseUrl = $("base").value.trim().replace(/\/+$/, "");
  api.token = $("token").value.trim();
  api.lang = $("lang").value;

  const problem = api.tokenProblem();
  if (problem) {
    ui.setStatus($("conn"), problem, "err");
    return;
  }

  api.save();
  ui.setStatus($("conn"), "verbinde …");

  try {
    const me = await api.me();
    const rollen = (me.roles || []).join(", ") || "ohne Rolle";
    ui.setStatus($("conn"), `verbunden als ${me.name} (${rollen})`, "ok");

    // Die Namen zu Typen, Kanaelen und Farben einmal je Sprache holen
    dict.sprache = null;
    await dict.laden();

    await ladeListe();
    await ladeMengen();
    await zeigeGrenze(me, rollen);

    if (explorer) explorer.laden();
  } catch (error) {
    ui.setStatus($("conn"), verbindungsfehler(error), "err");
  }
}

/**
 * Die Ratenbegrenzung ist beim Testen die haeufigste Stolperstelle - sie
 * steht deshalb in der Statuszeile.
 */
async function zeigeGrenze(me, rollen) {
  try {
    const grenze = await api.limits();
    ui.setStatus($("conn"),
      `verbunden als ${me.name} (${rollen}) · ${grenze.remaining} von ${grenze.per_minute} Anfragen frei`,
      "ok");
  } catch { /* nicht so wichtig, dass es die Verbindung in Frage stellt */ }
}

function verbindungsfehler(error) {
  if (error?.code === "rate_limited") {
    return ui.fehlertext(error) +
      " Die Begrenzung gilt je Minute und Konto; nach kurzer Wartezeit geht es weiter.";
  }

  return ui.fehlertext(error);
}

// ---- Liste und Suche -----------------------------------------------------

/**
 * Alle Suchfelder der Oberflaeche als Filter fuer GET /charts.
 *
 * Besteht der Suchbegriff nur aus Ziffern (oder einer Liste davon), ist eine
 * id gemeint - dann wird gezielt abgerufen statt im Text gesucht.
 */
function filter() {
  const begriff = $("fSearch").value.trim();
  const sindIds = /^\s*\d+(\s*,\s*\d+)*\s*$/.test(begriff);

  return {
    search: sindIds ? "" : begriff,
    ids: sindIds ? begriff.replace(/\s+/g, "") : "",
    type: $("fType").value,
    profile: $("fProfile").value.trim(),
    authority: $("fAuthority").value,
    gate: $("fGate").value.trim(),
    channel: $("fChannel").value.trim(),
    label: $("fLabel").value.trim(),
    organisation: $("fOrg").value.trim(),
    sort: $("fSort").value,
    direction: $("fDir").value,
    trashed: $("fTrashed").checked ? 1 : "",
    shared: $("fShared").checked ? 1 : "",
    is_example: $("fExample").checked ? 1 : "",
    page: state.seite,
  };
}

async function ladeListe() {
  try {
    const res = await api.listCharts(filter());
    const charts = res.data || [];

    for (const chart of charts) {
      state.namen.set(chart.id,
        `${chart.first_name || ""} ${chart.last_name || ""}`.trim() || `#${chart.id}`);
    }

    ui.renderChartList($("charts"), charts, {
      aktiv: state.chartId,
      oeffnen: oeffneChart,
      istGemerkt: (id) => state.auswahl.has(id),
      merken: (id) => {
        state.auswahl.has(id) ? state.auswahl.delete(id) : state.auswahl.add(id);
        ladeListe();
        zeigeMerkliste();
      },
    });

    $("chartsEmpty").hidden = charts.length > 0;

    const meta = res.meta || {};
    $("chartsMeta").textContent = meta.total !== undefined
      ? `${meta.total} Charts · Seite ${meta.current_page} von ${meta.last_page}`
      : "";
    $("prev").disabled = (meta.current_page || 1) <= 1;
    $("next").disabled = (meta.current_page || 1) >= (meta.last_page || 1);

    zeigeMerkliste();
  } catch (error) {
    ui.setStatus($("conn"), ui.fehlertext(error), "err");
  }
}

/**
 * Die Merkliste ist der Weg von der Suche in die Gruppenmodelle: was hier
 * steht, rechnet der Reiter "Gruppen" als Interaktion, Penta oder
 * Organisationsmodell - und laesst sich als Menge speichern, die auch das
 * Webinterface kennt.
 *
 * Angezeigt werden Namen, nicht ids: eine Reihe blosser Zahlen sagt
 * niemandem, wen er da ausgewaehlt hat.
 */
async function zeigeMerkliste() {
  const ids = [...state.auswahl];

  $("merkAnzahl").textContent = ids.length
    ? `(${ids.length} ${ids.length === 1 ? "Chart" : "Charts"})`
    : "(leer)";

  $("merkSave").disabled = ids.length === 0;
  $("merkClear").disabled = ids.length === 0;

  // Jedes Modell hat seine Spanne; was nicht passt, bleibt gesperrt - das
  // erspart die Fehlermeldung nach dem Klick.
  $("grInteraktion").disabled = ids.length !== 2;
  $("grPenta").disabled = ids.length < 3 || ids.length > 5;
  $("grOrganisation").disabled = ids.length < 3;

  if (!ids.length) {
    $("merkliste").innerHTML = `<span class="hint">noch nichts vorgemerkt</span>`;
    return;
  }

  await namenHolen(ids);

  $("merkliste").innerHTML = ids.map((id) =>
    `<span class="chip">${ui.esc(state.namen.get(id) || "#" + id)}` +
    `<button class="linkknopf" data-merk-weg="${id}" title="entfernen">×</button></span>`).join("");

  $("merkliste").querySelectorAll("[data-merk-weg]").forEach((knopf) => {
    knopf.onclick = () => {
      state.auswahl.delete(Number(knopf.dataset.merkWeg));
      zeigeMerkliste();
      ladeListe();
    };
  });
}

/** Namen zu ids, die noch keinen haben - in einem Abruf fuer alle. */
async function namenHolen(ids) {
  const fehlend = ids.filter((id) => !state.namen.has(id));
  if (!fehlend.length) return;

  try {
    const res = await api.listCharts({ ids: fehlend.join(","), per_page: 100 });

    for (const chart of res.data || []) {
      state.namen.set(chart.id,
        `${chart.first_name || ""} ${chart.last_name || ""}`.trim() || `#${chart.id}`);
    }
  } catch { /* dann eben die ids */ }
}

/** Die Merkliste als gespeicherte Menge ablegen. */
async function mengeSpeichern() {
  const name = $("merkName").value.trim();

  if (!name) {
    $("merkMsg").textContent = "Bitte einen Namen für die Menge angeben.";
    return;
  }

  try {
    const menge = await api.createChartSet({ name, charts: [...state.auswahl] });
    $("merkMsg").textContent = `Menge „${menge.name}“ mit ${menge.chart_count} Charts gespeichert.`;
    $("merkName").value = "";
    await ladeMengen();
  } catch (error) {
    $("merkMsg").textContent = ui.fehlertext(error);
  }
}

/** Gespeicherte Mengen des Kontos; ausgewaehlt fuellt sie die Merkliste. */
async function ladeMengen() {
  try {
    const mengen = await api.chartSets();
    $("sets").innerHTML = `<option value="">gespeicherte Menge …</option>` +
      mengen.map((m) =>
        `<option value="${m.id}">${ui.esc(m.name)} (${m.chart_count})</option>`).join("");
  } catch {
    // Ohne das Recht MAIN_SETS gibt es keine Mengen - kein Fehlerfall
    $("sets").innerHTML = `<option value="">keine Mengen verfügbar</option>`;
  }
}

async function mengeUebernehmen() {
  const id = $("sets").value;
  if (!id) return;

  try {
    const menge = await api.chartSet(id);

    state.auswahl.clear();
    for (const chart of menge.charts || []) {
      state.auswahl.add(chart.id);
      state.namen.set(chart.id,
        `${chart.first_name || ""} ${chart.last_name || ""}`.trim() || `#${chart.id}`);
    }

    // Eine Menge kann Charts enthalten, die dieses Konto nicht sehen darf -
    // sonst wundert sich jemand, warum aus 19 Charts 13 werden.
    const versteckt = menge.hidden_count || 0;
    $("merkMsg").textContent = versteckt
      ? `„${menge.name}“: ${menge.charts.length} von ${menge.chart_count} Charts übernommen, ` +
        `${versteckt} sind für dieses Konto nicht sichtbar.`
      : `„${menge.name}“: ${menge.charts.length} Charts übernommen.`;

    await zeigeMerkliste();
    await ladeListe();
  } catch (error) {
    ui.setStatus($("conn"), ui.fehlertext(error), "err");
  }
}

// ---- Chart oeffnen und anlegen -------------------------------------------

async function oeffneChart(id) {
  state.chartId = id;
  await chartansicht.zeige(id);
  await ladeListe();
}

async function chartAnlegen(ereignis) {
  ereignis.preventDefault();
  $("createMsg").textContent = "";
  $("createBtn").disabled = true;

  const nutzlast = {
    first_name: $("first_name").value.trim(),
    last_name: $("last_name").value.trim(),
    birthdate: $("birthdate").value,
    birthtime: $("birthtime").value,
    time_accuracy: Number($("time_accuracy").value),
    city: $("city").value.trim() || null,
  };

  if ($("place").value === "coords") {
    nutzlast.latitude = Number($("latitude").value);
    nutzlast.longitude = Number($("longitude").value);
  } else {
    nutzlast.timezone_offset = Number($("timezone_offset").value);
    nutzlast.dst_offset = Number($("dst_offset").value);
  }

  try {
    if ($("nurRechnen").checked) {
      // Quickview: rechnen, ohne einen Datensatz anzulegen
      const chart = await api.calculateChart(nutzlast);
      chartansicht.chart = chart;
      chartansicht.roh = { data: chart };
      await dict.laden();
      chartansicht.render();
      $("createMsg").textContent = "";
    } else {
      const chart = await api.createChart(nutzlast);
      await ladeListe();
      await oeffneChart(chart.id);
    }
  } catch (error) {
    $("createMsg").textContent = ui.fehlertext(error);
  } finally {
    $("createBtn").disabled = false;
  }
}

// ---- Start ---------------------------------------------------------------

$("base").value = api.baseUrl;
$("token").value = api.token;
$("lang").value = api.lang;

$("connect").onclick = verbinden;
$("modeCharts").onclick = () => moduswechsel("charts");
$("modeExplorer").onclick = () => moduswechsel("explorer");

$("forget").onclick = () => {
  api.forgetToken();
  $("token").value = "";
  ui.setStatus($("conn"), "Token entfernt");
};

$("suchen").onclick = () => { state.seite = 1; ladeListe(); };
$("zuruecksetzen").onclick = () => {
  for (const id of ["fSearch", "fProfile", "fGate", "fChannel", "fLabel", "fOrg"]) $(id).value = "";
  for (const id of ["fType", "fAuthority"]) $(id).value = "";
  for (const id of ["fTrashed", "fShared", "fExample"]) $(id).checked = false;
  state.seite = 1;
  ladeListe();
};

$("prev").onclick = () => { state.seite = Math.max(1, state.seite - 1); ladeListe(); };
$("next").onclick = () => { state.seite += 1; ladeListe(); };
$("sets").onchange = mengeUebernehmen;
$("merkClear").onclick = () => {
  state.auswahl.clear();
  $("merkMsg").textContent = "";
  zeigeMerkliste();
  ladeListe();
};
$("merkSave").onclick = mengeSpeichern;
$("grInteraktion").onclick = () => zeigeGruppe("interaktion");
$("grPenta").onclick = () => zeigeGruppe("penta");
$("grOrganisation").onclick = () => zeigeGruppe("organisation");

$("fSearch").onkeydown = (ereignis) => {
  if (ereignis.key === "Enter") { ereignis.preventDefault(); state.seite = 1; ladeListe(); }
};

$("newChart").onsubmit = chartAnlegen;

$("lang").onchange = async () => {
  api.lang = $("lang").value;
  api.save();
  await dict.laden();
  if (state.chartId) oeffneChart(state.chartId);
};

$("place").onchange = () => {
  const koordinaten = $("place").value === "coords";
  $("coordFields").hidden = !koordinaten;
  $("tzFields").hidden = koordinaten;
};

$("meChart").onclick = async () => {
  try {
    const chart = await api.myChart();
    await oeffneChart(chart.id);
  } catch (error) {
    ui.setStatus($("conn"), ui.fehlertext(error), "err");
  }
};

if (api.token) verbinden();
