/**
 * Gruppenauswertungen der Testoberflaeche.
 *
 * Interaktion (zwei Charts), Penta (drei bis fuenf) und das
 * Organisationsmodell (ab drei) rechnen immer mit derselben Auswahl: der
 * Merkliste links. Deshalb liegt diese Ansicht nicht im Chart, sondern
 * neben der Liste - wer Charts vormerkt, drueckt direkt daneben auf das,
 * was er damit rechnen will.
 *
 * Kein fetch hier (das macht js/api.js), kein Zustand ausser dem Ergebnis.
 */
import { esc, fehlertext } from "./ui.js";

/** Die vier Auswertungsgrafiken des Organisationsmodells. */
const O16_GRAFIKEN = {
  types: "Typenverteilung",
  centers: "Zentren",
  specials: "Besonderheiten",
  powerbase: "Powerbase",
};

export class Gruppenansicht {
  /**
   * @param {object} umgebung {api, dict, wurzel, auswahl, namen, oeffnen}
   */
  constructor(umgebung) {
    Object.assign(this, umgebung);
  }

  /** Rechnet die Merkliste als `art` und zeigt das Ergebnis. */
  async zeige(art) {
    const ids = [...this.auswahl];

    this.wurzel.innerHTML = `
      <div class="chartkopf">
        <h2>${esc(this.#ueberschrift(art))}</h2>
        <div class="kopfzeile">${esc(this.#beteiligte(ids))}</div>
      </div>
      <div class="bar">
        ${Object.entries({
          interaktion: "Interaktion",
          penta: "Penta",
          organisation: "Organisation",
        }).map(([k, label]) =>
          `<button data-art="${k}" aria-selected="${k === art}"${
            this.#moeglich(k, ids.length) ? "" : " disabled"}>${label}</button>`).join("")}
        <label class="inline"><input type="checkbox" id="grSvg" checked> mit Grafik</label>
      </div>
      <div id="grBody"><p class="hint">wird gerechnet …</p></div>`;

    this.wurzel.querySelectorAll("[data-art]").forEach((knopf) => {
      knopf.onclick = () => this.zeige(knopf.dataset.art);
    });

    const hinweis = this.#warumNicht(art, ids.length);

    if (hinweis) {
      this.wurzel.querySelector("#grBody").innerHTML = `<p class="err">${esc(hinweis)}</p>`;
      return;
    }

    await this.#rechnen(art, ids);
  }

  // ---- intern ------------------------------------------------------------

  #ueberschrift(art) {
    return {
      interaktion: "Interaktion",
      penta: "Penta",
      organisation: "Organisationsmodell O16",
    }[art] || "Gruppe";
  }

  #beteiligte(ids) {
    const namen = ids.map((id) => this.namen.get(id) || `#${id}`);
    return `${ids.length} ${ids.length === 1 ? "Chart" : "Charts"}: ${namen.join(", ")}`;
  }

  #moeglich(art, anzahl) {
    return {
      interaktion: anzahl === 2,
      penta: anzahl >= 3 && anzahl <= 5,
      organisation: anzahl >= 3,
    }[art];
  }

  #warumNicht(art, anzahl) {
    if (this.#moeglich(art, anzahl)) return null;

    return {
      interaktion: `Eine Interaktion rechnet genau zwei Charts – vorgemerkt sind ${anzahl}.`,
      penta: `Ein Penta rechnet drei bis fünf Charts – vorgemerkt sind ${anzahl}.`,
      organisation: `Das Organisationsmodell rechnet ab drei Charts – vorgemerkt sind ${anzahl}.`,
    }[art];
  }

  async #rechnen(art, ids) {
    const feld = this.wurzel.querySelector("#grBody");
    const mitGrafik = this.wurzel.querySelector("#grSvg").checked;

    this.wurzel.querySelector("#grSvg").onchange = () => this.zeige(art);

