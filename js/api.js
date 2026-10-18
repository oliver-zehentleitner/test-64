/**
 * Client fuer die 64keys REST API (/api/v1).
 *
 * Bewusst ohne Abhaengigkeiten und ohne Build-Schritt: die Datei laeuft so,
 * wie sie im Repository liegt. Sie ist die einzige Stelle, die HTTP spricht -
 * Oberflaechen benutzen nur die Methoden hier.
 *
 * Verwendung:
 *   import { Api, ApiError } from "./api.js";
 *   const api = Api.fromStorage();
 *   const me = await api.me();
 *
 * Der vollstaendige Vertrag steht in docs/api/openapi.yaml.
 */

/** Fehler einer API-Antwort. Enthaelt Status, Fehlercode und Feldfehler. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = null, body = null, url = null, cause = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
    this.url = url;      // welche Adresse aufgerufen wurde
    this.cause = cause;  // Originalmeldung des Browsers, wenn die Anfrage gar nicht ankam
  }

  /** Feldfehler einer Validierung (HTTP 422) als {feld: "text"}. */
  get fieldErrors() {
    const errors = this.body?.errors;
    if (!errors) return {};
    return Object.fromEntries(
      Object.entries(errors).map(([field, messages]) => [field, messages.join(" ")])
    );
  }

  /** Verstaendlicher Satz fuer die Anzeige. */
  get readable() {
    switch (this.status) {
      case 0:
        return `API nicht erreichbar: ${this.url || "?"}` +
               (this.cause ? ` – ${this.cause}` : "") +
               " · Läuft der Server? Stimmen Adresse und Port? Sonst Konsole (F12) prüfen, dort steht ob CORS blockiert.";
      case 401: return "Token fehlt, ist ungültig oder abgelaufen (401)";
      case 403: return `Zugriff verweigert: ${this.message} (403)`;
      case 404: return `Nicht gefunden: ${this.message} (404)`;
      case 422: {
        const felder = Object.entries(this.fieldErrors)
          .map(([f, m]) => `${f}: ${m}`).join(" · ");
        return `Eingaben unvollständig (422)${felder ? " – " + felder : ""}`;
      }
      case 502: return `${this.message} (502)`;
      default:  return `${this.message} (${this.status || "Fehler"})`;
    }
  }
}

const STORAGE_KEYS = {
  baseUrl: "apitest.base",
  token: "apitest.token",
  lang: "apitest.lang",
};

/**
 * Vorgabe, solange nichts gespeichert ist.
 *
 * Diese Oberflaeche gehoert nicht zur Anwendung und wird nicht von ihr
 * ausgeliefert - die eigene Herkunft (file:// oder GitLab Pages) taugt
 * deshalb nicht als Vorgabe. Der Port muss zu "php artisan serve" passen.
 */
const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api/v1";

export class Api {
  /**
   * @param {object} options
   * @param {string} options.baseUrl  z.B. https://64keys.team/api/v1
   * @param {string} options.token    persoenliches Zugriffstoken
   * @param {string} options.lang     de | en | es
   */
  constructor({ baseUrl, token = "", lang = "de" } = {}) {
    this.baseUrl = (baseUrl || "").replace(/\/+$/, "");
    this.token = (token || "").trim();
    this.lang = lang;
  }

  /** Liest die zuletzt verwendeten Werte aus dem Browser. */
  static fromStorage() {
    const read = (key, fallback) => {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    };
    return new Api({
      baseUrl: read(STORAGE_KEYS.baseUrl, DEFAULT_BASE_URL),
      token: read(STORAGE_KEYS.token, ""),
      lang: read(STORAGE_KEYS.lang, "de"),
    });
  }

  /** Merkt Adresse, Token und Sprache im Browser (nur dort, nie serverseitig). */
  save() {
    try {
      localStorage.setItem(STORAGE_KEYS.baseUrl, this.baseUrl);
      localStorage.setItem(STORAGE_KEYS.token, this.token);
      localStorage.setItem(STORAGE_KEYS.lang, this.lang);
    } catch { /* privates Fenster o.ae. - nicht schlimm */ }
  }

