import * as fs from 'fs'
import * as path from 'path'

export const INTENT_PATHS = {
  brightness: 'electrical.displays.brightness',
  mode: 'electrical.displays.mode',
  control: 'electrical.displays.control'
}

export const MODES = ['day', 'night'] as const
export const CONTROLS = ['off', 'auto', 'auto-learning'] as const

export type DisplayMode = typeof MODES[number]
export type DisplayControl = typeof CONTROLS[number]

export const DEFAULTS = {
  brightness: 1,
  mode: 'day' as DisplayMode,
  control: 'off' as DisplayControl
}

export type IntentState = {
  brightness: number
  mode: DisplayMode
  control: DisplayControl
}

export type PutResult =
  | { ok: true; value: number | DisplayMode | DisplayControl }
  | { ok: false; message: string }

export function quantizeBrightness (value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return Math.round(clamped * 10) / 10
}

function isMode (value: any): value is DisplayMode {
  return MODES.indexOf(value) !== -1
}

function isControl (value: any): value is DisplayControl {
  return CONTROLS.indexOf(value) !== -1
}

export function parseIntentPut (path: string, value: any): PutResult {
  if (path === INTENT_PATHS.brightness) {
    const n = typeof value === 'string' ? Number(value) : value
    if (typeof n !== 'number' || !isFinite(n)) {
      return { ok: false, message: 'brightness must be a number 0–1' }
    }
    return { ok: true, value: quantizeBrightness(n) }
  }
  if (path === INTENT_PATHS.mode) {
    if (!isMode(value)) {
      return { ok: false, message: 'mode must be day or night' }
    }
    return { ok: true, value }
  }
  if (path === INTENT_PATHS.control) {
    if (!isControl(value)) {
      return { ok: false, message: 'control must be off, auto, or auto-learning' }
    }
    return { ok: true, value }
  }
  return { ok: false, message: `not an intent path: ${path}` }
}

export function intentPath (dataDir: string): string {
  return path.join(dataDir, 'intent.json')
}

export function loadIntent (dataDir: string): IntentState {
  const file = intentPath(dataDir)
  if (!fs.existsSync(file)) {
    return { ...DEFAULTS }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const brightness = parseIntentPut(
      INTENT_PATHS.brightness,
      parsed && parsed.brightness
    )
    const mode = parseIntentPut(INTENT_PATHS.mode, parsed && parsed.mode)
    const control = parseIntentPut(
      INTENT_PATHS.control,
      parsed && parsed.control
    )
    return {
      brightness: brightness.ok
        ? (brightness.value as number)
        : DEFAULTS.brightness,
      mode: mode.ok ? (mode.value as DisplayMode) : DEFAULTS.mode,
      control: control.ok ? (control.value as DisplayControl) : DEFAULTS.control
    }
  } catch (err) {
    return { ...DEFAULTS }
  }
}

export function saveIntent (dataDir: string, intent: IntentState): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(
    intentPath(dataDir),
    JSON.stringify(
      {
        brightness: quantizeBrightness(intent.brightness),
        mode: intent.mode,
        control: intent.control
      },
      null,
      2
    ) + '\n'
  )
}

export function intentDelta (path: string, value: any, meta: any) {
  return {
    updates: [
      {
        values: [{ path, value }],
        meta: [{ path, value: meta }]
      }
    ]
  }
}

export const INTENT_META: { [path: string]: any } = {
  [INTENT_PATHS.brightness]: {
    displayName: 'Display brightness intent',
    description: 'Skipper brightness 0–1 in 0.1 steps. Not a vendor native scale.',
    units: 'ratio',
    range: [0, 1]
  },
  [INTENT_PATHS.mode]: {
    displayName: 'Display mode intent',
    enum: ['day', 'night'],
    possibleValues: [
      { title: 'Day', value: 'day' },
      { title: 'Night', value: 'night' }
    ]
  },
  [INTENT_PATHS.control]: {
    displayName: 'Display lighting control',
    enum: ['off', 'auto', 'auto-learning'],
    possibleValues: [
      { title: 'Off', value: 'off' },
      { title: 'Auto', value: 'auto' },
      { title: 'Auto-learning', value: 'auto-learning' }
    ]
  }
}
