/**
 * Die Chartansicht der Testoberflaeche.
 *
 * Sie bildet nach, was das Webinterface unter /chart?id= zeigt - Overview,
 * Typ und Profil, Aktivierung, Potenziale, Grafiken, Zeit, Varianten,
 * Gruppen - holt die Daten aber ausschliesslich ueber die REST API. Damit
 * ist sie zugleich die Probe aufs Exempel: was hier fehlt, fehlt der API.
 *
 * Kein fetch in dieser Datei (das macht js/api.js), kein Zustand ausserhalb
 * der Instanz.
 */
import { esc, fehlertext, htmlSaeubern } from "./ui.js";

/** Reiter in der Reihenfolge des Webinterfaces. */
const REITER = {
  overview: "Overview",
  typ: "Typ & Profil",
  aktivierung: "Aktivierung",
  texte: "Potenziale",
  grafiken: "Grafiken",
  zeit: "Zeit",
  varianten: "Varianten",
  gruppen: "Gruppen",
  verwaltung: "Verwaltung",
  json: "JSON",
};

/** Bezeichnungen der Lifescript-Felder, die die API neutral benennt. */
const FARBFELDER = {
  motivation: "Motivation", perspective: "Sichtweise",
  human_design: "Mensch", stress: "Stress",
};

const KNOTEN = {
  design_north: "Design ☊", design_south: "Design ☋",
  personality_north: "Persönlichkeit ☊", personality_south: "Persönlichkeit ☋",
};

/** Planeten in der Reihenfolge der Chartansicht. */
const PLANETEN = ["su", "ea", "nn", "sn", "mo", "me", "ve", "ma", "ju", "sa", "ur", "ne", "pl", "ki", "li"];

export class Chartansicht {
  /**
   * @param {object} umgebung {api, dict, wurzel, auswahl, oeffnen, nachLaden}
   */
  constructor(umgebung) {
    Object.assign(this, umgebung);
    this.chart = null;
    this.reiter = "overview";
    this.roh = null;
  }

  /** Chart laden und anzeigen. */
  async zeige(id, reiter = null) {
    try {
      this.chart = await this.api.getChart(id, { include: "contact" });
      this.roh = { data: this.chart };
      if (reiter) this.reiter = reiter;
      await this.dict.laden();
      this.render();
    } catch (error) {
      this.wurzel.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  /** Nur neu zeichnen, ohne neu zu laden. */
  render() {
    const c = this.chart;
    if (!c) return;

    this.wurzel.innerHTML = `
      <div class="chartkopf">
        <h2>${esc(c.first_name)} ${esc(c.last_name)} <span class="hint">#${c.id ?? "–"}</span></h2>
        <div class="kopfzeile">${esc(this.#kopfzeile())}</div>
      </div>
      <div class="tabs" role="tablist">
        ${Object.entries(REITER).map(([key, label]) =>
          `<button role="tab" data-tab="${key}" aria-selected="${key === this.reiter}">${label}</button>`
        ).join("")}
      </div>
      <div id="tabBody"></div>`;

    this.wurzel.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => { this.reiter = b.dataset.tab; this.render(); };
    });

    this.koerper = this.wurzel.querySelector("#tabBody");

    ({
      overview: () => this.#overview(),
      typ: () => this.#typUndProfil(),
      aktivierung: () => this.#aktivierung(),
      texte: () => this.#texte(),
      grafiken: () => this.#grafiken(),
      zeit: () => this.#zeit(),
      varianten: () => this.#varianten(),
      gruppen: () => this.#gruppen(),
      verwaltung: () => this.#verwaltung(),
      json: () => { this.koerper.innerHTML = `<pre>${esc(JSON.stringify(this.roh, null, 2))}</pre>`; },
    })[this.reiter]();
  }

  // ---- Overview ----------------------------------------------------------

  /**
   * Die Tabelle der Chartansicht: Geburtsdaten, Typ, Strategie, Autoritaet,
   * Profil, Definition, Kreuz, Kanaele, Variable, Chiron, Talentesequenz -
   * daneben der Bodygraph.
   */
  #overview() {
    const c = this.chart;
    const d = this.dict;
    const typ = c.type?.code;