    try {
      const { html, danach } = await ({
        interaktion: () => this.#interaktion(ids, mitGrafik),
        penta: () => this.#penta(ids, mitGrafik),
        organisation: () => this.#organisation(ids, mitGrafik),
      })[art]();

      feld.innerHTML = html;
      await danach?.();
    } catch (error) {
      feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  async #interaktion([a, b], mitGrafik) {
    const d = await this.api.interaction(a, b);

    return {
      danach: mitGrafik
        ? () => this.#svgEinsetzen("grSvgBox", () => this.api.interactionSvg(a, b))
        : null,
      html: `
        <table class="daten">
          <tr><th>Komposit-Zentren</th><td>${d.composite.defined_centers} definiert, ${d.composite.open_centers} offen</td></tr>
          <tr><th>Kanäle</th><td>${(d.composite.channels || []).map((k) => this.dict.kanal(k)).join(", ") || "–"}</td></tr>
          <tr><th>Gefährtentore / -kanäle</th><td>${d.connection.companion_gates} / ${d.connection.companion_channels}</td></tr>
          <tr><th>Ergänzungen</th><td>${d.connection.complements}</td></tr>
          <tr><th>Dominanz</th><td>${d.connection.dominance.chart1} : ${d.connection.dominance.chart2}</td></tr>
          <tr><th>Trigger ${esc(this.namen.get(a) || "Chart 1")}</th><td>+${d.triggers.chart1.supporting} / −${d.triggers.chart1.challenging}</td></tr>
          <tr><th>Trigger ${esc(this.namen.get(b) || "Chart 2")}</th><td>+${d.triggers.chart2.supporting} / −${d.triggers.chart2.challenging}</td></tr>
        </table>
        ${mitGrafik ? `<div class="bodygraph" id="grSvgBox"></div>` : ""}`,
    };
  }

  async #penta(ids, mitGrafik) {
    const d = await this.api.penta(ids);

    return {
      danach: mitGrafik
        ? () => this.#svgEinsetzen("grSvgBox", () => this.api.pentaSvg(ids))
        : null,
      html: `
        <table class="daten">
          <tr><th>Teamklima</th><td>${esc(d.team_climate.index ?? "–")} (+${d.team_climate.supporting} / −${d.team_climate.challenging})</td></tr>
          <tr><th>Fehlende Pentatore</th><td>${d.penta_gates.missing_count}: ${(d.penta_gates.missing || []).join(", ") || "–"}</td></tr>
          <tr><th>Powerbase</th><td>${esc(d.powerbase.strongest ?? "–")} · ${esc(this.#werte(d.powerbase.values))}</td></tr>
          <tr><th>Linien</th><td>${esc(this.#werte(d.lines))}</td></tr>
          <tr><th>Zentren</th><td>${esc(this.#werte(d.centers))}</td></tr>
        </table>
        ${mitGrafik ? `<div class="bodygraph" id="grSvgBox"></div>` : ""}`,
    };
  }

  async #organisation(ids, mitGrafik) {
    const d = await this.api.organisation(ids);

    return {
      danach: mitGrafik
        ? () => Promise.all(Object.keys(O16_GRAFIKEN).map((g) =>
            this.#svgEinsetzen(`o16-${g}`, () => this.api.organisationSvg(ids, g))))
        : null,
      html: `
        <table class="daten">
          <tr><th>Typen (Abweichung von der Norm)</th><td>${esc(this.#werte(d.types))}</td></tr>
          <tr><th>Powerbase</th><td>${esc(d.powerbase.strongest ?? "–")} · ${esc(this.#werte(d.powerbase.values))}</td></tr>
          <tr><th>Fehlende Tore</th><td>${(d.missing_gates || []).join(", ") || "–"}</td></tr>
          <tr><th>Linien</th><td>Durchschnitt ${esc(this.#werte(d.lines.average))}</td></tr>
        </table>
        ${mitGrafik ? `<div class="grafiktafel">${
          Object.entries(O16_GRAFIKEN).map(([g, bezeichnung]) => `
            <figure>
              <figcaption><strong>${esc(bezeichnung)}</strong></figcaption>
              <div class="bodygraph" id="o16-${g}"></div>
            </figure>`).join("")}</div>` : ""}`,
    };
  }

  /** Zahlenreihen lesbar: "O 18,5 · W 2,0 · R 32,5". */
  #werte(werte) {
    if (!werte || typeof werte !== "object") return String(werte ?? "–");

    return Object.entries(werte)
      .map(([name, wert]) => `${name} ${typeof wert === "number" ? wert.toFixed(1) : wert}`)
      .join(" · ");
  }

  async #svgEinsetzen(id, holen) {
    const feld = this.wurzel.querySelector("#" + id);
    if (!feld) return;

    feld.innerHTML = `<p class="hint">Grafik wird geladen …</p>`;
    try {
      feld.innerHTML = await holen();
    } catch (error) {
      feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }
}
