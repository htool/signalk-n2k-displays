import * as fs from 'fs'
import * as path from 'path'
import { DisplayMode, quantizeBrightness } from './intent'

export const SOURCES = ['mode', 'sun', 'lux'] as const
export type LightSource = typeof SOURCES[number]

export const DEFAULT_SOURCE: LightSource = 'mode'
export const DEFAULT_LUX_PATH = 'environment.outside.lux'

export type SourceIntent = {
  bin: string
  mode: DisplayMode
  brightness: number
}

export const MODE_CURVE: { [bin: string]: SourceIntent } = {
  day: { bin: 'day', mode: 'day', brightness: 0.6 },
  night: { bin: 'night', mode: 'night', brightness: 0.3 }
}

export const SUN_CURVE: { [bin: string]: SourceIntent } = {
  nauticalDawn: { bin: 'nauticalDawn', mode: 'night', brightness: 0.3 },
  dawn: { bin: 'dawn', mode: 'night', brightness: 0.4 },
  sunrise: { bin: 'sunrise', mode: 'day', brightness: 0.4 },
  day: { bin: 'day', mode: 'day', brightness: 0.6 },
  sunset: { bin: 'sunset', mode: 'day', brightness: 0.4 },
  dusk: { bin: 'dusk', mode: 'night', brightness: 0.4 },
  nauticalDusk: { bin: 'nauticalDusk', mode: 'night', brightness: 0.3 },
  night: { bin: 'night', mode: 'night', brightness: 0.2 }
}

export type LuxBin = {
  min: number
  max: number
  mode: DisplayMode
  brightness: number
}

export const LUX_CURVE: LuxBin[] = [
  { min: 0, max: 1, mode: 'night', brightness: 0.2 },
  { min: 1, max: 10, mode: 'night', brightness: 0.3 },
  { min: 10, max: 100, mode: 'night', brightness: 0.4 },
  { min: 100, max: 1000, mode: 'day', brightness: 0.4 },
  { min: 1000, max: 10000, mode: 'day', brightness: 0.6 },
  { min: 10000, max: Infinity, mode: 'day', brightness: 1 }
]

export const SUN_BINS = [
  'nauticalDawn',
  'dawn',
  'sunrise',
  'day',
  'sunset',
  'dusk',
  'nauticalDusk',
  'night'
] as const

export type SourceCurves = {
  lux: LuxBin[]
  sun: { [bin: string]: SourceIntent }
  mode: { [bin: string]: SourceIntent }
}

export function defaultSourceCurves (): SourceCurves {
  const sun: { [bin: string]: SourceIntent } = {}
  Object.keys(SUN_CURVE).forEach(key => {
    sun[key] = { ...SUN_CURVE[key] }
  })
  return {
    lux: LUX_CURVE.map(bin => ({ ...bin })),
    sun,
    mode: {
      day: { ...MODE_CURVE.day },
      night: { ...MODE_CURVE.night }
    }
  }
}

export function sourceCurvesPath (dataDir: string): string {
  return path.join(dataDir, 'source.json')
}

function finiteOrInf (value: any): number {
  if (value === null || value === undefined || value === 'inf') {
    return Infinity
  }
  const n = Number(value)
  return typeof n === 'number' && isFinite(n) ? n : Infinity
}

export function loadSourceCurves (dataDir: string): SourceCurves {
  const file = sourceCurvesPath(dataDir)
  if (!fs.existsSync(file)) {
    return defaultSourceCurves()
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const curves = curvesFromJson(parsed)
    return curves || defaultSourceCurves()
  } catch (err) {
    return defaultSourceCurves()
  }
}

function asRatio (value: any, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !isFinite(n)) {
    return quantizeBrightness(fallback)
  }
  if (n > 1 && n <= 10) {
    return quantizeBrightness(n / 10)
  }
  return quantizeBrightness(n)
}

