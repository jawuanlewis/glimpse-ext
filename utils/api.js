const DictionaryAPI = {
  BASE_URL: "https://api.dictionaryapi.dev/api/v2/entries/en",

  /**
   * Look up a word and return a normalized result.
   * @param {string} word
   * @returns {Promise<{word: string, phonetic: string|null, meanings: Array<{partOfSpeech: string, definitions: Array<{definition: string, example: string|null}>}>} | {error: string}>}
   */
  async lookup(word) {
    try {
      const response = await fetch(
        `${this.BASE_URL}/${encodeURIComponent(word)}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { error: "No definition found." };
        }
        return { error: "Something went wrong. Please try again." };
      }

      const data = await response.json();
      return this.normalize(data[0]);
    } catch {
      return { error: "Network error. Check your connection." };
    }
  },

  /**
   * Normalize the raw API response into a consistent shape.
   */
  normalize(entry) {
    const phonetic =
      entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || null;

    const audioUrl = entry.phonetics?.find((p) => p.audio)?.audio || null;

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
