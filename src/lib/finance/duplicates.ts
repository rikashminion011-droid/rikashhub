import { diffDays } from "./dates";

export interface DuplicateCandidate {
  type: string;
  amountPaise: number;
  date: Date;
  accountId?: string | null;
  creditCardId?: string | null;
  description?: string | null;
}

export interface PossibleDuplicate<T extends DuplicateCandidate> {
  transaction: T;
  /** Higher = more likely a duplicate. */
  score: number;
}

function normalise(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / new Set([...left, ...right]).size;
}

/**
 * Existing transactions that look like the one being entered: same type, same amount, same
 * instrument, within `windowDays`. Used to show a "possible duplicate" warning (never blocks).
 */
export function findPossibleDuplicates<T extends DuplicateCandidate>(
  candidate: DuplicateCandidate,
  existing: readonly T[],
  windowDays = 1,
): PossibleDuplicate<T>[] {
  const description = normalise(candidate.description);
  const matches: PossibleDuplicate<T>[] = [];

  for (const tx of existing) {
    if (tx.type !== candidate.type) continue;
    if (tx.amountPaise !== candidate.amountPaise) continue;
    const gap = Math.abs(diffDays(tx.date, candidate.date));
    if (gap > windowDays) continue;
    if (candidate.accountId && tx.accountId && candidate.accountId !== tx.accountId) continue;
    if (candidate.creditCardId && tx.creditCardId && candidate.creditCardId !== tx.creditCardId) continue;

    let score = 1;
    if (gap === 0) score += 2;
    const other = normalise(tx.description);
    if (description && other) {
      if (description === other) score += 2;
      else if (tokenOverlap(description, other) >= 0.5) score += 1;
    }
    matches.push({ transaction: tx, score });
  }

  return matches.sort((a, b) => b.score - a.score);
}