  /**
   * Prueft das Token auf Zeichen, die in einem HTTP-Header nicht vorkommen
   * duerfen. Haeufigster Fall: aus einer maskierten Anzeige kopiert, dann
   * stecken Aufzaehlungszeichen darin. Der Browser verweigert den Header
   * dann mit einer schwer verstaendlichen Meldung.
   *
   * @returns {string|null} Fehlertext oder null, wenn das Token brauchbar ist
   */
  tokenProblem() {
    if (!this.token) return "Kein Token eingetragen.";
    const index = [...this.token].findIndex((ch) => ch.charCodeAt(0) > 126 || ch.charCodeAt(0) < 33);
    if (index >= 0) {
      const zeichen = this.token[index];
      return `Das Token enthält an Position ${index + 1} ein ungültiges Zeichen ` +
             `("${zeichen}"). Vermutlich wurde es aus einer maskierten Anzeige kopiert – ` +
             `bitte im Original markieren und erneut einfügen.`;
    }
    return null;
  }

  /** Entfernt das Token aus dem Browser. */
  forgetToken() {
    this.token = "";
    try { localStorage.removeItem(STORAGE_KEYS.token); } catch { /* egal */ }
  }

  // ---- Endpunkte ---------------------------------------------------------

  /** Angemeldeter Benutzer samt Rollen. */
  me() {
    return this.#json("/me");
  }