    const zeilen = [
      ["Geburtsdaten", this.#geburtszeile()],
      ["Designdaten", c.birth?.design_datetime
        ? `${this.#zeit12(c.birth.design_datetime)} GMT` : "–"],
      ["Typ", d.text("type_extended", typ, 1) ? d.eintrag("types", typ)?.name : c.type?.long],
      ["Energiemodus", d.eintrag("types", typ)?.energy_mode],
      ["Kraftfeld", [d.eintrag("types", typ)?.force_field,
        d.text("type_extended", typ, 2)].filter(Boolean).join(" · Ziel/Schatten: ")],
      ["Strategie", d.text("type_extended", typ, 1)],
      ["Autorität", this.#autoritaet()],
      ["Profil", [c.profile, d.eintrag("profiles", c.profile)?.archetype].filter(Boolean).join(" – ")],
      ["Definition", `${c.definitions ?? "?"} · ${d.text("definitions", c.definitions, 1)}`],
      ["Kreuz", [c.incarnation_cross?.name,
        c.incarnation_cross?.gate ? `Tor ${c.incarnation_cross.gate}` : null,
        c.incarnation_cross?.angle].filter(Boolean).join(", ")],
      ["Rollen", (c.channels || []).map((k) => d.kanalrolle(k)).filter(Boolean).join(" · ")],
      ["Kanäle", (c.channels || []).map((k) => d.kanal(k)).join(", ") || "–"],
      ["Zentren", `${c.defined_centers ?? "?"} definiert: ` +
        (c.centers || []).filter((z) => z.defined).map((z) => z.number).join(", ")],
      ["Chironwunde", d.text("pkironsign", c.kiron_zodiac, 3) || "–"],
    ];

    this.koerper.innerHTML = `
      <div class="chartgrid">
        <div class="bodygraph" id="ovSvg"><p class="hint">Bodygraph wird geladen …</p></div>
        <div>
          <table class="daten">${zeilen.map(([k, v]) =>
            `<tr><th>${esc(k)}</th><td>${esc(v ?? "")}</td></tr>`).join("")}</table>

          <h3 class="sub">Variable ${esc(c.variable?.four || "")} · Typ ${esc(c.variable?.type ?? "")}</h3>
          <p class="hint">${esc([
            this.dict.text("variabletype", c.variable?.type, 2),
            this.dict.text("variabletype", c.variable?.type, 3),
            this.dict.text("variabletype", c.variable?.type, 4),
          ].filter(Boolean).join(" · "))}</p>
          <table class="daten">
            ${this.#variablenzeile("MC – Motivation", "motivation")}
            ${this.#variablenzeile("SC – Sichtweise", "perspective")}
            ${this.#variablenzeile("HC – Health", "health")}
            ${this.#variablenzeile("EC – Umgebung", "environment")}
            <tr><th>B – Base / BT – Body</th><td>${esc(c.variable?.base ?? "–")} / ${esc(c.variable?.body ?? "–")}</td></tr>
          </table>

          <h3 class="sub">Talentesequenz</h3>
          <table class="daten">${this.#perlenzeilen()}</table>
        </div>
      </div>`;

    this.#svgEinsetzen("ovSvg", () => this.api.graphicSvg(this.chart.id, "bodygraph"));
  }

  #variablenzeile(bezeichnung, feld) {
    const paar = this.chart.variable?.[feld];
    return `<tr><th>${esc(bezeichnung)}</th><td>${esc(this.dict.farbton(feld, paar) || "–")}</td></tr>`;
  }

  #perlenzeilen() {
    const namen = {
      talent: ["Talent", "pearltalent"],
      cooperation: ["Kooperation", "pearlcooperation"],
      charisma: ["Charisma", "pearlcharisma"],
      prosperity: ["Wohlstand", "pearlprosperty"],
    };

