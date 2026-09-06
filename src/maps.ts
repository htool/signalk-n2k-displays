import * as fs from 'fs'
import * as path from 'path'
import { DisplayControl, DisplayMode, quantizeBrightness } from './intent'

export type IntentCells = { [intentStep: string]: number }
export type ModeMaps = { day?: IntentCells; night?: IntentCells }
export type PaletteCells = { day?: string; night?: string }
export type BrightnessMaps = {
  brightness: { [deviceId: string]: ModeMaps }
  palettes: { [deviceId: string]: PaletteCells }
}

export type PaletteDriver = {
  modes: DisplayMode[]
  values: { [mode in DisplayMode]?: string[] }
  defaults: { [mode in DisplayMode]?: string }
}

export const PALETTE_DRIVERS: { [vendor: string]: PaletteDriver } = {
  navico: {
    modes: ['night'],
    values: {
      night: ['red', 'green', 'blue', 'white', 'magenta']
    },
    defaults: { night: 'red' }
  },
  raymarine: {
    modes: ['day', 'night'],
    values: {
      day: ['day1', 'day2'],
      night: ['red/black', 'inverse']
    },
    defaults: { day: 'day1', night: 'red/black' }
  }
}

export function emptyMaps (): BrightnessMaps {
  return { brightness: {}, palettes: {} }
}

export function shouldApplyMaps (control: DisplayControl): boolean {
  return control === 'auto' || control === 'auto-learning'
}

export function shouldLearn (control: DisplayControl): boolean {
  return control === 'auto-learning'
}

export function storeNativeCell (
  maps: BrightnessMaps,
  id: string,
  mode: DisplayMode,
  intent: number,
  native: number
): void {
  const step = String(quantizeBrightness(intent))
  const value = quantizeBrightness(native)
  if (!maps.brightness[id]) {
    maps.brightness[id] = {}
  }
  if (!maps.brightness[id][mode]) {
    maps.brightness[id][mode] = {}
  }
  maps.brightness[id][mode]![step] = value
}

export function storePaletteCell (
  maps: BrightnessMaps,
  id: string,
  mode: DisplayMode,
  color: string
): boolean {
  const vendor = vendorOf(id)
  if (!paletteDeclared(vendor, mode)) {
    return false
  }
  if (allowedColors(vendor, mode).indexOf(color) === -1) {
    return false
  }
  if (!maps.palettes[id]) {
    maps.palettes[id] = {}
  }
  maps.palettes[id][mode] = color
  return true
}

export function identityNative (intent: number): number {
  return quantizeBrightness(intent)
}

export function deviceId (vendor: string, group: string): string {
  return `${vendor}.${group}`
}

export function vendorOf (id: string): string {
  return id.split('.')[0]
}

export function paletteDeclared (vendor: string, mode: DisplayMode): boolean {
  const driver = PALETTE_DRIVERS[vendor]
  return !!(driver && driver.modes.indexOf(mode) !== -1)
}

function allowedColors (vendor: string, mode: DisplayMode): string[] {
  const driver = PALETTE_DRIVERS[vendor]
  return (driver && driver.values[mode]) || []
}

export function mappedNative (
  maps: BrightnessMaps,
  id: string,
  mode: DisplayMode,
  intent: number
): number {
  const step = String(quantizeBrightness(intent))
  const device = maps.brightness && maps.brightness[id]
  const cells = device && device[mode]
  const cell = cells && cells[step]
  if (typeof cell === 'number' && isFinite(cell)) {
    return quantizeBrightness(cell)
  }
  return identityNative(intent)
}

export function mappedPalette (
  maps: BrightnessMaps,
  id: string,
  mode: DisplayMode,
  defaults?: { [mode in DisplayMode]?: string }
): string | undefined {
  const vendor = vendorOf(id)
  if (!paletteDeclared(vendor, mode)) {
    return undefined
  }
  const allowed = allowedColors(vendor, mode)
  const stored = maps.palettes && maps.palettes[id] && maps.palettes[id][mode]
  if (typeof stored === 'string' && allowed.indexOf(stored) !== -1) {
    return stored
  }
  const fallback = defaults && defaults[mode]
  if (typeof fallback === 'string' && allowed.indexOf(fallback) !== -1) {
    return fallback
  }
  return PALETTE_DRIVERS[vendor].defaults[mode]
}

export function nativeNightModeState (mode: DisplayMode): number {
  return mode === 'night' ? 1 : 0
}

export function vendorBrightnessTargets (
  maps: BrightnessMaps,
  mode: DisplayMode,
  intent: number,
  deviceIds: string[]
): { deviceId: string; native: number }[] {
  return deviceIds.map(id => {
    return { deviceId: id, native: mappedNative(maps, id, mode, intent) }
  })
}

export function mapsPath (dataDir: string): string {
  return path.join(dataDir, 'maps.json')
}

function objectOrEmpty (value: any): any {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return {}
}

export function loadMaps (dataDir: string): BrightnessMaps {
  const file = mapsPath(dataDir)
  if (!fs.existsSync(file)) {
    return emptyMaps()
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') {
      return emptyMaps()
    }
    return {
      brightness: objectOrEmpty(parsed.brightness),
      palettes: objectOrEmpty(parsed.palettes)
    }
  } catch (err) {
    return emptyMaps()
  }
}

export function saveMaps (dataDir: string, maps: BrightnessMaps): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  const normalized: BrightnessMaps = {
    brightness: objectOrEmpty(maps.brightness),
    palettes: objectOrEmpty(maps.palettes)
  }
  fs.writeFileSync(
    mapsPath(dataDir),
    JSON.stringify(normalized, null, 2) + '\n'
  )
}
