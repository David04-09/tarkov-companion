/**
 * Map switches come with internal object names ("switch_00409_power",
 * "switch_autoId_00632_EXFIL_reserve_electric_switcher_lever"). Some have an English name in the
 * translation document; for the rest the words in the internal name say what it is.
 */
const RULES: [RegExp, string][] = [
  [/exfil|start_exfiltration/i, 'Extract switch'],
  [/d2_lever/i, 'D-2 extract lever'],
  [/power/i, 'Power switch'],
  [/call_button/i, 'Elevator call button'],
  [/floor_button/i, 'Elevator floor button'],
  [/alarm/i, 'Alarm console'],
  [/gates?_?button/i, 'Gate button'],
  [/pump/i, 'Pump button'],
  [/water/i, 'Water switch'],
  [/lever/i, 'Lever'],
  [/console/i, 'Console'],
  [/urinal/i, 'Hidden switch (urinal)'],
  [/button/i, 'Button'],
]

export function friendlySwitchName(raw: string): string {
  for (const [re, label] of RULES) if (re.test(raw)) return label
  return 'Switch'
}
