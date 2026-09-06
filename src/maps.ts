import * as fs from 'fs'
import * as path from 'path'
import { DisplayControl, DisplayMode, quantizeBrightness } from './intent'

export type IntentCells = { [intentStep: string]: number }
export type ModeMaps = { day?: IntentCells; night?: IntentCells }
export type BrightnessMaps = { brightness: { [deviceId: string]: ModeMaps } }

export function emptyMaps (): BrightnessMaps {
  return { brightness: {} }
}

export function shouldApplyMaps (control: DisplayControl): boolean {
  return control === 'auto' || control === 'auto-learning'
}

export function identityNative (intent: number): number {
  return quantizeBrightness(intent)
}

export function deviceId (vendor: string, group: string): string {
  return `${vendor}.${group}`
}

export function mappedNative (
  maps: BrightnessMaps,
  id: string,
  mode: DisplayMode,
  intent: number
): number {
  const step = String(quantizeBrightness(intent))
  const device = maps.brightness[id]
  const cells = device && device[mode]
  const cell = cells && cells[step]
  if (typeof cell === 'number' && isFinite(cell)) {
    return quantizeBrightness(cell)
  }
  return identityNative(intent)
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

export function loadMaps (dataDir: string): BrightnessMaps {
  const file = mapsPath(dataDir)
  if (!fs.existsSync(file)) {
    return emptyMaps()
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !parsed.brightness) {
      return emptyMaps()
    }
    return { brightness: parsed.brightness }
  } catch (err) {
    return emptyMaps()
  }
}

export function saveMaps (dataDir: string, maps: BrightnessMaps): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(mapsPath(dataDir), JSON.stringify(maps, null, 2) + '\n')
}
