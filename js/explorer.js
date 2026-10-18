/**
 * Endpunkt-Browser.
 *
 * Baut seine Oberfläche aus der Beschreibung, die die API selbst ausliefert
 * (`GET /meta/openapi`): Liste aller Endpunkte, je Endpunkt ein Formular aus
 * den beschriebenen Parametern, Absenden, Antwort ansehen.
 *
 * Dadurch gibt es nur eine Quelle: Wer einen Endpunkt in docs/api/openapi.yaml
 * beschreibt, bekommt die Bedienoberfläche dafür geschenkt — hier steht kein
 * Endpunkt noch einmal.
 */
import { ApiError } from "./api.js";
import { esc } from "./ui.js";

const METHODEN = ["get", "post", "patch", "put", "delete"];

export class Explorer {
  /**
   * @param {import("./api.js").Api} api
   * @param {HTMLElement} wurzel  Element, in dem der Browser lebt
   */
  constructor(api, wurzel) {
    this.api = api;
    this.wurzel = wurzel;
    this.spec = null;
    this.operationen = [];
    this.aktuell = null;
    this.verlauf = [];
  }

  /** Beschreibung holen und Oberfläche aufbauen. */
  async laden() {
    this.wurzel.innerHTML = `<p class="hint">Beschreibung wird geladen …</p>`;

    try {
      this.spec = await this.api.openapi();
    } catch (error) {
      this.wurzel.innerHTML = `<p class="err">${esc(
        error instanceof ApiError ? error.readable : String(error))}</p>`;
      return;
    }

    this.operationen = this.#operationenLesen(this.spec);
    this.#rahmenZeichnen();
    this.#listeZeichnen();
  }

  // ---- Beschreibung auswerten -------------------------------------------

  /** Aus dem Dokument eine flache Liste von Endpunkten machen. */
  #operationenLesen(spec) {
    const out = [];

    for (const [pfad, eintrag] of Object.entries(spec.paths || {})) {
      for (const methode of METHODEN) {
        const op = eintrag[methode];
        if (!op) continue;

        out.push({
          methode: methode.toUpperCase(),
          pfad,
          gruppe: (op.tags && op.tags[0]) || "Sonstiges",
          titel: op.summary || `${methode.toUpperCase()} ${pfad}`,
          beschreibung: op.description || "",
          parameter: [...(eintrag.parameters || []), ...(op.parameters || [])]
            .map((p) => this.#aufloesen(p)),
          body: this.#bodySchema(op),
          beispiele: this.#beispiele(op),
          antworten: op.responses || {},
        });
      }
    }

    return out;
  }

  /** $ref auflösen — die Beschreibung verweist häufig auf components. */
  #aufloesen(knoten) {
    if (!knoten || typeof knoten !== "object") return knoten;

    if (knoten.$ref) {
      const teile = knoten.$ref.replace(/^#\//, "").split("/");
      let ziel = this.spec;
      for (const teil of teile) ziel = ziel?.[teil];
      return this.#aufloesen(ziel);
    }

    return knoten;
  }

