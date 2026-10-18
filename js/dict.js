/**
 * Nachschlagewerk fuer die Testoberflaeche.
 *
 * Ein Chart liefert Zahlen: Typ "S", Autoritaet 4, Farbe 6, Kanal 35. Die
 * Namen dazu stehen in den Referenzdaten und im Textbestand der API. Diese
 * Datei holt beides einmal je Sprache und haelt es im Speicher - sonst
 * braeuchte eine einzige Chartansicht ein Dutzend Abfragen.
 *
 * Absichtlich kein localStorage: die Texte haengen am Konto (Abostufe) und
 * an der Sprache, und sie aendern sich im Testbetrieb durchaus.
 */

/** Texttypen, die die Chartansicht braucht - alle klein genug fuer einen Aufruf. */
const TEXTTYPEN = [
  "type_extended", "definitions", "variabletype", "pkironsign",
  "motivationcolor", "motivationtone", "perspectivecolor", "perspectivetone",
  "healthcolor", "healthtone", "environmentcolor", "environmenttone",
  "pearltalent", "pearlcooperation", "pearlcharisma", "pearlprosperty",
];

/** Referenzsammlungen mit ihrem Schluesselfeld. */
const SAMMLUNGEN = {
  types: "code",
  profiles: "profile",
  authorities: "code",
  channels: "number",
  centers: "number",
  gates: "number",
  planets: "code",
};

export class Dict {
  constructor(api) {
    this.api = api;
    this.sprache = null;
    this.texte = new Map();      // "typ" => Map(stichwort => Eintrag)
    this.sammlungen = new Map(); // "channels" => Map(schluessel => Eintrag)
  }

  /**
   * Laedt alles, was die Chartansicht braucht - einmal je Sprache.
   *
   * Zwei Aufrufe, nicht dreiundzwanzig: die API liefert mehrere Texttypen
   * (`/reference/texts?types=`) und mehrere Sammlungen
   * (`/reference?include=values`) jeweils in einer Antwort. Einzeln
   * abgefragt lief schon ein zweiter Seitenaufbau in die Ratenbegrenzung.
   *
   * Das Ergebnis liegt zusaetzlich im Browser (`localStorage`), je Adresse
   * und Sprache, einen Tag lang - ein Neuladen der Seite kostet dann gar
   * keinen Aufruf mehr. Ohne Zwischenspeicher (privates Fenster) geht es
   * ebenso, nur eben mit den zwei Aufrufen.
   */
  async laden() {
    if (this.sprache === this.api.lang) return;

    this.texte.clear();
    this.sammlungen.clear();

    const gespeichert = this.#ausSpeicher();

    if (gespeichert) {
      this.#uebernehmen(gespeichert);
      this.sprache = this.api.lang;
      return;
    }

    const [texte, sammlungen] = await Promise.all([
      this.api.dictionaries(TEXTTYPEN).catch(() => ({})),
      this.api.references(Object.keys(SAMMLUNGEN)).catch(() => ({})),
    ]);

    this.#uebernehmen({ texte, sammlungen });
    this.#inSpeicher({ texte, sammlungen });
    this.sprache = this.api.lang;
  }

  /** Antwort der API in die Nachschlagetabellen uebernehmen. */
  #uebernehmen({ texte, sammlungen }) {
    for (const [typ, eintraege] of Object.entries(texte || {})) {
      this.texte.set(typ, new Map(
        (eintraege || []).map((e) => [String(e.keyword).toLowerCase(), e])
      ));
    }

    for (const [name, eintraege] of Object.entries(sammlungen || {})) {
      const schluessel = SAMMLUNGEN[name];
      this.sammlungen.set(name, new Map(
        (eintraege || []).map((e) => [String(e[schluessel]).toLowerCase(), e])
      ));
    }
  }

  #schluessel() {
    return `apitest.dict.${this.api.baseUrl}.${this.api.lang}`;
  }

  #ausSpeicher() {
    try {
      const roh = localStorage.getItem(this.#schluessel());
      if (!roh) return null;

      const daten = JSON.parse(roh);

      // Einen Tag: die Texte aendern sich selten, aber sie aendern sich.
      if (Date.now() - daten.zeit > 24 * 60 * 60 * 1000) return null;

      return daten;
    } catch {
      return null;
    }
  }

  #inSpeicher(daten) {
    try {
      localStorage.setItem(this.#schluessel(), JSON.stringify({ ...daten, zeit: Date.now() }));
    } catch { /* voll oder privates Fenster - dann eben jedes Mal holen */ }
  }

  /** Verwirft den Zwischenspeicher, etwa nach einer Textaenderung. */
  vergessen() {
    try {
      for (const schluessel of Object.keys(localStorage)) {
        if (schluessel.startsWith("apitest.dict.")) localStorage.removeItem(schluessel);
      }
    } catch { /* egal */ }

    this.sprache = null;
  }

  /**
   * Ein Textfeld aus dem Woerterbuch.
   * @param {string} typ      z.B. "motivationcolor"
   * @param {string|number} stichwort
   * @param {string|number} feld  Name des Slots ("name") oder Slotnummer
   */
  text(typ, stichwort, feld = 1) {
    const eintrag = this.texte.get(typ)?.get(String(stichwort ?? "").toLowerCase());
    if (!eintrag) return "";

    if (typeof feld === "string" && eintrag[feld]) return eintrag[feld];

    const slot = (eintrag.texts || []).find((t) =>
      typeof feld === "number" ? t.slot === feld : t.name === feld);

    return slot?.value || "";
  }

  /** Ein Eintrag einer Referenzsammlung, z.B. kanal(35) oder typ("S"). */
  eintrag(sammlung, schluessel) {
    return this.sammlungen.get(sammlung)?.get(String(schluessel ?? "").toLowerCase()) || null;
  }

  /** Name eines Kanals, z.B. "35 Wandel". */
  kanal(nummer) {
    const k = this.eintrag("channels", nummer);
    return k ? `${nummer} ${k.name || ""}`.trim() : String(nummer);
  }

  /** Die Rolle eines Kanals ("PRESENTER"). */
  kanalrolle(nummer) {
    return this.eintrag("channels", nummer)?.role || "";
  }

  /** Farbe und Ton als lesbare Zeile: "6 Nachahmung · 3 - …". */
  farbton(bereich, paar) {
    if (!paar) return "";
    const farbe = this.text(`${bereich}color`, paar.color, 1);
    const ton = this.text(`${bereich}tone`, paar.tone, 1);
    const teile = [];
    if (paar.color) teile.push(`${paar.color} ${farbe}`.trim());
    if (paar.tone) teile.push(`${paar.tone} ${ton}`.trim());
    return teile.join(" · ");
  }
}
