/**
 * Gemeinsame Darstellung der Testoberflaeche.
 *
 * Reine Anzeige: kein fetch, kein Zustand. Die Chartansicht selbst steht in
 * js/chart.js, der Endpunkt-Browser in js/explorer.js; hier liegt, was beide
 * brauchen - Maskierung, Statuszeile, Fehlertexte und die Chartliste.
 */
import { ApiError } from "./api.js";

/** Maskiert Text fuer die Ausgabe in HTML. */
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/**
 * Fehler als fertiger Satz. ApiError bringt ihn mit (inklusive Feldfehlern),
 * alles andere wird in Text verwandelt.
 */
export function fehlertext(error) {
  return error instanceof ApiError ? error.readable : String(error?.message || error);
}

/**
 * Statuszeile oben rechts. Sie steht in der einzeiligen Kopfzeile und wird
 * dort abgeschnitten - der ganze Text haengt deshalb als Tooltip daran.
 */
export function setStatus(el, text, kind = "") {
  el.textContent = text;
  el.title = text;
  el.className = "status " + kind;
}

/**
 * Chartliste.
 *
 * @param {HTMLElement} listEl
 * @param {object[]} charts
 * @param {object} aktionen {oeffnen(id), merken(id), istGemerkt(id), aktiv}
 */
export function renderChartList(listEl, charts, aktionen) {
  listEl.innerHTML = "";

  for (const chart of charts) {
    const eintrag = document.createElement("li");
    if (chart.id === aktionen.aktiv) eintrag.className = "aktiv";

    const oeffnen = document.createElement("button");
    oeffnen.className = "chartknopf";
    oeffnen.innerHTML =
      `<strong>${esc(chart.first_name)} ${esc(chart.last_name)}</strong>` +
      `<div class="meta">#${chart.id} · ${esc((chart.birthdate || "").slice(0, 16))} · ` +
      `${esc(chart.type || "?")} ${esc(chart.profile || "")}</div>`;
    oeffnen.onclick = () => aktionen.oeffnen(chart.id);

    // Merkliste fuer Interaktion, Penta und Organisationsmodell
    const merken = document.createElement("button");
    const gemerkt = aktionen.istGemerkt(chart.id);
    merken.className = "merkknopf" + (gemerkt ? " an" : "");
    merken.textContent = gemerkt ? "−" : "+";
    merken.title = gemerkt ? "aus der Merkliste nehmen" : "für Gruppen merken";
    merken.onclick = (ereignis) => { ereignis.stopPropagation(); aktionen.merken(chart.id); };

    eintrag.append(oeffnen, merken);
    listEl.appendChild(eintrag);
  }
}

/**
 * Macht fremdes HTML anzeigbar.
 *
 * Die Erklaerbereiche koennen ihr HTML mitliefern (`?include_html=1`); es
 * kommt aus den Bausteinen der Anwendung, enthaelt aber auch Chartdaten und
 * damit Text, den Kunden eingegeben haben. Deshalb fliegen Skripte, Stile,
 * eingebettete Rahmen und Ereignis-Attribute heraus, bevor etwas in die
 * Seite kommt.
 */
export function htmlSaeubern(html) {
  const dokument = new DOMParser().parseFromString(String(html ?? ""), "text/html");

  dokument.querySelectorAll("script, style, iframe, object, embed, link, meta, form")
    .forEach((el) => el.remove());

  for (const el of dokument.querySelectorAll("*")) {
    for (const attribut of [...el.attributes]) {
      const name = attribut.name.toLowerCase();
      const wert = attribut.value.trim().toLowerCase();

      if (name.startsWith("on") || (["href", "src"].includes(name) && wert.startsWith("javascript:"))) {
        el.removeAttribute(attribut.name);
      }
    }
  }

  return dokument.body.innerHTML;
}

/** Rohantwort zum Nachschauen. */
export function renderJson(value) {
  return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
}
