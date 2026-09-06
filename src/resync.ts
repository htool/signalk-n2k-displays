export const DEFAULT_RESYNC_TIMEOUT = 60

export type ResyncTrigger = {
  path: string
  source?: string
  timeout?: number
}

export function configuredResyncTriggers (props: any): ResyncTrigger[] {
  const list = props && props.resync
  if (!Array.isArray(list)) {
    return []
  }
  return list.filter(function (item: any) {
    return item && typeof item.path === 'string' && item.path.length > 0
  })
}

export function deltaSourceId (update: any, delta?: any): string {
  const raw =
    (update && update.source) ||
    (delta && delta.source) ||
    (update && update['$source'])
  if (typeof raw === 'string' && raw) {
    return raw
  }
  if (raw && typeof raw === 'object') {
    return fromSourceObject(raw)
  }
  return 'unknown'
}

function fromSourceObject (raw: any): string {
  const label = raw.label || 'unknown'
  const src =
    raw.src !== undefined && raw.src !== null && raw.src !== ''
      ? String(raw.src)
      : ''
  return src !== '' ? `${label}.${src}` : label
}

export function sourceMatches (
  triggerSource: string | undefined,
  actual: string
): boolean {
  if (!triggerSource) {
    return true
  }
  return triggerSource === actual
}

export function shouldResync (
  lastSeen: number | undefined,
  now: number,
  timeoutSec?: number
): boolean {
  const timeoutMs = (timeoutSec || DEFAULT_RESYNC_TIMEOUT) * 1000
  return lastSeen === undefined || now - lastSeen > timeoutMs
}

export function resyncTrackerKey (sourceId: string, path: string): string {
  return `${sourceId}_${path}`
}
