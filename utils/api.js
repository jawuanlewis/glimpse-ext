const DictionaryAPI = {
  BASE_URL: "https://api.dictionaryapi.dev/api/v2/entries/en",
  TIMEOUT_MS: 5000,

  /**
   * Look up a word and return a normalized result.
   * @param {string} word
   * @returns {Promise<{word: string, phonetic: string|null, audioUrl: string|null, meanings: Array<{partOfSpeech: string, definitions: Array<{definition: string, example: string|null}>}>} | {error: string, errorType: "not-found"|"timeout"|"service"|"network"}>}
   */
  async lookup(word) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(
        `${this.BASE_URL}/${encodeURIComponent(word)}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { error: "No definition found.", errorType: "not-found" };
        }
        return {
          error: "Dictionary service is unavailable. Please try again later.",
          errorType: "service",
        };
      }

      const data = await response.json();
      return this.normalize(data[0]);
    } catch (err) {
      if (err.name === "AbortError") {
        return {
          error: "Dictionary service is taking too long to respond.",
          errorType: "timeout",
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
   * Normalize the raw API response into a consistent shape.
   */
  normalize(entry) {
    // Single pass over phonetics — collect text and audio URL together.
    let phonetic = entry.phonetic || null;
    let audioUrl = null;
    for (const p of entry.phonetics ?? []) {
      if (!phonetic && p.text) phonetic = p.text;
      if (!audioUrl && p.audio) audioUrl = p.audio;
      if (phonetic && audioUrl) break;
    }

    const meanings = (entry.meanings || []).map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: (m.definitions || []).slice(0, 2).map((d) => ({
        definition: d.definition,
        example: d.example || null,
      })),
    }));

    return {
      word: entry.word,
      phonetic,
      audioUrl,
      meanings,
    };
  },
};