  #bodySchema(op) {
    const schema = op.requestBody?.content?.["application/json"]?.schema;
    return schema ? this.#aufloesen(schema) : null;
  }

  #beispiele(op) {
    const beispiele = op.requestBody?.content?.["application/json"]?.examples || {};
    return Object.entries(beispiele).map(([name, b]) => ({
      name, titel: b.summary || name, wert: b.value,
    }));
  }

  // ---- Oberfläche --------------------------------------------------------

  #rahmenZeichnen() {
    const info = this.spec.info || {};

    this.wurzel.innerHTML = `
      <div class="explorer">
        <aside class="explorer-liste">
          <input id="opSuche" placeholder="Endpunkt suchen" aria-label="Endpunkt suchen">
          <div id="opListe"></div>
        </aside>
        <div class="explorer-inhalt">
          <p class="hint" id="opHinweis">
            ${esc(info.title || "API")} ${esc(info.version || "")} ·
            ${this.operationen.length} Endpunkte aus der Beschreibung der API.
            Links einen auswählen.
          </p>
          <div id="opDetail"></div>
        </div>
      </div>`;

    this.wurzel.querySelector("#opSuche").oninput = (e) =>
      this.#listeZeichnen(e.target.value.trim().toLowerCase());
  }

  #listeZeichnen(filter = "") {
    const passend = this.operationen.filter((op) =>
      !filter ||
      op.pfad.toLowerCase().includes(filter) ||
      op.titel.toLowerCase().includes(filter) ||
      op.methode.toLowerCase().includes(filter));

    const gruppen = {};
    for (const op of passend) (gruppen[op.gruppe] ||= []).push(op);

    this.wurzel.querySelector("#opListe").innerHTML = Object.entries(gruppen)
      .map(([gruppe, ops]) => `
        <div class="op-gruppe">
          <h3>${esc(gruppe)}</h3>
          ${ops.map((op) => `
            <button class="op" data-op="${esc(op.methode + " " + op.pfad)}">
              <span class="verb verb-${op.methode.toLowerCase()}">${op.methode}</span>
              <span class="op-pfad">${esc(op.pfad)}</span>
              <span class="op-titel">${esc(op.titel)}</span>
            </button>`).join("")}
        </div>`).join("") || `<p class="hint">Nichts gefunden.</p>`;

    this.wurzel.querySelectorAll("[data-op]").forEach((b) => {
      b.onclick = () => {
        const [methode, ...rest] = b.dataset.op.split(" ");
        this.#detailZeichnen(this.operationen.find(
          (o) => o.methode === methode && o.pfad === rest.join(" ")));
      };
    });
  }

  #detailZeichnen(op) {
    if (!op) return;
    this.aktuell = op;

    const pfadParameter = op.parameter.filter((p) => p.in === "path");
    const abfrageParameter = op.parameter.filter((p) => p.in === "query");

    this.wurzel.querySelector("#opHinweis").hidden = true;
    this.wurzel.querySelector("#opDetail").innerHTML = `
      <h2><span class="verb verb-${op.methode.toLowerCase()}">${op.methode}</span>
        <code>${esc(op.pfad)}</code></h2>
      <p>${esc(op.titel)}</p>
      ${op.beschreibung ? `<div class="hint beschreibung">${esc(op.beschreibung)}</div>` : ""}

      ${this.#feldgruppe("Pfad", pfadParameter, true)}
      ${this.#feldgruppe("Abfrage", abfrageParameter, false)}
      ${this.#bodyFeld(op)}

      <div class="bar" style="margin:12px 0">
        <button id="opSenden">Absenden</button>
        <button id="opCurl" class="ghost">curl anzeigen</button>
        <span id="opStatus" class="status"></span>
      </div>
      <div id="opAntwort"></div>
      ${this.#antwortenUebersicht(op)}`;

    this.wurzel.querySelector("#opSenden").onclick = () => this.#senden();
    this.wurzel.querySelector("#opCurl").onclick = () => this.#curlZeigen();

    const beispielWahl = this.wurzel.querySelector("#opBeispiel");
    if (beispielWahl) {
      beispielWahl.onchange = () => {
        const beispiel = op.beispiele.find((b) => b.name === beispielWahl.value);
        if (beispiel) {
          this.wurzel.querySelector("#opBody").value = JSON.stringify(beispiel.wert, null, 2);
        }
      };
    }
  }

  /** Ein Eingabefeld je beschriebenem Parameter. */
  #feldgruppe(titel, parameter, pflicht) {
    if (!parameter.length) return "";

    return `
      <fieldset>
        <legend>${titel}</legend>
        <div class="grid2">
          ${parameter.map((p) => {
            const schema = this.#aufloesen(p.schema) || {};
            const id = "p_" + p.in + "_" + p.name;
            const noetig = p.required || pflicht;
            return `
              <div class="field">
                <label for="${id}">${esc(p.name)}${noetig ? " *" : ""}</label>
                ${this.#eingabe(id, schema, p)}
                ${p.description ? `<div class="hint">${esc(p.description)}</div>` : ""}
              </div>`;
          }).join("")}
        </div>
      </fieldset>`;
  }

  /** Passendes Bedienelement zum beschriebenen Typ. */
  #eingabe(id, schema, parameter) {
    const typen = [].concat(schema.type || "string");
    const beispiel = (schema.examples && schema.examples[0]) ?? schema.default ?? "";

    if (schema.enum) {
      return `<select id="${id}" data-name="${esc(parameter.name)}" data-in="${parameter.in}">
        <option value=""></option>
        ${schema.enum.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join("")}
      </select>`;
    }

    if (typen.includes("boolean")) {
      return `<select id="${id}" data-name="${esc(parameter.name)}" data-in="${parameter.in}">
        <option value=""></option><option value="1">ja</option><option value="0">nein</option>
      </select>`;
    }

    const art = typen.includes("integer") || typen.includes("number") ? "number" : "text";

    return `<input id="${id}" type="${art}" data-name="${esc(parameter.name)}"
      data-in="${parameter.in}" value="${esc(beispiel)}"
      placeholder="${esc(schema.format || typen.join("|"))}">`;
  }

  /** Eingabefeld für den Rumpf, vorbelegt aus Beispiel oder Schema. */
  #bodyFeld(op) {
    if (!op.body) return "";

    const vorlage = op.beispiele[0]?.wert ?? this.#vorlageAusSchema(op.body);

    return `
      <fieldset>
        <legend>Rumpf (JSON)</legend>
        ${op.beispiele.length > 1 ? `
          <div class="field">
            <label for="opBeispiel">Beispiel übernehmen</label>
            <select id="opBeispiel">
              ${op.beispiele.map((b) => `<option value="${esc(b.name)}">${esc(b.titel)}</option>`).join("")}
            </select>
          </div>` : ""}
        <textarea id="opBody" rows="10" spellcheck="false">${esc(JSON.stringify(vorlage, null, 2))}</textarea>
        ${op.body.description ? `<div class="hint">${esc(op.body.description)}</div>` : ""}
      </fieldset>`;
  }

  /** Aus einem Schema ein ausfüllbares Gerüst bauen. */
  #vorlageAusSchema(schema) {
    schema = this.#aufloesen(schema);
    const out = {};

    for (const [name, feld] of Object.entries(schema.properties || {})) {
      const f = this.#aufloesen(feld);
      const pflicht = (schema.required || []).includes(name);
      if (!pflicht && Object.keys(out).length > 8) continue;

      out[name] = (f.examples && f.examples[0]) ?? f.default ??
        ([].concat(f.type || "string").includes("number") ||
         [].concat(f.type || "string").includes("integer") ? 0 : "");
    }

    return out;
  }

  /** Kurzübersicht der beschriebenen Antworten — was kann zurückkommen. */
  #antwortenUebersicht(op) {
    const zeilen = Object.entries(op.antworten).map(([code, a]) =>
      `<tr><th>${esc(code)}</th><td>${esc(this.#aufloesen(a)?.description || "")}</td></tr>`).join("");

    return zeilen ? `<h3 class="sub">Mögliche Antworten</h3><table>${zeilen}</table>` : "";
  }

  // ---- Aufruf ------------------------------------------------------------

  /** Eingaben einsammeln und daraus Pfad, Parameter und Rumpf bauen. */
  #anfrageBauen() {
    const op = this.aktuell;
    let pfad = op.pfad;
    const params = {};

    this.wurzel.querySelectorAll("[data-name]").forEach((feld) => {
      const wert = feld.value.trim();
      if (wert === "") return;

      if (feld.dataset.in === "path") {
        pfad = pfad.replace(`{${feld.dataset.name}}`, encodeURIComponent(wert));
      } else {
        params[feld.dataset.name] = wert;
      }
    });

    let body = null;
    const bodyFeld = this.wurzel.querySelector("#opBody");
    if (bodyFeld && bodyFeld.value.trim()) {
      body = JSON.parse(bodyFeld.value); // Fehler fängt der Aufrufer ab
    }

    const offen = pfad.match(/\{[^}]+\}/g);
    if (offen) {
      throw new Error("Es fehlen Angaben im Pfad: " + offen.join(", "));
    }

    return { pfad, params, body };
  }

  async #senden() {
    const status = this.wurzel.querySelector("#opStatus");
    const ziel = this.wurzel.querySelector("#opAntwort");

    let anfrage;
    try {
      anfrage = this.#anfrageBauen();
    } catch (fehler) {
      status.className = "status err";
      status.textContent = fehler instanceof SyntaxError
        ? "Der Rumpf ist kein gültiges JSON." : fehler.message;
      return;
    }

    status.className = "status";
    status.textContent = "läuft …";

    try {
      const antwort = await this.api.call(this.aktuell.methode, anfrage.pfad, anfrage);

      status.className = "status " + (antwort.status < 400 ? "ok" : "err");
      status.textContent = `HTTP ${antwort.status} · ${antwort.ms} ms`;

      this.verlauf.unshift({
        methode: this.aktuell.methode, pfad: anfrage.pfad,
        status: antwort.status, ms: antwort.ms, zeit: new Date(),
      });

      ziel.innerHTML = this.#antwortZeichnen(antwort);
    } catch (fehler) {
      status.className = "status err";
      status.textContent = fehler instanceof ApiError ? fehler.readable : String(fehler);
      ziel.innerHTML = "";
    }
  }

  #antwortZeichnen(antwort) {
    const kopfzeilen = ["etag", "content-type", "cache-control"]
      .filter((k) => antwort.headers[k])
      .map((k) => `<tr><th>${esc(k)}</th><td>${esc(antwort.headers[k])}</td></tr>`).join("");

    // SVG zeigen statt den Quelltext abdrucken
    if (antwort.contentType.includes("svg")) {
      return `<div class="bodygraph">${antwort.text}</div>
        ${kopfzeilen ? `<table>${kopfzeilen}</table>` : ""}`;
    }

    const inhalt = typeof antwort.body === "string"
      ? antwort.text
      : JSON.stringify(antwort.body, null, 2);

    return `
      ${kopfzeilen ? `<table>${kopfzeilen}</table>` : ""}
      <pre>${esc(inhalt)}</pre>`;
  }

  #curlZeigen() {
    const ziel = this.wurzel.querySelector("#opAntwort");

    try {
      const anfrage = this.#anfrageBauen();
      ziel.innerHTML = `<pre>${esc(this.api.curl(this.aktuell.methode, anfrage.pfad, anfrage))}</pre>
        <p class="hint">Das Token ist durch einen Platzhalter ersetzt.</p>`;
    } catch (fehler) {
      ziel.innerHTML = `<p class="err">${esc(fehler.message)}</p>`;
    }
  }
}
