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

export function parseSource (value: any): LightSource {
  if (SOURCES.indexOf(value) !== -1) {
    return value
  }
  return DEFAULT_SOURCE
}

export function intentFromMode (value: any): SourceIntent | undefined {
  if (value === 'night') {
    return MODE_CURVE.night
  }
  if (typeof value === 'string') {
    return MODE_CURVE.day
  }
  return undefined
}

export function intentFromSun (value: any): SourceIntent | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return SUN_CURVE[value]
}

export function intentFromLux (value: any): SourceIntent | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !isFinite(n) || n < 0) {
    return undefined
  }
  for (let i = 0; i < LUX_CURVE.length; i++) {
    const bin = LUX_CURVE[i]
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
