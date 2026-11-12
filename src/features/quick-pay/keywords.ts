/**
 * Keywords that map a Reason to a category ("dosa" gives Food). Pure functions.
 * A keyword matches when it appears in the reason as a whole word or phrase, ignoring case; the longest match wins.
 */

export interface KeywordEntry {
  keyword: string;
  categoryId: string;
}

export const MAX_KEYWORD_LENGTH = 40;
export const MAX_KEYWORDS_PER_CATEGORY = 100;

/** Lower-cased, single-spaced: the form keywords are stored and compared in. */
export function keywordKey(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Splits what was typed into keywords: "Dosa, Idli; Tiffin" gives three. Duplicates and empties are dropped. */
export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const key = keywordKey(part);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `keyword` appears in `text` as a whole word or phrase (letters and digits on either side do not count as a match). */
export function containsWord(text: string, keyword: string): boolean {
  const key = keywordKey(keyword);
  if (!key) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(key)}($|[^\\p{L}\\p{N}])`, "u").test(keywordKey(text));
}

/** The category for a reason, or null when no keyword matches. The longest matching keyword wins, then the first listed. */
export function matchCategory(reason: string, entries: readonly KeywordEntry[]): string | null {
  if (reason.trim() === "") return null;
  let best: KeywordEntry | null = null;
  for (const entry of entries) {
    if (!containsWord(reason, entry.keyword)) continue;
    if (!best || keywordKey(entry.keyword).length > keywordKey(best.keyword).length) best = entry;
  }
  return best?.categoryId ?? null;
}
