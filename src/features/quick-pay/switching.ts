import type { SwitchSettings } from "./settings-model";

/**
 * The switch icon beside Bank Through, Split and Credit History: which options it moves through, and which one it moves to
 * next. Sequential switching follows the dropdown's own order; custom order follows the list set in Customized Settings.
 */

/** The ids the switch moves through, in order. Custom order keeps only options that still exist; nothing left means sequential. */
export function switchIds(config: SwitchSettings, available: readonly string[]): string[] {
  if (config.mode === "CUSTOM") {
    const set = new Set(available);
    const picked = [...new Set(config.order)].filter((id) => set.has(id));
    if (picked.length > 0) return picked;
  }
  return [...available];
}

/**
 * The option one press moves to: the one after `current`, wrapping to the first after the last. When nothing is chosen yet (or
 * the current one is not in the list) the first press lands on the chosen starting option, else the first one.
 */
export function nextSwitch(config: SwitchSettings, available: readonly string[], current: string | null): string | null {
  const ids = switchIds(config, available);
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return config.startId && ids.includes(config.startId) ? config.startId : ids[0]!;
  return ids[(at + 1) % ids.length]!;
}
