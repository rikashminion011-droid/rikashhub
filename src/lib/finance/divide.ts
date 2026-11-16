/**
 * Shares an amount (in paise) evenly between people. Any paise left over go one each to the first people, so the parts always
 * add up to exactly the amount. An empty list gives nothing.
 */
export function divideEvenly(paise: number, ids: readonly string[]): { id: string; paise: number }[] {
  if (ids.length === 0 || paise === 0) return [];
  const each = Math.trunc(paise / ids.length);
  let rest = paise - each * ids.length;
  const step = rest < 0 ? -1 : 1;
  return ids.map((id) => {
    const extra = rest !== 0 ? step : 0;
    rest -= extra;
    return { id, paise: each + extra };
  });
}