function hasPluginSource (properties: any): boolean {
  return !!(
    properties &&
    (properties.time ||
      properties.sun ||
      (properties.lux && (properties.lux.table || properties.lux.path)))
  )
}

export function curvesFromPluginConfig (
  properties: any
): SourceCurves | undefined {
  if (!hasPluginSource(properties)) {
    return undefined
  }
  const defaults = defaultSourceCurves()
  const time = properties.time || {}
  const sunIn = properties.sun || {}
  const luxIn = properties.lux || {}
  const sun: { [bin: string]: SourceIntent } = {}
  SUN_BINS.forEach(bin => {
    const row = sunIn[bin] || {}
    const fallback = defaults.sun[bin]
    sun[bin] = {
      bin,
      mode: row.mode === 'day' || row.mode === 'night' ? row.mode : fallback.mode,
      brightness: asRatio(row.brightness, fallback.brightness)
    }
  })
  const table = Array.isArray(luxIn.table) ? luxIn.table : []
  const lux: LuxBin[] =
    table.length > 0
      ? table
          .map((row: any) => {
            const min = Number(row && (row.luxMin !== undefined ? row.luxMin : row.min))
            if (!isFinite(min) || min < 0) {
              return undefined
            }
            const rawMax = row.luxMax !== undefined ? row.luxMax : row.max
            const max =
              rawMax === '' || rawMax === null || rawMax === undefined
                ? Infinity
                : Number(rawMax)
            return {
              min,
              max: isFinite(max) ? max : Infinity,
              mode: (row.mode === 'night' || row.dayNight === 'night'
                ? 'night'
                : 'day') as DisplayMode,
              brightness: asRatio(
                row.brightness !== undefined ? row.brightness : row.backlightLevel,
                0.2
              )
            }
          })
          .filter(Boolean)
      : defaults.lux
  return {
    lux: lux as LuxBin[],
    sun,
    mode: {
      day: {
        bin: 'day',
        mode: 'day',
        brightness: asRatio(time.day, defaults.mode.day.brightness)
      },
      night: {
        bin: 'night',
        mode: 'night',
        brightness: asRatio(time.night, defaults.mode.night.brightness)
      }
    }
  }
}

export function pluginConfigFromCurves (
  curves: SourceCurves,
  luxPath: string = DEFAULT_LUX_PATH
): {
  time: { day: number; night: number }
  sun: { [bin: string]: { mode: DisplayMode; brightness: number } }
  lux: {
    path: string
    table: {
      luxMin: number
      luxMax: number | null
      mode: DisplayMode
      brightness: number
    }[]
  }
  luxPath: string
} {
  const sun: { [bin: string]: { mode: DisplayMode; brightness: number } } = {}
  SUN_BINS.forEach(bin => {
    const intent = curves.sun[bin]
    if (intent) {
      sun[bin] = { mode: intent.mode, brightness: intent.brightness }
    }
  })
  return {
    time: {
      day: curves.mode.day.brightness,
      night: curves.mode.night.brightness
    },
    sun,
    lux: {
      path: luxPath,
      table: curves.lux.map(bin => ({
        luxMin: bin.min,
        luxMax: isFinite(bin.max) ? bin.max : null,
        mode: bin.mode,
        brightness: bin.brightness
      }))
    },
    luxPath
  }
}

export const SOURCE_BRIGHTNESS_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

export const SOURCE_BRIGHTNESS_NAMES = SOURCE_BRIGHTNESS_STEPS.map(
  step => `${Math.round(step * 100)}%`
)

export function saveSourceCurves (dataDir: string, curves: SourceCurves): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(
    sourceCurvesPath(dataDir),
    JSON.stringify(
      {
        lux: curves.lux.map(bin => ({
          min: bin.min,
          max: isFinite(bin.max) ? bin.max : null,
          mode: bin.mode,
          brightness: quantizeBrightness(bin.brightness)
        })),
        sun: curves.sun,
        mode: curves.mode
      },
      null,
      2
    ) + '\n'
  )
}