    return Object.entries(namen).map(([feld, [bezeichnung, texttyp]]) => {
      const perle = this.chart.pearls?.[feld] || {};
      const text = this.dict.text(texttyp, perle.line, 1);
      return `<tr><th>${esc(bezeichnung)}</th><td>` +
        `${esc(perle.gate ?? "–")}.${esc(perle.line ?? "–")} ${esc(text)}</td></tr>`;
    }).join("");
  }

  #autoritaet() {
    const code = this.chart.inner_authority;
    const eintrag = this.dict.eintrag("authorities", code);
    return eintrag ? `${code} · ${eintrag.name}` : (code ?? "–");
  }

  #geburtszeile() {
    const b = this.chart.birth || {};
    const teile = [b.datetime, `Zone ${b.timezone?.offset ?? "?"}`];
    if (b.timezone?.dst_offset) teile.push(`+${b.timezone.dst_offset} Sommerzeit`);
    if (b.location?.city) teile.push(b.location.city);
    if (b.location?.country) teile.push(b.location.country);
    return teile.filter(Boolean).join(" · ");
  }

  #kopfzeile() {
    const c = this.chart;
    return [c.type?.long, c.profile, `Autorität ${c.inner_authority ?? "?"}`,
      `${c.defined_centers ?? "?"} Zentren`, c.is_deleted ? "im Papierkorb" : null]
      .filter(Boolean).join(" · ");
  }

  // ---- Typ und Profil ----------------------------------------------------

  /** Die langen Texte zu Typ, Profil und Autoritaet. */
  #typUndProfil() {
    const c = this.chart;
    const typ = this.dict.eintrag("types", c.type?.code);
    const profil = this.dict.eintrag("profiles", c.profile);
    const autoritaet = this.dict.eintrag("authorities", c.inner_authority);

    const block = (titel, text) => text
      ? `<h3 class="sub">${esc(titel)}</h3><p>${esc(text)}</p>` : "";

    this.koerper.innerHTML = `
      <h3>${esc(typ?.name || c.type?.long || "")}</h3>
      ${block("Wesen", typ?.characteristic)}
      ${block("Stärken", typ?.strengths)}
      ${block("Schwächen", typ?.weaknesses)}
      ${block("Empfehlungen", typ?.recommendations)}
      <h3>Profil ${esc(c.profile || "")}${profil?.archetype ? " – " + esc(profil.archetype) : ""}</h3>
      ${block("Schlüsselwort", profil?.keyword)}
      ${block("Leitfaden", profil?.guide)}
      ${block("Kreuzwinkel", profil?.cross_angle)}
      <h3>Autorität</h3>
      ${block(autoritaet?.name || "", autoritaet?.description)}
      <p class="hint">Alle Texte kommen aus /reference/types, /reference/profiles und
        /reference/authorities in der gewählten Sprache.</p>`;
  }

  // ---- Aktivierung -------------------------------------------------------

  /** Planetenstaende und aktivierte Tore, wie die Aktivierungsansicht. */
  #aktivierung() {
    const c = this.chart;

    const tabelle = (titel, planeten) => `
      <h3 class="sub">${esc(titel)}</h3>
      <table class="daten planeten">
        <tr><th>Planet</th><th>Tor.Linie</th><th>Farbe</th><th>Ton</th><th>Base</th><th></th></tr>
        ${PLANETEN.filter((p) => planeten?.[p]).map((p) => {
          const w = planeten[p];
          return `<tr><th>${esc(p.toUpperCase())}</th>` +
            `<td>${w.gate}.${w.line}</td><td>${w.color}</td><td>${w.tone}</td>` +
            `<td>${w.base}</td><td>${w.retrograde ? "℞" : ""}</td></tr>`;
        }).join("")}
      </table>`;

    this.koerper.innerHTML = `
      <div class="grid2">
        ${tabelle("Persönlichkeit (bewusst)", c.planets?.personality)}
        ${tabelle("Design (unbewusst)", c.planets?.design)}
      </div>
      <h3 class="sub">Aktivierte Tore</h3>
      <div>${(c.gates || []).map((g) =>
        `<span class="chip" title="Wert ${g.value}">${g.gate}</span>`).join("") || "–"}</div>
      <h3 class="sub">Zentren</h3>
      <table class="daten">
        ${(c.centers || []).map((z) =>
          `<tr><th>${z.number}</th><td>${z.defined ? "definiert" : "offen"}</td></tr>`).join("")}
      </table>
      <h3 class="sub">Linien 1–6</h3>
      <div>${Object.entries(c.line_sums || {}).map(([linie, summe]) =>
        `<span class="chip">${esc(linie)}: ${esc(summe)}</span>`).join("")}</div>`;
  }

  // ---- Potenziale (Erklaertexte) ----------------------------------------

  async #texte() {
    this.koerper.innerHTML = `<p class="hint">Bereiche werden geladen …</p>`;

    try {
      const bereiche = await this.api.listSections(this.chart.id);
      const frei = bereiche.filter((b) => b.allowed).length;

      this.koerper.innerHTML = `
        <div class="bar">
          <select id="secSel">${bereiche.map((b) =>
            `<option value="${esc(b.section)}"${b.allowed ? "" : " disabled"}>` +
            `${esc(b.label)}${b.allowed ? "" : " (Abo fehlt)"}</option>`).join("")}</select>
          <button id="secLoad">Anzeigen</button>
          <label class="inline"><input type="checkbox" id="secHtml"> als HTML wie im Webinterface</label>
          <span class="hint">${frei} von ${bereiche.length} Bereichen freigegeben</span>
        </div>
        <div id="secBody" class="sec"></div>`;

      const laden = async () => {
        const feld = this.koerper.querySelector("#secBody");
        const mitHtml = this.koerper.querySelector("#secHtml").checked;
        feld.innerHTML = `<p class="hint">lädt …</p>`;

        try {
          const bereich = await this.api.getSection(
            this.chart.id,
            this.koerper.querySelector("#secSel").value,
            { includeHtml: mitHtml });
          this.roh = { data: bereich };

          // Zwei Darstellungen aus derselben Antwort: die zerlegten Blöcke
          // (so würde eine App den Text weiterverarbeiten) oder das gelieferte
          // HTML des Bausteins, wie es das Webinterface zeigt.
          const inhalt = mitHtml && bereich.html
            ? htmlSaeubern(bereich.html)
            : (bereich.content || []).map((b) => b.kind === "heading"
                ? `<h${Math.min(b.level || 3, 4)}>${esc(b.value)}</h${Math.min(b.level || 3, 4)}>`
                : `<p>${esc(b.value)}</p>`).join("");

          feld.innerHTML = inhalt +
            `<p class="hint">${mitHtml && bereich.html
              ? `HTML des Bausteins, ${bereich.html.length} Zeichen`
              : `${bereich.content.length} Blöcke, ${bereich.text.length} Zeichen`} · ` +
            `Sprache ${esc(bereich.language)}</p>`;
        } catch (error) {
          feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
        }
      };

      this.koerper.querySelector("#secLoad").onclick = laden;
      this.koerper.querySelector("#secSel").onchange = laden;
      this.koerper.querySelector("#secHtml").onchange = laden;
      await laden();
    } catch (error) {
      this.koerper.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  // ---- Grafiken ----------------------------------------------------------

  /** Alle Grafiken des Charts nebeneinander, jede fuer sich geladen. */
  async #grafiken() {
    this.koerper.innerHTML = `<p class="hint">Grafiken werden geladen …</p>`;

    try {
      const grafiken = await this.api.listGraphics(this.chart.id);

      // Der Transit gehoert nicht zur Liste des Endpunkts (er braucht einen
      // Zeitpunkt), ist hier aber die vierte Grafik des Charts.
      const alle = [...grafiken, {
        graphic: "transit",
        description: "Chart und Transit zum jetzigen Zeitpunkt",
        allowed: true,
      }];

      // Mandala und Spider zeigen viel Detail (Planetenstaende rundum, das
      // Netz mit seinen Achsen) - in Kachelgroesse ist davon nichts zu
      // erkennen, deshalb bekommen sie das Dreifache.
      const gross = ["mandala", "spider"];

      this.koerper.innerHTML = `
        <div class="grafiktafel">
          ${alle.map((g) => `
            <figure class="${gross.includes(g.graphic) ? "gross" : ""}">
              <figcaption><strong>${esc(g.graphic)}</strong><br>
                <span class="hint">${esc(g.description || "")}${
                  g.allowed ? "" : " – Abo fehlt"}</span></figcaption>
              <div class="bodygraph" id="g-${esc(g.graphic)}">${
                g.allowed ? "" : `<p class="hint">gesperrt</p>`}</div>
            </figure>`).join("")}
        </div>`;

      // Nebenlaeufig: eine langsame Grafik haelt die anderen nicht auf
      await Promise.all(alle.filter((g) => g.allowed).map((g) =>
        this.#svgEinsetzen(`g-${g.graphic}`, () => g.graphic === "transit"
          ? this.api.transitSvg(this.chart.id)
          : this.api.graphicSvg(this.chart.id, g.graphic))));
    } catch (error) {
      this.koerper.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  // ---- Zeit --------------------------------------------------------------

  #zeit() {
    const heute = new Date().toISOString().slice(0, 10);

    this.koerper.innerHTML = `
      <div class="bar">
        <label class="inline">Zeitpunkt <input type="date" id="ztDatum" value="${heute}"></label>
        <button id="ztNow">Transit</button>
        <button id="ztDays">12 Tage</button>
        <button id="ztLine">Zeitstrahl</button>
        <button id="ztReturns">Zyklen</button>
        <button id="ztLife">Lifescript</button>
        <button id="ztSaved" class="ghost">Gemerkte Zeitpunkte</button>
      </div>
      <div id="ztBody"><p class="hint">Eine Auswertung wählen.</p></div>`;

    const datum = () => {
      const wert = this.koerper.querySelector("#ztDatum").value;
      return wert ? `${wert}T12:00:00Z` : "";
    };

    const feld = () => this.koerper.querySelector("#ztBody");

    const laufen = async (arbeit) => {
      feld().innerHTML = `<p class="hint">wird gerechnet …</p>`;
      try {
        feld().innerHTML = await arbeit();
      } catch (error) {
        feld().innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
      }
    };

    this.koerper.querySelector("#ztNow").onclick = () => laufen(async () => {
      const t = await this.api.transit(this.chart.id, datum());
      this.roh = { data: t };
      return `
        <h3 class="sub">Transit zum ${esc(this.#zeit12(t.at))}</h3>
        <table class="daten">
          <tr><th>Zentren gemeinsam</th><td>${t.combined.defined_centers} definiert, ${t.combined.open_centers} offen</td></tr>
          <tr><th>Kanäle</th><td>${(t.combined.channels || []).map((k) => this.dict.kanal(k)).join(", ") || "–"}</td></tr>
          <tr><th>Gefährtentore / -kanäle</th><td>${t.combined.companion_gates} / ${t.combined.companion_channels}</td></tr>
          <tr><th>Ergänzungen</th><td>${t.combined.complements}</td></tr>
          <tr><th>Trigger</th><td>unterstützend ${t.triggers.supporting}, herausfordernd ${t.triggers.challenging}</td></tr>
        </table>
        <h3 class="sub">Transitplaneten</h3>
        <div>${Object.entries(t.transit_planets?.personality || {}).map(([p, w]) =>
          `<span class="chip">${esc(p.toUpperCase())} ${w.gate}.${w.line}</span>`).join("")}</div>`;
    });

    this.koerper.querySelector("#ztDays").onclick = () => laufen(async () => {
      const d = await this.api.transitDays(this.chart.id, { from: datum(), days: 12 });
      this.roh = { data: d };
      return `<table class="daten">
        <tr><th>Tag</th><th>Zentren</th><th>Kanäle</th><th>Trigger +/−</th></tr>
        ${d.items.map((tag) => `<tr>
          <th>${esc(this.#zeit12(tag.at, true))}</th>
          <td>${tag.combined.defined_centers}</td>
          <td>${(tag.combined.channels || []).join(", ")}</td>
          <td>${tag.triggers.supporting} / ${tag.triggers.challenging}</td></tr>`).join("")}
      </table>`;
    });

    this.koerper.querySelector("#ztLine").onclick = () => laufen(async () => {
      const d = await this.api.timeline(this.chart.id, { from: datum() });
      this.roh = { data: d };
      return `<p class="hint">${esc(this.#zeit12(d.from, true))} bis ${esc(this.#zeit12(d.to, true))}</p>` +
        Object.entries(d.transits || {}).map(([planet, liste]) => `
          <h3 class="sub">${esc(planet.toUpperCase())}</h3>
          <table class="daten"><tr><th>Tor.Linie</th><th>von</th><th>bis</th></tr>
          ${liste.slice(0, 40).map((e) => `<tr><th>${e.gate ?? ""}${e.line ? "." + e.line : ""}</th>` +
            `<td>${esc(this.#zeit12(e.from))}</td><td>${esc(this.#zeit12(e.to))}</td></tr>`).join("")}
          </table>`).join("");
    });

    this.koerper.querySelector("#ztReturns").onclick = () => laufen(async () => {
      const liste = await this.api.returns(this.chart.id);
      this.roh = { data: liste };
      return `<table class="daten">
        <tr><th>Zyklus</th><th>Zeitpunkt</th><th></th></tr>
        ${liste.map((z, i) => `<tr><th>${esc(z.label)}</th><td>${esc(this.#zeit12(z.at, true))}</td>` +
          `<td><button data-ret="${i}" class="ghost small">Chart</button></td></tr>`).join("")}
      </table><div id="retBody"></div>`;
    }).then?.(() => {});

    // Die Schaltflaechen der Zyklustabelle entstehen erst nach dem Rendern
    feld().addEventListener("click", async (ereignis) => {
      const knopf = ereignis.target.closest("[data-ret]");
      if (!knopf) return;

      const liste = this.roh?.data;
      const zyklus = Array.isArray(liste) ? liste[Number(knopf.dataset.ret)] : null;
      if (!zyklus) return;

      const ziel = this.koerper.querySelector("#retBody");
      ziel.innerHTML = `<p class="hint">wird gerechnet …</p>`;
      try {
        const chart = await this.api.returnChart(this.chart.id, zyklus.return, zyklus.number ?? "");
        ziel.innerHTML = `<table class="daten">
          <tr><th>Zeitpunkt</th><td>${esc(this.#zeit12(chart.at))}</td></tr>
          <tr><th>Typ / Profil</th><td>${esc(chart.type)} ${esc(chart.profile)}</td></tr>
          <tr><th>Kanäle</th><td>${(chart.channels || []).map((k) => this.dict.kanal(k)).join(", ")}</td></tr>
        </table>`;
      } catch (error) {
        ziel.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
      }
    });

    this.koerper.querySelector("#ztLife").onclick = () => laufen(async () => {
      const d = await this.api.lifescript(this.chart.id);
      this.roh = { data: d };
      return d.cycles.map((z) => `
        <h3 class="sub">${esc(z.label)} · ${esc(this.#zeit12(z.at, true))}</h3>
        <table class="daten">
          <tr><th>Kreuz</th><td>${esc(z.incarnation_cross.name || "")} (${esc(z.incarnation_cross.gates || "")})</td></tr>
          <tr><th>Profil</th><td>${esc(z.profile)}</td></tr>
          <tr><th>Farben</th><td>${Object.entries(z.colors).map(([name, w]) =>
            `${esc(FARBFELDER[name] || name)}: ${w.color}${esc(w.quadrant || "")}`).join(" · ")}</td></tr>
          <tr><th>Perlen</th><td>${z.pearl.join(" - ")}</td></tr>
          <tr><th>Knoten</th><td>${Object.entries(z.nodes).map(([name, w]) =>
            `${esc(KNOTEN[name] || name)} ${w.gate}.${w.line}`).join(" · ")}</td></tr>
        </table>`).join("");
    });

    this.koerper.querySelector("#ztSaved").onclick = () => laufen(async () => {
      const liste = await this.api.savedTransits({ chartId: this.chart.id });
      this.roh = { data: liste };
      return `
        <div class="bar">
          <input id="stName" placeholder="Name" style="flex:1">
          <button id="stSave">Zeitpunkt merken</button>
        </div>
        <table class="daten"><tr><th>Name</th><th>Zeitpunkt</th><th></th></tr>
        ${liste.map((t) => `<tr><th>${esc(t.name)}</th><td>${esc(this.#zeit12(t.at, true))}</td>` +
          `<td><button class="ghost small" data-del-transit="${t.id}">löschen</button></td></tr>`).join("")}
        </table>`;
    });

    feld().addEventListener("click", async (ereignis) => {
      const speichern = ereignis.target.closest("#stSave");
      const loeschen = ereignis.target.closest("[data-del-transit]");

      try {
        if (speichern) {
          const name = this.koerper.querySelector("#stName").value.trim() || "ohne Namen";
          await this.api.saveTransit({
            chart_id: this.chart.id, at: datum() || new Date().toISOString(), name });
          this.koerper.querySelector("#ztSaved").click();
        } else if (loeschen) {
          await this.api.deleteSavedTransit(loeschen.dataset.delTransit);
          this.koerper.querySelector("#ztSaved").click();
        }
      } catch (error) {
        feld().insertAdjacentHTML("afterbegin", `<p class="err">${esc(fehlertext(error))}</p>`);
      }
    });
  }

  // ---- Varianten ---------------------------------------------------------

  /** Vergleich (3) und Neun-Chart - was eine ungenaue Geburtszeit bedeutet. */
  #varianten() {
    this.koerper.innerHTML = `
      <div class="bar">
        <button id="vaDrei">Vergleich (3)</button>
        <button id="vaNeun">9 Charts</button>
        <label class="inline"><input type="checkbox" id="vaSvg" checked> mit Bodygraph</label>
      </div>
      <div id="vaBody"><p class="hint">Eine Ansicht wählen.</p></div>`;

    const laden = async (art) => {
      const feld = this.koerper.querySelector("#vaBody");
      feld.innerHTML = `<p class="hint">wird gerechnet …</p>`;

      try {
        const mitSvg = this.koerper.querySelector("#vaSvg").checked;
        const d = await this.api.timeVariants(this.chart.id, { variants: art, withSvg: mitSvg });
        this.roh = { data: d };

        const hinweis = d.items.length === 1
          ? `<p class="hint">Die Geburtszeit ist als genau angegeben – alle Varianten wären gleich.</p>`
          : `<p class="hint">Genauigkeit ± ${d.offset_minutes} Minuten · ` +
            `${d.items.length} Varianten · ` +
            (this.rohUnterschied(d) ? "Typ oder Profil unterscheiden sich" : "Typ und Profil bleiben gleich") +
            `</p>`;

        feld.innerHTML = hinweis + `<div class="varianten">` + d.items.map((v) => `
          <figure>
            ${mitSvg && v.svg ? `<div class="bodygraph klein">${v.svg}</div>` : ""}
            <figcaption>
              <strong>${v.offset_minutes > 0 ? "+" : ""}${v.offset_minutes} min</strong><br>
              ${esc((v.birth_datetime || "").slice(0, 16))}<br>
              ${esc(v.type || "")} ${esc(v.profile || "")} · Aut. ${esc(v.inner_authority ?? "–")}
            </figcaption>
          </figure>`).join("") + `</div>`;
      } catch (error) {
        feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
      }
    };

    this.koerper.querySelector("#vaDrei").onclick = () => laden("comparison");
    this.koerper.querySelector("#vaNeun").onclick = () => laden("nine");
  }

  /** Ob sich Typ oder Profil zwischen den Varianten unterscheiden. */
  rohUnterschied(daten) {
    const schluessel = daten.items.map((v) => `${v.type}|${v.profile}`);
    return new Set(schluessel).size > 1;
  }

  // ---- Gruppen -----------------------------------------------------------

  /** Interaktion, Penta und O16 aus der Merkliste der Chartliste. */
  #gruppen() {
    // Das geoeffnete Chart rechnet immer mit; steht es auch in der
    // Merkliste, zaehlt es trotzdem nur einmal.
    const beteiligt = [this.chart.id, ...[...this.auswahl].filter((id) => id !== this.chart.id)];

    this.koerper.innerHTML = `
      <p class="hint">Merkliste: in der Chartliste links auf „+“ klicken. Dieses Chart
        (#${this.chart.id}) wird immer mitgerechnet.</p>
      <div class="bar">
        <span id="grIds">${esc(beteiligt.join(", "))} <span class="hint">(${beteiligt.length})</span></span>
        <button id="grClear" class="ghost small">Merkliste leeren</button>
      </div>
      <div class="bar">
        <button id="grInter">Interaktion (2)</button>
        <button id="grPenta">Penta (3–5)</button>
        <button id="grO16">Organisation (3+)</button>
        <label class="inline"><input type="checkbox" id="grSvg" checked> mit Grafik</label>
      </div>
      <div id="grBody"></div>`;

    const feld = () => this.koerper.querySelector("#grBody");
    const alle = () => beteiligt;

    this.koerper.querySelector("#grClear").onclick = () => {
      this.auswahl.clear();
      this.nachLaden?.();
      this.render();
    };

    /**
     * Rechnen, Ergebnis einsetzen, danach die Grafiken nachladen. Die
     * Nacharbeit laeuft erst nach dem Einsetzen - vorher gibt es die
     * Zielelemente noch nicht.
     */
    const laufen = async (arbeit) => {
      feld().innerHTML = `<p class="hint">wird gerechnet …</p>`;
      try {
        const { html, danach } = await arbeit();
        feld().innerHTML = html;
        await danach?.();
      } catch (error) {
        feld().innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
      }
    };

    this.koerper.querySelector("#grInter").onclick = () => laufen(async () => {
      const [a, b] = alle();
      if (!b) return { html: `<p class="err">Für eine Interaktion wird ein zweites Chart gebraucht.</p>` };

      const d = await this.api.interaction(a, b);
      this.roh = { data: d };

      const mitGrafik = this.koerper.querySelector("#grSvg").checked;
      const grafik = mitGrafik ? `<div class="bodygraph" id="grSvgBox"></div>` : "";

      return { danach: mitGrafik
        ? () => this.#svgEinsetzen("grSvgBox", () => this.api.interactionSvg(a, b))
        : null, html: `
        <h3 class="sub">${esc(d.charts.map((c) => `${c.first_name} ${c.last_name}`).join(" + "))}</h3>
        <table class="daten">
          <tr><th>Komposit-Zentren</th><td>${d.composite.defined_centers} definiert, ${d.composite.open_centers} offen</td></tr>
          <tr><th>Kanäle</th><td>${(d.composite.channels || []).map((k) => this.dict.kanal(k)).join(", ")}</td></tr>
          <tr><th>Gefährtentore / -kanäle</th><td>${d.connection.companion_gates} / ${d.connection.companion_channels}</td></tr>
          <tr><th>Ergänzungen</th><td>${d.connection.complements}</td></tr>
          <tr><th>Dominanz</th><td>${d.connection.dominance.chart1} : ${d.connection.dominance.chart2}</td></tr>
          <tr><th>Trigger Chart 1</th><td>+${d.triggers.chart1.supporting} / −${d.triggers.chart1.challenging}</td></tr>
          <tr><th>Trigger Chart 2</th><td>+${d.triggers.chart2.supporting} / −${d.triggers.chart2.challenging}</td></tr>
        </table>${grafik}` };
    });

    this.koerper.querySelector("#grPenta").onclick = () => laufen(async () => {
      const liste = alle();
      if (liste.length < 3) return { html: `<p class="err">Ein Penta braucht drei bis fünf Charts.</p>` };

      const d = await this.api.penta(liste.slice(0, 5));
      this.roh = { data: d };

      const mitGrafik = this.koerper.querySelector("#grSvg").checked;
      const grafik = mitGrafik ? `<div class="bodygraph" id="grSvgBox"></div>` : "";

      return { danach: mitGrafik
        ? () => this.#svgEinsetzen("grSvgBox", () => this.api.pentaSvg(liste.slice(0, 5)))
        : null, html: `
        <h3 class="sub">${esc(d.charts.map((c) => c.last_name).join(", "))}</h3>
        <table class="daten">
          <tr><th>Teamklima</th><td>${esc(d.team_climate.index ?? "–")} (+${d.team_climate.supporting} / −${d.team_climate.challenging})</td></tr>
          <tr><th>Fehlende Pentatore</th><td>${d.penta_gates.missing_count}: ${(d.penta_gates.missing || []).join(", ")}</td></tr>
          <tr><th>Powerbase</th><td>${esc(d.powerbase.strongest ?? "–")} · ${esc(this.#werteliste(d.powerbase.values))}</td></tr>
          <tr><th>Linien</th><td>${esc(this.#werteliste(d.lines))}</td></tr>
        </table>${grafik}` };
    });

    this.koerper.querySelector("#grO16").onclick = () => laufen(async () => {
      const liste = alle();
      if (liste.length < 3) return { html: `<p class="err">Das Organisationsmodell braucht mindestens drei Charts.</p>` };

      const d = await this.api.organisation(liste);
      this.roh = { data: d };

      const arten = {
        types: "Typenverteilung",
        centers: "Zentren",
        specials: "Besonderheiten",
        powerbase: "Powerbase",
      };

      const mitGrafik = this.koerper.querySelector("#grSvg").checked;
      const grafiken = mitGrafik
        ? Object.entries(arten).map(([g, bezeichnung]) => `
            <figure>
              <figcaption><strong>${esc(bezeichnung)}</strong></figcaption>
              <div class="bodygraph" id="o16-${g}"></div>
            </figure>`).join("")
        : "";

      return { danach: mitGrafik
        ? () => Promise.all(Object.keys(arten).map((g) =>
            this.#svgEinsetzen(`o16-${g}`, () => this.api.organisationSvg(liste, g))))
        : null, html: `
        <h3 class="sub">${liste.length} Charts</h3>
        <table class="daten">
          <tr><th>Typen (Abweichung von der Norm)</th><td>${esc(this.#werteliste(d.types))}</td></tr>
          <tr><th>Powerbase</th><td>${esc(d.powerbase.strongest ?? "–")} · ${esc(this.#werteliste(d.powerbase.values))}</td></tr>
          <tr><th>Fehlende Tore</th><td>${(d.missing_gates || []).join(", ") || "–"}</td></tr>
          <tr><th>Linien</th><td>Durchschnitt ${esc(this.#werteliste(d.lines.average))}</td></tr>
        </table>
        <div class="grafiktafel">${grafiken}</div>` };
    });
  }

  // ---- Verwaltung --------------------------------------------------------

  /** Labels, Freigaben, Firmenangaben und die Schaltflaechen am Chart. */
  async #verwaltung() {
    const c = this.chart;

    this.koerper.innerHTML = `
      <div class="bar">
        <button id="vwDup" class="ghost">Duplizieren</button>
        ${c.is_deleted
          ? `<button id="vwRestore" class="ghost">Wiederherstellen</button>`
          : `<button id="vwDel" class="ghost">In den Papierkorb</button>`}
        <span class="hint">${c.can?.edit ? "bearbeitbar" : "nur lesbar"}</span>
      </div>

      <h3 class="sub">Stammdaten</h3>
      <form id="vwForm" class="grid2">
        <div class="field"><label for="vwFirst">Vorname</label><input id="vwFirst" value="${esc(c.first_name || "")}"></div>
        <div class="field"><label for="vwLast">Nachname</label><input id="vwLast" value="${esc(c.last_name || "")}"></div>
        <div class="field"><label for="vwDate">Geburtsdatum</label><input id="vwDate" type="date" value="${esc((c.birth?.datetime || "").slice(0, 10))}"></div>
        <div class="field"><label for="vwTime">Uhrzeit</label><input id="vwTime" type="time" value="${esc((c.birth?.datetime || "").slice(11, 16))}"></div>
        <div class="field"><label for="vwCity">Ort</label><input id="vwCity" value="${esc(c.birth?.location?.city || "")}"></div>
        <div class="field"><label for="vwAcc">Zeitgenauigkeit</label><input id="vwAcc" type="number" min="0" max="6" value="${esc(c.birth?.time_accuracy ?? 0)}"></div>
        <div><button id="vwSave">Speichern</button></div>
      </form>

      <h3 class="sub">Labels</h3>
      <div id="vwTags"><p class="hint">lädt …</p></div>

      <h3 class="sub">Freigaben</h3>
      <div id="vwShares"><p class="hint">lädt …</p></div>

      <h3 class="sub">Firma und Freitexte</h3>
      <div id="vwCompany"><p class="hint">lädt …</p></div>`;

    this.#verwaltungVerdrahten();
    await Promise.all([this.#tagsLaden(), this.#freigabenLaden(), this.#firmaLaden()]);
  }

  #verwaltungVerdrahten() {
    const melden = (error) => this.koerper.insertAdjacentHTML("afterbegin",
      `<p class="err">${esc(fehlertext(error))}</p>`);

    this.koerper.querySelector("#vwForm").onsubmit = async (ereignis) => {
      ereignis.preventDefault();
      try {
        await this.api.updateChart(this.chart.id, {
          first_name: this.koerper.querySelector("#vwFirst").value.trim(),
          last_name: this.koerper.querySelector("#vwLast").value.trim(),
          birthdate: this.koerper.querySelector("#vwDate").value,
          birthtime: this.koerper.querySelector("#vwTime").value,
          city: this.koerper.querySelector("#vwCity").value.trim() || null,
          time_accuracy: Number(this.koerper.querySelector("#vwAcc").value),
        });
        this.nachLaden?.();
        await this.zeige(this.chart.id, "verwaltung");
      } catch (error) { melden(error); }
    };

    const knopf = (id, arbeit) => {
      const el = this.koerper.querySelector(id);
      if (el) el.onclick = async () => {
        try { await arbeit(); } catch (error) { melden(error); }
      };
    };

    knopf("#vwDup", async () => {
      const kopie = await this.api.duplicateChart(this.chart.id);
      this.nachLaden?.();
      this.oeffnen(kopie.id);
    });

    knopf("#vwDel", async () => {
      await this.api.deleteChart(this.chart.id);
      this.nachLaden?.();
      await this.zeige(this.chart.id, "verwaltung");
    });

    knopf("#vwRestore", async () => {
      await this.api.restoreChart(this.chart.id);
      this.nachLaden?.();
      await this.zeige(this.chart.id, "verwaltung");
    });
  }

  async #tagsLaden() {
    const feld = this.koerper.querySelector("#vwTags");
    try {
      const tags = await this.api.tags(this.chart.id);
      feld.innerHTML = `
        <div>${tags.map((t) =>
          `<span class="chip">${esc(t.tag)} <button class="linkknopf" data-tag="${esc(t.tag)}">×</button></span>`
        ).join("") || "<span class='hint'>keine Labels</span>"}</div>
        <div class="bar"><input id="vwTagNeu" placeholder="neues Label"><button id="vwTagAdd">Hinzufügen</button></div>`;

      feld.querySelector("#vwTagAdd").onclick = async () => {
        const wert = feld.querySelector("#vwTagNeu").value.trim();
        if (!wert) return;
        try { await this.api.addTags(this.chart.id, [wert]); await this.#tagsLaden(); }
        catch (error) { feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`; }
      };

      feld.querySelectorAll("[data-tag]").forEach((b) => {
        b.onclick = async () => {
          try { await this.api.removeTag(this.chart.id, b.dataset.tag); await this.#tagsLaden(); }
          catch (error) { feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`; }
        };
      });
    } catch (error) {
      feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  async #freigabenLaden() {
    const feld = this.koerper.querySelector("#vwShares");
    try {
      const freigaben = await this.api.shares(this.chart.id);
      feld.innerHTML = `
        <table class="daten"><tr><th>Konto</th><th>Rechte</th><th></th></tr>
        ${freigaben.map((f) => `<tr>
          <th>${esc(f.orphaned
            ? `Konto #${f.user_id ?? f.role_id} (gelöscht)`
            : (f.name || f.user_id || f.role_id || "?"))}</th>
          <td>${f.may_edit ? "lesen und bearbeiten" : "lesen"}${f.is_owner ? " (Eigentum)" : ""}</td>
          <td>${f.user_id ? `<button class="ghost small" data-share="${f.user_id}">entfernen</button>` : ""}</td>
        </tr>`).join("") || `<tr><td colspan="3" class="hint">keine Freigaben</td></tr>`}
        </table>
        <div class="bar">
          <input id="vwShareId" type="number" placeholder="Konto-id">
          <label class="inline"><input type="checkbox" id="vwShareEdit"> darf bearbeiten</label>
          <button id="vwShareAdd">Freigeben</button>
        </div>`;

      feld.querySelector("#vwShareAdd").onclick = async () => {
        try {
          await this.api.addShare(this.chart.id,
            feld.querySelector("#vwShareId").value,
            feld.querySelector("#vwShareEdit").checked);
          await this.#freigabenLaden();
        } catch (error) { feld.insertAdjacentHTML("afterbegin", `<p class="err">${esc(fehlertext(error))}</p>`); }
      };

      feld.querySelectorAll("[data-share]").forEach((b) => {
        b.onclick = async () => {
          try { await this.api.removeShare(this.chart.id, b.dataset.share); await this.#freigabenLaden(); }
          catch (error) { feld.insertAdjacentHTML("afterbegin", `<p class="err">${esc(fehlertext(error))}</p>`); }
        };
      });
    } catch (error) {
      feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  async #firmaLaden() {
    const feld = this.koerper.querySelector("#vwCompany");
    try {
      const firma = await this.api.company(this.chart.id, { include: "contact" });

      const eingabe = (id, label, wert) =>
        `<div class="field"><label for="${id}">${esc(label)}</label>` +
        `<input id="${id}" value="${esc(wert ?? "")}"></div>`;

      const text = (id, label, wert) =>
        `<div class="field"><label for="${id}">${esc(label)}</label>` +
        `<textarea id="${id}" rows="3">${esc(wert ?? "")}</textarea></div>`;

      feld.innerHTML = `
        <form id="vwCoForm">
          <div class="grid2">
            ${eingabe("coOrg", "Organisation", firma.organisation)}
            ${eingabe("coUnit", "Bereich", firma.organisation_unit)}
            ${eingabe("coDep", "Abteilung", firma.department)}
            ${eingabe("coTeam", "Team", firma.team)}
            ${eingabe("coFunc", "Funktion", firma.function)}
            ${eingabe("coUrl", "Website", firma.url)}
          </div>
          ${firma.may_edit_texts ? `
            ${text("coInfo", "Information", firma.texts?.information)}
            ${text("coCoach", "Coaching-Notizen", firma.texts?.coaching_comments)}
            ${text("coSum", "Kurzprofil", firma.texts?.executive_summary)}`
          : `<p class="hint">Die Freitexte sind für dieses Konto nicht freigegeben.</p>`}
          <button id="coSave">Speichern</button>
        </form>`;

      feld.querySelector("#vwCoForm").onsubmit = async (ereignis) => {
        ereignis.preventDefault();
        const nutzlast = {
          organisation: feld.querySelector("#coOrg").value.trim() || null,
          organisation_unit: feld.querySelector("#coUnit").value.trim() || null,
          department: feld.querySelector("#coDep").value.trim() || null,
          team: feld.querySelector("#coTeam").value.trim() || null,
          function: feld.querySelector("#coFunc").value.trim() || null,
          url: feld.querySelector("#coUrl").value.trim() || null,
        };

        if (firma.may_edit_texts) {
          nutzlast.information = feld.querySelector("#coInfo").value.trim() || null;
          nutzlast.coaching_comments = feld.querySelector("#coCoach").value.trim() || null;
          nutzlast.executive_summary = feld.querySelector("#coSum").value.trim() || null;
        }

        try { await this.api.updateCompany(this.chart.id, nutzlast); await this.#firmaLaden(); }
        catch (error) { feld.insertAdjacentHTML("afterbegin", `<p class="err">${esc(fehlertext(error))}</p>`); }
      };
    } catch (error) {
      feld.innerHTML = `<p class="err">${esc(fehlertext(error))}</p>`;
    }
  }

  // ---- intern ------------------------------------------------------------

  /** SVG in ein Element setzen; die Grafiken kommen als Text, nicht als Bild. */
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

  /** Zahlenreihen der Gruppenmodelle lesbar: "O 18,5 · W 2,0 · R 32,5". */
  #werteliste(werte) {
    if (!werte || typeof werte !== "object") return String(werte ?? "–");

    return Object.entries(werte)
      .map(([name, wert]) => `${name} ${typeof wert === "number" ? wert.toFixed(1) : wert}`)
      .join(" · ");
  }

  /** Zeitangabe kurz: Datum und Uhrzeit, ohne Zeitzonenballast. */
  #zeit12(wert, nurDatum = false) {
    if (!wert) return "–";
    const text = String(wert).replace("T", " ");
    return nurDatum ? text.slice(0, 10) : text.slice(0, 16);
  }
}
