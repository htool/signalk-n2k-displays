import { DisplayMode, quantizeBrightness } from './intent'
import {
  BrightnessMaps,
  emptyMaps,
  identityNative,
  mappedNative,
  mappedPalette,
  clearNativeCell,
  clearPaletteCell,
  storeNativeCell,
  storePaletteCell,
  PALETTE_DRIVERS
} from './maps'
import {
  LuxBin,
  SUN_BINS,
  SourceCurves,
  SourceIntent,
  defaultSourceCurves
} from './source'

export const INTENT_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]

export const SUN_LABELS: { [bin: string]: string } = {
  nauticalDawn: 'Nautical dawn',
  dawn: 'Dawn',
  sunrise: 'Sunrise',
  day: 'Day',
  sunset: 'Sunset',
  dusk: 'Dusk',
  nauticalDusk: 'Nautical dusk',
  night: 'Night'
}

export type TimeRow = {
  bin: 'day' | 'night'
  brightness: number
}

export type SunRow = {
  bin: string
  mode: DisplayMode
  brightness: number
}

export type LuxRow = {
  luxMin: number | null
  luxMax: number | null
  mode: DisplayMode
  brightness: number
}

export type NativeRow = {
  mode: DisplayMode
  brightness: number
  navicoBrightness: number
  raymarineBrightness: number
}

export type MappingPalettes = {
  navicoNight: string
  raymarineNight: string
}

export type MappingTables = {
  time: TimeRow[]
  sun: SunRow[]
  lux: LuxRow[]
  native: NativeRow[]
  palettes?: MappingPalettes
}

export type MappingSave =
  | { ok: true; curves: SourceCurves; maps: BrightnessMaps }
  | { ok: false; message: string }

function asMode (value: any): DisplayMode {
  return value === 'night' ? 'night' : 'day'
}

function nativeFor (
  maps: BrightnessMaps,
  ids: string[],
  mode: DisplayMode,
  brightness: number
): number {
  if (!ids[0]) {
    return identityNative(brightness)
  }
  return mappedNative(maps, ids[0], mode, brightness)
}

function paletteFor (
  maps: BrightnessMaps,
  ids: string[],
  vendor: 'navico' | 'raymarine',
  mode: DisplayMode
): string {
  const fallback = PALETTE_DRIVERS[vendor].defaults[mode] || ''
  if (!ids[0]) {
    return fallback
  }
  return mappedPalette(maps, ids[0], mode) || fallback
}

export function emptyNativeRows (): NativeRow[] {
  const rows: NativeRow[] = []
  ;(['day', 'night'] as DisplayMode[]).forEach(mode => {
    INTENT_STEPS.forEach(step => {
      rows.push({
        mode,
        brightness: step,
        navicoBrightness: step,
        raymarineBrightness: step
      })
    })
  })
  return rows
}

export function mappingTables (
  curves: SourceCurves = defaultSourceCurves(),
  maps: BrightnessMaps = emptyMaps(),
  navicoIds: string[] = [],
  raymarineIds: string[] = []
): MappingTables {
  const time: TimeRow[] = (['day', 'night'] as DisplayMode[]).map(bin => {
    const intent = curves.mode[bin] || {
      bin,
      mode: bin,
      brightness: bin === 'night' ? 0.3 : 0.6
    }
    return {
      bin,
      brightness: quantizeBrightness(intent.brightness)
    }
  })
  const sun: SunRow[] = SUN_BINS.map(bin => {
    const intent = curves.sun[bin] || {
      bin,
      mode: 'night' as DisplayMode,
      brightness: 0.2
    }
    return {
      bin,
      mode: asMode(intent.mode),
      brightness: quantizeBrightness(intent.brightness)
    }
  })
  const lux: LuxRow[] = (curves.lux || []).map(bin => ({
    luxMin: bin.min,
    luxMax: isFinite(bin.max) ? bin.max : null,
    mode: asMode(bin.mode),
    brightness: quantizeBrightness(bin.brightness)
  }))
  const native: NativeRow[] = emptyNativeRows().map(row => ({
    ...row,
    navicoBrightness: nativeFor(maps, navicoIds, row.mode, row.brightness),
    raymarineBrightness: nativeFor(
      maps,
      raymarineIds,
      row.mode,
      row.brightness
    )
  }))
  return {
    time,
    sun,
    lux,
    native,
    palettes: {
      navicoNight: paletteFor(maps, navicoIds, 'navico', 'night'),
      raymarineNight: paletteFor(maps, raymarineIds, 'raymarine', 'night')
    }
  }
}

function parseLuxBound (value: any): number | null {
  if (value === '' || value === null || value === undefined) {
    return null
  }
  const n = Number(value)
  if (!isFinite(n) || n < 0) {
    return null
  }
  return n
}