function curvesFromJson (parsed: any): SourceCurves | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined
  }
  const lux = Array.isArray(parsed.lux)
    ? parsed.lux
        .map((bin: any) => {
          const min = Number(bin && bin.min)
          const brightness = quantizeBrightness(bin && bin.brightness)
          const mode = bin && bin.mode === 'night' ? 'night' : 'day'
          if (!isFinite(min) || min < 0 || !isFinite(brightness)) {
            return undefined
          }
          return {
            min,
            max: finiteOrInf(bin.max),
            mode: mode as DisplayMode,
            brightness
          }
        })
        .filter(Boolean)
    : defaultSourceCurves().lux
  const sun =
    parsed.sun && typeof parsed.sun === 'object'
      ? parsed.sun
      : defaultSourceCurves().sun
  const mode =
    parsed.mode && typeof parsed.mode === 'object'
      ? parsed.mode
      : defaultSourceCurves().mode
  return { lux: lux as LuxBin[], sun, mode }
}

export function parseSource (value: any): LightSource {
  if (SOURCES.indexOf(value) !== -1) {
    return value
  }
  return DEFAULT_SOURCE
}

export function intentFromMode (
  value: any,
  curve: { [bin: string]: SourceIntent } = MODE_CURVE
): SourceIntent | undefined {
  if (value === 'night') {
    return curve.night
  }
  if (typeof value === 'string') {
    return curve.day
  }
  return undefined
}

export function intentFromSun (
  value: any,
  curve: { [bin: string]: SourceIntent } = SUN_CURVE
): SourceIntent | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return curve[value]
}

export function intentFromLux (
  value: any,
  curve: LuxBin[] = LUX_CURVE
): SourceIntent | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !isFinite(n) || n < 0) {
    return undefined
  }
  for (let i = 0; i < curve.length; i++) {
    const bin = curve[i]
    if (n >= bin.min && n < bin.max) {
      return {
        bin: `lux:${bin.min}-${isFinite(bin.max) ? bin.max : 'inf'}`,
        mode: bin.mode,
        brightness: quantizeBrightness(bin.brightness)
      }
    }
  }
  return undefined
}

export function intentFromSource (
  source: LightSource,
  path: string,
  value: any,
  luxPath: string
): SourceIntent | undefined {
  if (source === 'mode' && path === 'environment.mode') {
    return intentFromMode(value)
  }
  if (source === 'sun' && path === 'environment.sun') {
    return intentFromSun(value)
  }
  if (source === 'lux' && path === luxPath) {
    return intentFromLux(value)
  }
  return undefined
}

export type SourceReading = {
  value: any
  seenAt: number
}

export type SourceReadings = {
  lux?: SourceReading
  sun?: SourceReading
  mode?: SourceReading
}

export const LUX_STALE_MS = 15 * 60 * 1000
export const SUN_STALE_MS = 5 * 60 * 1000
export const MODE_STALE_MS = 5 * 60 * 1000

function fresh (
  reading: SourceReading | undefined,
  now: number,
  maxAge: number
): boolean {
  return !!(reading && now - reading.seenAt <= maxAge)
}

export function intentFromCascade (
  readings: SourceReadings,
  now: number = Date.now(),
  curves: SourceCurves = defaultSourceCurves()
): SourceIntent | undefined {
  if (fresh(readings.lux, now, LUX_STALE_MS)) {
    const next = intentFromLux(readings.lux && readings.lux.value, curves.lux)
    if (next) {
      return next
    }
  }
  if (fresh(readings.sun, now, SUN_STALE_MS)) {
    const next = intentFromSun(readings.sun && readings.sun.value, curves.sun)
    if (next) {
      return next
    }
  }
  if (fresh(readings.mode, now, MODE_STALE_MS)) {
    return intentFromMode(readings.mode && readings.mode.value, curves.mode)
  }
  return undefined
}
