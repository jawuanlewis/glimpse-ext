const DictionaryAPI = {
  // Primary: FreeDictionaryAPI.com (Wiktionary data, pre-parsed to JSON).
  PRIMARY_URL: "https://freedictionaryapi.com/api/v1/entries/en",
  // Fallback: Wiktionary's own REST definition endpoint. Slower and returns
  // HTML fragments, so it's only used when the primary is unavailable.
  FALLBACK_URL: "https://en.wiktionary.org/api/rest_v1/page/definition",
  // Wiktionary's Action API — used to find pronunciation recordings.
  WIKTIONARY_API_URL: "https://en.wiktionary.org/w/api.php",
  WIKTIONARY_PAGE_URL: "https://en.wiktionary.org/wiki",

  // The primary normally answers in ~150ms, so a short timeout leaves room to
  // try the fallback without the total wait getting out of hand.
  PRIMARY_TIMEOUT_MS: 3000,
  FALLBACK_TIMEOUT_MS: 6000,
  AUDIO_TIMEOUT_MS: 5000,

  MAX_DEFINITIONS: 2,
  MAX_EXAMPLE_LENGTH: 120,

  // Wikimedia asks API clients to identify themselves. Browsers won't let us
  // set User-Agent, so Wikimedia accepts this header instead.
  WIKIMEDIA_HEADERS: {
    "Api-User-Agent":
      "Glimpse-extension (https://github.com/jawuanlewis/glimpse-ext)",
  },

  NOT_FOUND: { error: "No definition found.", errorType: "not-found" },

  audioCache: new Map(),

  /**
   * Look up a word and return a normalized result. Falls back to Wiktionary
   * directly if the primary provider times out or errors (but not on a
   * genuine "not found" — both providers share the same underlying data).
   * @param {string} word
   * @returns {Promise<{word: string, phonetic: string|null, meanings: Array<{partOfSpeech: string, definitions: Array<{definition: string, example: string|null}>}>, source: {url: string, via: string|null}} | {error: string, errorType: "not-found"|"timeout"|"service"|"network"}>}
   */
  async lookup(word) {
    const encoded = encodeURIComponent(word);

    const primary = await this.request(
      `${this.PRIMARY_URL}/${encoded}`,
      this.PRIMARY_TIMEOUT_MS,
    );
    if (!primary.error) return this.normalizePrimary(primary.data);
    if (primary.errorType === "not-found") return primary;

    const fallback = await this.request(
      `${this.FALLBACK_URL}/${encoded}`,
      this.FALLBACK_TIMEOUT_MS,
      this.WIKIMEDIA_HEADERS,
    );
    if (fallback.error) return fallback;
    return this.normalizeFallback(fallback.data, word);
  },

  /**
   * Fetch JSON with a timeout, mapping failures to an errorType.
   * @returns {Promise<{data: any} | {error: string, errorType: string}>}
   */
  async request(url, timeoutMs, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });

      if (!response.ok) {
        if (response.status === 404) return this.NOT_FOUND;
        return {
          error: "Dictionary service is unavailable. Please try again later.",
          errorType: "service",
        };
      }

      return { data: await response.json() };
    } catch (err) {
      if (err.name === "AbortError") {
        return {
          error: "Dictionary service is taking too long to respond.",
          errorType: "timeout",
        };
      }
      if (err instanceof SyntaxError) {
        return {
          error: "Dictionary service returned an unexpected response.",
          errorType: "service",
        };
      }
      return {
        error: "Network error. Check your connection.",
        errorType: "network",
      };
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Normalize a FreeDictionaryAPI.com response. Unknown words come back as
   * 200 with an empty `entries` array rather than a 404.
   */
  normalizePrimary(data) {
    const entries = (data?.entries ?? []).filter(
      (e) => e.language?.code === "en",
    );

    const meanings = this.mergeMeanings(
      entries.map((e) => ({
        partOfSpeech: e.partOfSpeech,
        definitions: (e.senses ?? []).map((s) => ({
          definition: s.definition,
          example: this.pickExample(s.examples),
        })),
      })),
    );
    if (!meanings.length) return this.NOT_FOUND;

    return {
      word: data.word,
      phonetic: this.pickPhonetic(entries),
      meanings,
      source: {
        url: this.wiktionaryPageUrl(data.word),
        via: "FreeDictionaryAPI.com",
      },
    };
  },

  /**
   * Normalize a Wiktionary REST response. Definitions and examples are HTML
   * fragments, and there's no pronunciation data.
   */
  normalizeFallback(data, word) {
    const meanings = this.mergeMeanings(
      (data?.en ?? []).map((m) => ({
        partOfSpeech: m.partOfSpeech?.toLowerCase(),
        definitions: (m.definitions ?? []).map((d) => ({
          definition: this.stripHtml(d.definition),
          example: this.pickExample((d.examples ?? []).map(this.stripHtml)),
        })),
      })),
    );
    if (!meanings.length) return this.NOT_FOUND;

    return {
      word,
      phonetic: null,
      meanings,
      source: { url: this.wiktionaryPageUrl(word), via: null },
    };
  },

  /**
   * Merge entries that share a part of speech (Wiktionary splits words by
   * etymology, so e.g. "run" has two separate verb entries), drop empty
   * definitions, and cap each part of speech at MAX_DEFINITIONS.
   */
  mergeMeanings(items) {
    const byPos = new Map();
    for (const { partOfSpeech, definitions } of items) {
      if (!partOfSpeech) continue;
      if (!byPos.has(partOfSpeech)) byPos.set(partOfSpeech, []);
      byPos.get(partOfSpeech).push(...definitions.filter((d) => d.definition));
    }

    return [...byPos]
      .filter(([, defs]) => defs.length)
      .map(([partOfSpeech, defs]) => ({
        partOfSpeech,
        definitions: defs.slice(0, this.MAX_DEFINITIONS),
      }));
  },

  /**
   * Pick a short usage example. Wiktionary mixes simple examples with long
   * literary quotations and citation lines ("1821-1822, Vicesimus Knox, …"),
   * which read badly in a small popup — skip those rather than truncate them.
   */
  pickExample(examples) {
    for (const raw of examples ?? []) {
      const text = raw?.trim();
      if (!text || text.length > this.MAX_EXAMPLE_LENGTH) continue;
      if (text.includes("\n") || text.includes("[…]")) continue;
      if (/^\d{3,4}\b/.test(text)) continue;
      return text;
    }
    return null;
  },

  /** Prefer a General American IPA transcription, else the first IPA one. */
  pickPhonetic(entries) {
    const ipa = entries
      .flatMap((e) => e.pronunciations ?? [])
      .filter((p) => p.type === "ipa" && p.text);
    const us = ipa.find((p) =>
      p.tags?.some((t) => t === "General American" || t === "US"),
    );
    return (us ?? ipa[0])?.text ?? null;
  },

  stripHtml(html) {
    return (html ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([\da-f]+);/gi, (_, n) =>
        String.fromCodePoint(Number.parseInt(n, 16)),
      )
      .replaceAll("&nbsp;", " ")
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&")
      .replace(/\s+/g, " ")
      .trim();
  },

  wiktionaryPageUrl(word) {
    return `${this.WIKTIONARY_PAGE_URL}/${encodeURIComponent(word)}`;
  },

  /**
   * Find a pronunciation recording for a word on Wiktionary. Answers
   * (including "no recording") are cached for the service worker's lifetime;
   * failed requests are not, so the next click retries.
   * @param {string} word
   * @returns {Promise<string|null>} URL of an audio file, or null if none
   * @throws if Wiktionary couldn't be reached
   */
  findAudioUrl(word) {
    const key = word.toLowerCase();
    if (!this.audioCache.has(key)) {
      const pending = this.fetchAudioUrl(word);
      this.audioCache.set(key, pending);
      pending.catch(() => this.audioCache.delete(key));
    }
    return this.audioCache.get(key);
  },

  async fetchAudioUrl(word) {
    const params = new URLSearchParams({
      action: "query",
      titles: word,
      generator: "images",
      gimlimit: "max",
      prop: "imageinfo",
      iiprop: "url",
      format: "json",
      formatversion: "2",
    });
    const res = await this.request(
      `${this.WIKTIONARY_API_URL}?${params}`,
      this.AUDIO_TIMEOUT_MS,
      this.WIKIMEDIA_HEADERS,
    );
    if (res.errorType === "not-found") return null;
    if (res.error) throw new Error(res.error);

    // Wiktionary pages embed recordings for every language, so only accept
    // English files named after this exact word, e.g. "en-us-hello.ogg",
    // "En-uk-hello-2.ogg", "En-run.ogg", or Lingua Libre's
    // "LL-Q1860 (eng)-Speaker-well-being.wav". Q1860 is English.
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const pattern = new RegExp(
      String.raw`^File:(?:en(?:-([a-z]{2}))?|(LL-Q1860 \(eng\)-.+))-${escaped}-?\d*\.(?:ogg|oga|mp3|wav|flac|opus)$`,
      "i",
    );
    const rank = ([, locale, lingualibre]) => {
      if (lingualibre) return 3;
      if (!locale) return 1;
      return locale.toLowerCase() === "us" ? 0 : 2;
    };

    const candidates = (res.data?.query?.pages ?? [])
      .map((p) => ({
        match: p.title?.match(pattern),
        url: p.imageinfo?.[0]?.url,
      }))
      .filter((c) => c.match && c.url)
      .sort((a, b) => rank(a.match) - rank(b.match));
    if (!candidates.length) return null;

    // Drop Wikimedia's utm_* tracking params from the file URL.
    const url = new URL(candidates[0].url);
    url.search = "";
    return url.toString();
  },
};