export function curvesFromTables (tables: MappingTables): MappingSave {
  const mode: { [bin: string]: SourceIntent } = {}
  const time = tables && tables.time ? tables.time : []
  time.forEach(row => {
    const bin = row.bin === 'night' ? 'night' : 'day'
    const brightness = quantizeBrightness(row.brightness)
    mode[bin] = { bin, mode: bin, brightness }
  })
  if (!mode.day || !mode.night) {
    return { ok: false, message: 'time table needs day and night' }
  }

  const sun: { [bin: string]: SourceIntent } = {}
  const sunRows = tables && tables.sun ? tables.sun : []
  for (let i = 0; i < sunRows.length; i++) {
    const row = sunRows[i]
    if (SUN_BINS.indexOf(row.bin as typeof SUN_BINS[number]) === -1) {
      return { ok: false, message: `unknown sun bin ${row.bin}` }
    }
    const brightness = quantizeBrightness(row.brightness)
    const rowMode = asMode(row.mode)
    sun[row.bin] = { bin: row.bin, mode: rowMode, brightness }
  }

  const lux: LuxBin[] = []
  const luxRows = tables && tables.lux ? tables.lux : []
  for (let i = 0; i < luxRows.length; i++) {
    const row = luxRows[i]
    const luxMin = parseLuxBound(row.luxMin)
    if (luxMin === null) {
      continue
    }
    const luxMax = parseLuxBound(row.luxMax)
    const max = luxMax === null ? Infinity : luxMax
    if (!(max > luxMin)) {
      return { ok: false, message: 'lux max must be greater than min' }
    }
    lux.push({
      min: luxMin,
      max,
      mode: asMode(row.mode),
      brightness: quantizeBrightness(row.brightness)
    })
  }
  lux.sort((a, b) => a.min - b.min)
  for (let i = 1; i < lux.length; i++) {
    if (lux[i].min < lux[i - 1].max) {
      return { ok: false, message: 'lux ranges overlap' }
    }
  }

  return {
    ok: true,
    curves: { lux, sun, mode },
    maps: emptyMaps()
  }
}

function writeNative (
  maps: BrightnessMaps,
  ids: string[],
  mode: DisplayMode,
  brightness: number,
  native: number
) {
  const identity = identityNative(brightness)
  const quantized = quantizeBrightness(native)
  ids.forEach(id => {
    if (quantized === identity) {
      clearNativeCell(maps, id, mode, brightness)
    } else {
      storeNativeCell(maps, id, mode, brightness, quantized)
    }
  })
}

export function mapsFromTables (
  tables: MappingTables,
  navicoIds: string[],
  raymarineIds: string[],
  previous: BrightnessMaps = emptyMaps()
): BrightnessMaps {
  const maps: BrightnessMaps = {
    brightness: JSON.parse(JSON.stringify(previous.brightness || {})),
    palettes: JSON.parse(JSON.stringify(previous.palettes || {}))
  }
  const rows = tables && tables.native ? tables.native : []
  rows.forEach(row => {
    const mode = asMode(row.mode)
    const brightness = quantizeBrightness(row.brightness)
    writeNative(maps, navicoIds, mode, brightness, row.navicoBrightness)
    writeNative(
      maps,
      raymarineIds,
      mode,
      brightness,
      row.raymarineBrightness
    )
  })
  if (tables.palettes) {
    writeNightPalettes(
      maps,
      navicoIds,
      'navico',
      tables.palettes.navicoNight
    )
    writeNightPalettes(
      maps,
      raymarineIds,
      'raymarine',
      tables.palettes.raymarineNight
    )
  }
  return maps
}

function writeNightPalettes (
  maps: BrightnessMaps,
  ids: string[],
  vendor: 'navico' | 'raymarine',
  color: string
) {
  if (typeof color !== 'string' || !color) {
    return
  }
  const allowed = PALETTE_DRIVERS[vendor].values.night || []
  if (allowed.indexOf(color) === -1) {
    return
  }
  const fallback = PALETTE_DRIVERS[vendor].defaults.night
  ids.forEach(id => {
    if (color === fallback) {
      clearPaletteCell(maps, id, 'night')
    } else {
      storePaletteCell(maps, id, 'night', color)
    }
  })
}

export function saveMapping (
  tables: MappingTables,
  navicoIds: string[],
  raymarineIds: string[],
  previousMaps: BrightnessMaps = emptyMaps()
): MappingSave {
  const parsed = curvesFromTables(tables)
  if (!parsed.ok) {
    return parsed
  }
  return {
    ok: true,
    curves: parsed.curves,
    maps: mapsFromTables(tables, navicoIds, raymarineIds, previousMaps)
  }
}
