/**
 * Suggests which of your banks a statement's account name belongs to.
 * The statement says "IDFC FIRST Bank 1960", "Canara Bank 5109", "Tamilnad Mercantile Bank 6670"; your banks
 * are named "GPay → IDFC", "GPay → Canara", "GPay → TMB". It is only a suggestion: the import screen shows it and
 * lets you change it.
 */

export interface BankChoice {
  id: string;
  label: string;
}

const FILLER = new Set(["bank", "first", "ltd", "limited", "of", "india", "the", "account", "a/c"]);

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** The names a statement account might be written as: "idfc", "tamilnad", "tmb" (initials of all words), and so on. */
export function statementAliases(statementBank: string): string[] {
  const all = words(statementBank).filter((w) => !/^\d+$/.test(w)); // drop the account digits
  const meaningful = all.filter((w) => !FILLER.has(w));
  const aliases = new Set<string>(meaningful);
  if (all.length > 1) aliases.add(all.map((w) => w[0]).join("")); // Tamilnad Mercantile Bank gives "tmb"
  if (meaningful.length > 1) aliases.add(meaningful.map((w) => w[0]).join("")); // "tm"
  return [...aliases].filter((a) => a.length >= 2);
}

/** The best match among `banks`, or null when nothing looks right. Never guesses between equally good matches. */
export function suggestBank(statementBank: string, banks: readonly BankChoice[]): string | null {
  const aliases = statementAliases(statementBank);
  if (aliases.length === 0) return null;

  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const bank of banks) {
    const last = bank.label.split("→").at(-1)!.trim().toLowerCase(); // "GPay → IDFC" gives "idfc"
    const labelWords = words(bank.label);
    let score = 0;
    for (const alias of aliases) {
      if (last === alias) score = Math.max(score, 3);
      else if (labelWords.includes(alias)) score = Math.max(score, 2);
      else if (last.includes(alias) || alias.includes(last)) score = Math.max(score, last.length >= 3 ? 1 : 0);
    }
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { id: bank.id, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && !tie ? best.id : null;
}