  /** Was dieses Konto darf: Bereiche, Funktionen, Sprachen. */
  async capabilities() {
    return (await this.#json("/meta/capabilities")).data;
  }

  /** Verbleibende Anfragen im laufenden Zeitfenster. */
  async limits() {
    return (await this.#json("/meta/limits")).data;
  }

  /**
   * Charts suchen. Nimmt dieselben Filter wie die Suche des Webinterfaces;
   * leere Werte laesst #url weg.
   * @returns {Promise<{data: object[], meta: object, links: object}>}
   */
  listCharts(filter = {}) {
    return this.#json("/charts", { params: { per_page: 25, ...filter } });
  }

  /** Ein Chart mit allen berechneten Werten. */
  async getChart(id, { include = "" } = {}) {
    return (await this.#json(`/charts/${id}`, { params: { include } })).data;
  }

  /** Das eigene Chart des Kontos. */
  async myChart() {
    return (await this.#json("/charts/me")).data;
  }

  /**
   * Legt ein Chart an und berechnet es.
   * Der Geburtsort geht entweder ueber latitude/longitude (Zeitzone kommt
   * dann von Google) oder ueber timezone_offset/dst_offset.
   */
  async createChart(payload) {
    return (await this.#json("/charts", { method: "POST", body: payload })).data;
  }

  /** Aendert einzelne Felder; nur was mitgeschickt wird, wird geaendert. */
  async updateChart(id, payload) {
    return (await this.#json(`/charts/${id}`, { method: "PATCH", body: payload })).data;
  }

  async duplicateChart(id) {
    return (await this.#json(`/charts/${id}/duplicate`, { method: "POST" })).data;
  }

  async deleteChart(id) {
    return (await this.#json(`/charts/${id}`, { method: "DELETE" })).data;
  }

  async restoreChart(id) {
    return (await this.#json(`/charts/${id}/restore`, { method: "POST" })).data;
  }

  /** Rechnen ohne zu speichern (Quickview). */
  async calculateChart(payload) {
    return (await this.#json("/charts/calculate", { method: "POST", body: payload })).data;
  }

  // ---- Erklaertexte und Grafiken ----------------------------------------

  /** Welche Erklaerbereiche es gibt und welche das Abo freigibt. */
  async listSections(id) {
    return (await this.#json(`/charts/${id}/sections`)).data;
  }

  /** Ein Erklaerbereich als geordnete Bloecke plus Fliesstext. */
  async getSection(id, section, { includeHtml = false } = {}) {
    const params = includeHtml ? { include_html: 1 } : {};
    return (await this.#json(`/charts/${id}/sections/${section}`, { params })).data;
  }

  /** Welche Grafiken es zu einem Chart gibt. */
  async listGraphics(id) {
    return (await this.#json(`/charts/${id}/graphics`)).data;
  }

  /**
   * SVG als Quelltext. Kein <img src> moeglich, weil die Adresse den
   * Authorization-Header verlangt.
   */
  async graphicSvg(id, art = "bodygraph") {
    const pfad = art === "bodygraph"
      ? `/charts/${id}/bodygraph.svg`
      : `/charts/${id}/graphics/${art}.svg`;
    return (await this.#request(pfad)).text();
  }

  /** Chart und Transit in einer Grafik. */
  async transitSvg(id, at = "") {
    return (await this.#request(`/charts/${id}/transit.svg`, { params: { at } })).text();
  }

  // ---- Zeit --------------------------------------------------------------

  async transit(id, at = "") {
    return (await this.#json(`/charts/${id}/transit`, { params: { at } })).data;
  }

  async transitDays(id, { from = "", days = 12 } = {}) {
    return (await this.#json(`/charts/${id}/transit-days`, { params: { from, days } })).data;
  }

  async timeline(id, { from = "", daysBefore = 2, daysAfter = 12, planets = "", gatesOnly = false } = {}) {
    return (await this.#json(`/charts/${id}/transits`, {
      params: { from, days_before: daysBefore, days_after: daysAfter, planets,
        gates_only: gatesOnly ? 1 : "" },
    })).data;
  }

  async ephemeris(id, planet, { from = "", gatesOnly = false } = {}) {
    return (await this.#json(`/charts/${id}/ephemeris`, {
      params: { planet, from, gates_only: gatesOnly ? 1 : "" },
    })).data;
  }

  async returns(id) {
    return (await this.#json(`/charts/${id}/returns`)).data;
  }

  async returnChart(id, art, number = "") {
    return (await this.#json(`/charts/${id}/returns/${art}`, { params: { number } })).data;
  }

  async lifescript(id) {
    return (await this.#json(`/charts/${id}/lifescript`)).data;
  }

  /** Zeitvarianten: drei (comparison) oder neun (nine), wahlweise mit Grafik. */
  async timeVariants(id, { variants = "comparison", withSvg = false } = {}) {
    return (await this.#json(`/charts/${id}/time-variants`, {
      params: { variants, include: withSvg ? "svg" : "" },
    })).data;
  }

  // ---- Mehrere Charts ----------------------------------------------------

  async interaction(chart1, chart2) {
    return (await this.#json("/interactions", { params: { chart1, chart2 } })).data;
  }

  async interactionSvg(chart1, chart2) {
    return (await this.#request("/interactions/graphic.svg", { params: { chart1, chart2 } })).text();
  }

  async penta(ids, { family = false } = {}) {
    return (await this.#json("/pentas", { method: "POST", body: { charts: ids, family } })).data;
  }

  async pentaSvg(ids, { family = false } = {}) {
    return (await this.#request("/pentas/graphic.svg", {
      params: { charts: ids.join(","), family: family ? 1 : "" },
    })).text();
  }

  async organisation(ids, { profile = "overview" } = {}) {
    return (await this.#json("/organisations", {
      method: "POST", body: { charts: ids, profile },
    })).data;
  }

  async organisationSvg(ids, grafik = "types") {
    return (await this.#request("/organisations/graphic.svg", {
      params: { charts: ids.join(","), graphic: grafik },
    })).text();
  }

  // ---- Was am Chart haengt -----------------------------------------------

  async tags(id) {
    return (await this.#json(`/charts/${id}/tags`)).data;
  }

  async addTags(id, tags) {
    return (await this.#json(`/charts/${id}/tags`, { method: "POST", body: { tags } })).data;
  }

  async removeTag(id, tag) {
    return (await this.#json(`/charts/${id}/tags/${encodeURIComponent(tag)}`,
      { method: "DELETE" })).data;
  }

  async shares(id) {
    return (await this.#json(`/charts/${id}/shares`)).data;
  }

  async addShare(id, userId, mayEdit = false) {
    return (await this.#json(`/charts/${id}/shares`, {
      method: "POST", body: { user_id: Number(userId), may_edit: mayEdit },
    })).data;
  }

  async removeShare(id, userId) {
    return (await this.#json(`/charts/${id}/shares/${userId}`, { method: "DELETE" })).data;
  }

  /** Firmenangaben und Freitexte; der Arbeitskontakt nur auf Anforderung. */
  async company(id, { include = "" } = {}) {
    return (await this.#json(`/charts/${id}/company`, { params: { include } })).data;
  }

  async updateCompany(id, payload) {
    return (await this.#json(`/charts/${id}/company`, { method: "PATCH", body: payload })).data;
  }

  // ---- Mengen und gemerkte Zeitpunkte ------------------------------------

  async chartSets({ type = "" } = {}) {
    return (await this.#json("/chart-sets", { params: { type } })).data;
  }

  async chartSet(id) {
    return (await this.#json(`/chart-sets/${id}`)).data;
  }

  async createChartSet(payload) {
    return (await this.#json("/chart-sets", { method: "POST", body: payload })).data;
  }

  async deleteChartSet(id) {
    return (await this.#json(`/chart-sets/${id}`, { method: "DELETE" })).data;
  }

  async savedTransits({ chartId = "" } = {}) {
    return (await this.#json("/transits", { params: { chart_id: chartId } })).data;
  }

  async saveTransit(payload) {
    return (await this.#json("/transits", { method: "POST", body: payload })).data;
  }

  async deleteSavedTransit(id) {
    return (await this.#json(`/transits/${id}`, { method: "DELETE" })).data;
  }

  // ---- Nachschlagewerke --------------------------------------------------

  /** Eine Referenzsammlung, z.B. "channels", "types", "authorities". */
  async reference(name) {
    return (await this.#json(`/reference/${name}`)).data;
  }

  /**
   * Mehrere Referenzsammlungen in einem Aufruf.
   * @param {string[]} namen  leer = alle
   */
  async references(namen = []) {
    const daten = (await this.#json("/reference", {
      params: { include: "values", collections: namen.join(",") },
    })).data;

    return daten.values || {};
  }

  /** Mehrere Texttypen in einem Aufruf. */
  async dictionaries(typen) {
    const daten = (await this.#json("/reference/texts", {
      params: { types: typen.join(",") },
    })).data;

    return daten.types || {};
  }

  /**
   * Ein Texttyp des Woerterbuchs.
   * Ohne Angabe nur die Stichwoerter, mit `all` alle Eintraege (nur bei
   * kleinen Typen), mit `keywords` gezielt einzelne.
   */
  async dictionary(type, { all = false, keywords = null } = {}) {
    const params = {};
    if (all) params.include = "values";
    if (keywords) params.keywords = keywords.join(",");
    return (await this.#json(`/reference/texts/${type}`, { params })).data;
  }

  /** Die Beschreibung aller Endpunkte (OpenAPI) als Objekt. */
  openapi() {
    return this.#json("/meta/openapi");
  }

  /**
   * Beliebiger Aufruf - Grundlage des Endpunkt-Browsers.
   *
   * @param {string} method  GET, POST, PATCH, DELETE
   * @param {string} path    Pfad unterhalb der Basisadresse, z.B. /charts/1
   * @param {object} options { params, body }
   * @returns {Promise<{status:number, ms:number, headers:object, body:*, text:string, contentType:string, url:string}>}
   */
  async call(method, path, { params = {}, body = null } = {}) {
    const url = this.#url(path, params);
    const begonnen = performance.now();

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + this.token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      throw new ApiError("Netzwerkfehler", {
        status: 0, url,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }

    const text = await res.text();
    const contentType = res.headers.get("content-type") || "";
    let parsed = text;

    if (contentType.includes("json")) {
      try { parsed = text ? JSON.parse(text) : null; } catch { /* bleibt Text */ }
    }

    return {
      status: res.status,
      ms: Math.round(performance.now() - begonnen),
      headers: Object.fromEntries(res.headers.entries()),
      body: parsed,
      text,
      contentType,
      url,
    };
  }

  /** Der passende curl-Aufruf - zum Weitergeben an Partner oder in die Doku. */
  curl(method, path, { params = {}, body = null } = {}) {
    const teile = [`curl -X ${method}`, `'${this.#url(path, params)}'`,
      `\\\n  -H 'Accept: application/json'`,
      `\\\n  -H 'Authorization: Bearer <token>'`];

    if (body) {
      teile.push(`\\\n  -H 'Content-Type: application/json'`);
      teile.push(`\\\n  -d '${JSON.stringify(body)}'`);
    }

    return teile.join(" ");
  }

  // ---- intern ------------------------------------------------------------

  #url(path, params = {}) {
    const url = new URL(this.baseUrl + path);
    url.searchParams.set("lang", this.lang);
    for (const [key, value] of Object.entries(params)) {
      if (value !== "" && value !== null && value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  async #request(path, { method = "GET", body = null, params = {} } = {}) {
    let res;
    try {
      res = await fetch(this.#url(path, params), {
        method,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + this.token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      throw new ApiError("Netzwerkfehler", {
        status: 0,
        url: this.#url(path, params),
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }

    if (!res.ok) throw await this.#error(res);
    return res;
  }

  async #json(path, options = {}) {
    const res = await this.#request(path, options);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async #error(res) {
    let body = null;
    try { body = JSON.parse(await res.text()); } catch { /* HTML oder leer */ }
    const message = body?.error?.message || body?.message || `HTTP ${res.status}`;
    return new ApiError(message, {
      status: res.status,
      code: body?.error?.code ?? null,
      body,
      url: res.url,
    });
  }
}
