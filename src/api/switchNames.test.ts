import { describe, expect, it } from 'vitest'
import { friendlySwitchName } from './switchNames'

describe('friendlySwitchName', () => {
  it('reads the internal names of real map switches', () => {
    expect(friendlySwitchName('switch_00409_power')).toBe('Power switch')
    expect(friendlySwitchName('switch_autoId_00632_EXFIL_reserve_electric_switcher_lever')).toBe('Extract switch')
    expect(friendlySwitchName('switch_autoId_00000_D2_LEVER_reserve_electric_switcher_lever')).toBe('D-2 extract lever')
    expect(friendlySwitchName('switch_00405_call_button')).toBe('Elevator call button')
    expect(friendlySwitchName('switch_Shopping_Mall_DesignStuff_00058_Node_Alarm_Console')).toBe('Alarm console')
    expect(friendlySwitchName('switch_custom_DesignStuff_00034_reserve_electric_switcher_lever')).toBe('Lever')
    expect(friendlySwitchName('switch_00453_Node_GatesButton')).toBe('Gate button')
    expect(friendlySwitchName('something_else')).toBe('Switch')
  })
})
