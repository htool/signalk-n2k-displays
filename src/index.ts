/*
 * Copyright 2021 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  SeatalkNetworkGroup,
  SeatalkDisplayColor,
  SimnetDisplayGroup,
  SimnetNightModeColor
} from '@canboat/ts-pgns'
import {
  COMPAT_META,
  COMPAT_PATHS,
  DEFAULTS,
  DisplayControl,
  DisplayMode,
  INTENT_META,
  INTENT_PATHS,
  displayModeBlob,
  intentDelta,
  loadIntent,
  parseCompatPut,
  parseIntentPut,
  saveIntent
} from './intent'
import {
  BrightnessMaps,
  deviceId,
  emptyMaps,
  loadMaps,
  mappedNative,
  mappedPalette,
  nativeNightModeState,
  saveMaps,
  shouldApplyMaps,
  shouldLearn,
  storeNativeCell,
  storePaletteCell
} from './maps'
import {
  mappingTables,
  saveMapping,
  SUN_LABELS
} from './mapping'
import {
  DEFAULT_LUX_PATH,
  LUX_CURVE,
  SOURCE_BRIGHTNESS_NAMES,
  SOURCE_BRIGHTNESS_STEPS,
  SUN_BINS,
  SUN_CURVE,
  SourceCurves,
  SourceIntent,
  SourceReadings,
  curvesFromPluginConfig,
  defaultSourceCurves,
  intentFromCascade,
  loadSourceCurves,
  pluginConfigFromCurves,
  saveSourceCurves
} from './source'
import {
  configuredResyncTriggers,
  deltaSourceId,
  resyncTrackerKey,
  shouldResync,
  sourceMatches
} from './resync'

function brightnessField (title: string, defaultValue: number) {
  return {
    type: 'number',
    title,
    enum: SOURCE_BRIGHTNESS_STEPS,
    enumNames: SOURCE_BRIGHTNESS_NAMES,
    default: defaultValue
  }
}

function sunSchemaProperties () {
  const properties: any = {}
  SUN_BINS.forEach(bin => {
    const def = SUN_CURVE[bin]
    properties[bin] = {
      type: 'object',
      title: SUN_LABELS[bin] || bin,
      properties: {
        mode: {
          type: 'string',
          title: 'Mode',
          enum: ['day', 'night'],
          enumNames: ['Day', 'Night'],
          default: def.mode
        },
        brightness: brightnessField('Brightness', def.brightness)
      }
    }
  })
  return properties
}

function normalizeInstrumentConfig (properties: any): any {
  const cfg = properties || {}
  const ray = cfg.raymarine || {}
  const nav = cfg.navico || {}
  if (ray.groups && cfg.raymarineGroups === undefined) {
    cfg.raymarineGroups = ray.groups
  }
  if (nav.groups && cfg.navicoGroups === undefined) {
    cfg.navicoGroups = nav.groups
  }
  if (ray.groupMappings && cfg.groupMappings === undefined) {
    cfg.groupMappings = ray.groupMappings
  }
  if (
    (ray.i70 !== undefined || ray.st60 !== undefined) &&
    cfg.raymarineProducts === undefined
  ) {
    cfg.raymarineProducts = { i70: ray.i70, st60: ray.st60 }
  }
  if (ray.dayColor != null && cfg.raymarineDayColor === undefined) {
    cfg.raymarineDayColor = ray.dayColor
  }
  if (ray.nightColor != null && cfg.raymarineNightColor === undefined) {
    cfg.raymarineNightColor = ray.nightColor
  }
  return cfg
}

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let props: any
  let onStop: any = []
  let maps: BrightnessMaps = emptyMaps()
  let sourceCurves: SourceCurves = defaultSourceCurves()
  let intentState = {
    brightness: DEFAULTS.brightness,
    mode: DEFAULTS.mode,
    control: DEFAULTS.control
  }
  let lastReadings: SourceReadings = {}
  let lastSourceBin: string | undefined
  let lastSeen: { [key: string]: number } = {}
  let hasApplied = false

  const plugin: Plugin = {
    start: function (properties: any) {
      props = normalizeInstrumentConfig(properties)
      maps =
        typeof app.getDataDirPath === 'function'
          ? loadMaps(app.getDataDirPath())
          : emptyMaps()
      sourceCurves =
        curvesFromPluginConfig(properties) ||
        (typeof app.getDataDirPath === 'function'
          ? loadSourceCurves(app.getDataDirPath())
          : defaultSourceCurves())
      intentState =
        typeof app.getDataDirPath === 'function'
          ? loadIntent(app.getDataDirPath())
          : {
              brightness: DEFAULTS.brightness,
              mode: DEFAULTS.mode,
              control: DEFAULTS.control
            }
      lastReadings = {}
      lastSourceBin = undefined
      lastSeen = {}
      hasApplied = false
      setupIntentPaths()
      setupRaymarineBrightness()
      setupRaymarineColor()
      setupRaymarineNightMode()
      setupRaymarineSt60Brightness()

      setupSimradBrightness()
      setupSimradNightColor()
      setupSimradNightMode()

      if (app.subscriptionmanager) {
        subscribeToSources()
      }

      if (groupMappings().length > 0) {
        subscribeToSimnet()
        if (raymarineI70Enabled()) {
          subscribeToRaymarine()
        }
      }
      applyStartMapping()
    },

    stop: function () {
      onStop.forEach((f: any) => f())
      onStop = []
    },

    id: 'signalk-n2k-displays',
    name: 'NMEA 2000 Display Control',
    description:
      'Signal K Plugin that controls and syncs display devices from Raymarine and Navico devices',

    schema: () => {
      const i70Groups: any = {
        title: 'i70 network groups',
        description: 'i70 / STNG only. Unused for ST60.',
        type: 'object',
        properties: {}
      }
      const navicoGroups: any = {
        title: 'Enabled groups',
        type: 'object',
        properties: {}
      }
      Object.keys(raymarineDisplayGroups).forEach(key => {
        i70Groups.properties[key] = {
          type: 'boolean',
          title: `${raymarineDisplayGroups[key]}`,
          default: true
        }
      })
      Object.keys(simradDisplayGroups).forEach(key => {
        navicoGroups.properties[key] = {
          type: 'boolean',
          title: `${simradDisplayGroups[key]}`,
          default: true
        }
      })
      return {
        type: 'object',
        properties: {
          raymarine: {
            title: 'Raymarine ST60 / i70',
            description:
              'ST60 is a bus-wide SeaTalk1 lamp (L0–L3). i70 uses STNG network groups and day/night color.',
            type: 'object',
            properties: {
              st60: {
                type: 'boolean',
                title: 'ST60 / SeaTalk1',
                description:
                  'Instrument lamp only. One brightness for the whole SeaTalk1 bus; ignores i70 groups and colors.',
                default: true
              },
              i70: {
                type: 'boolean',
                title: 'i70 / STNG',
                description:
                  'Shared brightness and color. Uses i70 day/night colors and i70 network groups below.',
                default: true
              },
              dayColor: {
                type: 'string',
                title: 'i70 day color',
                description: 'i70 / STNG only. ST60 has no palette.',
                enum: Object.keys(raymarineColorMap),
                enumNames: Object.values(raymarineColorMap),
                default: 'day1'
              },
              nightColor: {
                type: 'string',
                title: 'i70 night color',
                description: 'i70 / STNG only. ST60 has no palette.',
                enum: Object.keys(raymarineColorMap),
                enumNames: Object.values(raymarineColorMap),
                default: 'red/black'
              },
              groups: i70Groups,
              groupMappings: {
                title: 'i70 ↔ Navico mappings',
                description:
                  'i70 / STNG only. Keep i70 network groups in sync with Navico groups. Unused for ST60.',
                type: 'array',
                items: {
                  type: 'object',
                  required: ['raymarineGroup', 'simradGroup'],
                  properties: {
                    raymarineGroup: {
                      type: 'string',
                      title: 'i70 network group',
                      enum: Object.keys(raymarineDisplayGroups),
                      enumNames: Object.values(raymarineDisplayGroups)
                    },
                    simradGroup: {
                      type: 'string',
                      title: 'Navico group',
                      enum: Object.keys(simradDisplayGroups),
                      enumNames: Object.values(simradDisplayGroups)
                    }
                  }
                }
              }
            }
          },
          navico: {
            title: 'Navico / B&G',
            type: 'object',
            properties: {
              groups: navicoGroups
            }
          },
          time: {
            title: 'Time (environment.mode)',
            description:
              'Brightness for vessel day and night. Same values as the webapp Time table.',
            type: 'object',
            properties: {
              day: brightnessField('Day brightness', 0.6),
              night: brightnessField('Night brightness', 0.3)
            }
          },
          sun: {
            title: 'Sun (environment.sun)',
            description:
              'Day/night and brightness for each sun bin. Same values as the webapp Sun table.',
            type: 'object',
            properties: sunSchemaProperties()
          },
          lux: {
            title: 'Lux',
            description:
              'Ranges for the lux path. Add or remove rows. Same table as the webapp. Empty max is unbounded.',
            type: 'object',
            properties: {
              table: {
                type: 'array',
                title: 'Lux ranges',
                default: LUX_CURVE.map(bin => ({
                  luxMin: bin.min,
                  luxMax: isFinite(bin.max) ? bin.max : undefined,
                  mode: bin.mode,
                  brightness: bin.brightness
                })),
                items: {
                  type: 'object',
                  properties: {
                    luxMin: {
                      type: 'number',
                      title: 'Min lux'
                    },
                    luxMax: {
                      type: 'number',
                      title: 'Max lux (empty = unbounded)'
                    },
                    mode: {
                      type: 'string',
                      title: 'Mode',
                      enum: ['day', 'night'],
                      enumNames: ['Day', 'Night'],
                      default: 'day'
                    },
                    brightness: brightnessField('Brightness', 0.2)
                  }
                }
              }
            }
          },
          luxPath: {
            type: 'string',
            title: 'Path to outside lux',
            default: DEFAULT_LUX_PATH
          },
          source: {
            type: 'string',
            title: 'Light steering source',
            description:
              'Unused. Auto uses lux, then sun, then time.',
            enum: ['mode', 'sun', 'lux'],
            enumNames: [
              'Time (environment.mode)',
              'Sun (environment.sun)',
              'Lux'
            ],
            default: 'lux'
          },
          resync: {
            title: 'Device power-on resync',
            description:
              'Re-apply last glass brightness and mode when a device path appears after silence (e.g. chartplotter boot). Path and source are case sensitive.',
            type: 'array',
            items: {
              type: 'object',
              required: ['path'],
              properties: {
                path: {
                  type: 'string',
                  title: 'Trigger path (e.g. navigation.currentRoute.name)',
                  default: ''
                },
                source: {
                  type: 'string',
                  title:
                    'Source ID (e.g. N2K.115). Leave empty to match any source.',
                  default: ''
                },
                timeout: {
                  type: 'number',
                  title:
                    'Inactivity timeout (seconds). Resend if data is seen after this many seconds of silence.',
                  default: 60
                }
              }
            }
          }
        }
      }
    },

    registerWithRouter: function (router: any) {
      router.get('/mapping', (_req: any, res: any) => {
        res.json(mappingPayload())
      })
      router.put('/mapping', (req: any, res: any) => {
        const body = req.body || {}
        if (!Array.isArray(body.time) || !Array.isArray(body.sun) || !Array.isArray(body.lux)) {
          res.status(400)
          res.json({ message: 'time, sun, and lux tables required' })
          return
        }
        const saved = saveMapping(
          {
            time: body.time || [],
            sun: body.sun || [],
            lux: body.lux || [],
            native: Array.isArray(body.native) ? body.native : [],
            palettes:
              body.palettes && typeof body.palettes === 'object'
                ? {
                    navicoNight: String(body.palettes.navicoNight || ''),
                    raymarineNight: String(body.palettes.raymarineNight || '')
                  }
                : undefined
          },
          enabledVendorIds('navico'),
          enabledVendorIds('raymarine'),
          maps
        )
        if (!saved.ok) {
          res.status(400)
          res.json({ message: saved.message })
          return
        }
        sourceCurves = saved.curves
        maps = saved.maps
        persistCurves()
        persistMaps()
        applySourceFromReadings(true)
        res.json(mappingPayload())
      })
    }
  }

  function getDisplayGroupName (path: string) {
    //electrical.displays.simrad.default.brightness
    let parts = path.split('.')
    return parts[3]
  }

  function getKeyName (path: string) {
    let parts = path.split('.')
    if (parts[parts.length - 1] === 'state') {
      return parts[parts.length - 2] + '.' + parts[parts.length - 1]
    } else {
      return parts[parts.length - 1]
    }
  }

  function dataDir (): string | undefined {
    return typeof app.getDataDirPath === 'function'
      ? app.getDataDirPath()
      : undefined
  }

  function persistIntent () {
    const dir = dataDir()
    if (dir) {
      saveIntent(dir, intentState)
    }
  }

  function persistMaps () {
    const dir = dataDir()
    if (dir) {
      saveMaps(dir, maps)
    }
  }

  function persistCurves () {
    const config = pluginConfigFromCurves(sourceCurves, luxPath())
    props = Object.assign({}, props || {}, config)
    if (typeof app.savePluginOptions === 'function') {
      app.savePluginOptions(props, () => {})
    }
    const dir = dataDir()
    if (dir) {
      saveSourceCurves(dir, sourceCurves)
    }
  }

  function enabledVendorIds (vendor: 'navico' | 'raymarine'): string[] {
    if (vendor === 'raymarine' && !raymarineI70Enabled()) {
      return []
    }
    const groups =
      vendor === 'navico' ? simradDisplayGroups : raymarineDisplayGroups
    const config =
      vendor === 'navico' ? navicoGroupsConfig() : raymarineGroupsConfig()
    return Object.keys(groups)
      .filter(group => groupEnabled(config, group))
      .map(group => deviceId(vendor, group))
  }

  function mappingPayload () {
    const path = luxPath()
    const tables = mappingTables(
      sourceCurves,
      maps,
      enabledVendorIds('navico'),
      enabledVendorIds('raymarine')
    )
    return {
      luxPath: path,
      luxAvailable: luxPathPresent(path),
      time: tables.time,
      sun: tables.sun,
      lux: tables.lux,
      native: tables.native,
      palettes: tables.palettes
    }
  }

  function luxPathPresent (path: string): boolean {
    if (!path) {
      return false
    }
    if (lastReadings.lux) {
      return true
    }
    if (typeof app.getSelfPath !== 'function') {
      return false
    }
    const node = app.getSelfPath(path)
    if (node === undefined || node === null) {
      return false
    }
    if (typeof node === 'object' && !Array.isArray(node) && node.value === undefined) {
      return false
    }
    return true
  }

  function groupMappings (): any[] {
    if (props && props.raymarine && props.raymarine.groupMappings) {
      return props.raymarine.groupMappings
    }
    return (props && props.groupMappings) || []
  }

  function navicoGroupsConfig (): any {
    if (props && props.navico && props.navico.groups) {
      return props.navico.groups
    }
    return props && props.navicoGroups
  }

  function raymarineGroupsConfig (): any {
    if (props && props.raymarine && props.raymarine.groups) {
      return props.raymarine.groups
    }
    return props && props.raymarineGroups
  }

  function learnNative (vendor: string, group: string, native: number) {
    if (!shouldLearn(intentState.control)) {
      return
    }
    storeNativeCell(
      maps,
      deviceId(vendor, group),
      intentState.mode,
      intentState.brightness,
      native
    )
    persistMaps()
  }

  function learnPalette (vendor: string, group: string, color: string) {
    if (!shouldLearn(intentState.control)) {
      return
    }
    if (
      storePaletteCell(maps, deviceId(vendor, group), intentState.mode, color)
    ) {
      persistMaps()
    }
  }

  function setupIntentPaths () {
    const initial: { [path: string]: any } = {
      [INTENT_PATHS.brightness]: intentState.brightness,
      [INTENT_PATHS.mode]: intentState.mode,
      [INTENT_PATHS.control]: intentState.control
    }
    Object.keys(initial).forEach(path => {
      app.registerPutHandler(
        'vessels.self',
        path,
        (_context: string, putPath: string, value: any) => {
          const parsed = parseIntentPut(putPath, value)
          if (!parsed.ok) {
            return {
              state: 'COMPLETED',
              statusCode: 400,
              message: parsed.message
            }
          }
          if (putPath === INTENT_PATHS.brightness) {
            intentState.brightness = parsed.value as number
          } else if (putPath === INTENT_PATHS.mode) {
            intentState.mode = parsed.value as DisplayMode
          } else if (putPath === INTENT_PATHS.control) {
            intentState.control = parsed.value as DisplayControl
          }
          persistIntent()
          app.handleMessage(
            plugin.id,
            intentDelta(putPath, parsed.value, INTENT_META[putPath])
          )
          publishCompatBlob()
          if (shouldApplyMaps(intentState.control)) {
            if (
              putPath === INTENT_PATHS.control &&
              applySourceFromReadings(true)
            ) {
              return {
                state: 'COMPLETED',
                statusCode: 200
              }
            }
          }
          if (
            shouldApplyMaps(intentState.control) ||
            putPath === INTENT_PATHS.brightness ||
            putPath === INTENT_PATHS.mode
          ) {
            applyBrightnessMaps(true)
            if (putPath !== INTENT_PATHS.brightness) {
              applyPaletteMaps(true)
            }
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(
        plugin.id,
        intentDelta(path, initial[path], INTENT_META[path])
      )
    })
    setupCompatDisplayMode()
  }

  function publishCompatBlob () {
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: COMPAT_PATHS.blob,
              value: displayModeBlob(intentState)
            }
          ],
          meta: [{ path: COMPAT_PATHS.blob, value: COMPAT_META }]
        }
      ]
    })
  }

  function applyCompatPut (value: any) {
    const parsed = parseCompatPut(value)
    if (!parsed.ok) {
      return {
        state: 'COMPLETED',
        statusCode: 400,
        message: parsed.message
      }
    }
    intentState.mode = parsed.mode
    intentState.brightness = parsed.brightness
    persistIntent()
    publishIntentState()
    applyBrightnessMaps(true)
    applyPaletteMaps(true)
    return {
      state: 'COMPLETED',
      statusCode: 200
    }
  }

  function setupCompatDisplayMode () {
    app.registerPutHandler(
      'vessels.self',
      COMPAT_PATHS.control,
      (_context: string, _path: string, value: any) => applyCompatPut(value)
    )
    app.registerPutHandler(
      'vessels.self',
      COMPAT_PATHS.blob,
      (_context: string, _path: string, value: any) => applyCompatPut(value)
    )
    publishCompatBlob()
  }

  function setupRaymarineColor () {
    if (!raymarineI70Enabled()) {
      return
    }
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        !groupEnabled(raymarineGroupsConfig(), group)
      ) {
        return
      }
      
      let path = `electrical.displays.raymarine.${group}.color`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayColor(group, value)
          learnPalette('raymarine', group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 'day1'
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${raymarineDisplayGroups[group]} Color`,
                  possibleValues: [
                    ...Object.keys(raymarineColorMap).map((color: any) => {
                      return {
                        title: raymarineColorMap[color],
                        value: color
                      }
                    })
                  ],
                  enum: [...Object.keys(raymarineColorMap)]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupRaymarineBrightness () {
    if (!raymarineI70Enabled()) {
      return
    }
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        !groupEnabled(raymarineGroupsConfig(), group)
      ) {
        return
      }

      let path = `electrical.displays.raymarine.${group}.brightness`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayBrightness(group, value)
          learnNative('raymarine', group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })

          const mapping = groupMappings().find((mapping: any) => {
            return mapping.raymarineGroup === group
          })
          if (mapping) {
            setSimradDisplayBrightness(mapping.simradGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${raymarineDisplayGroups[group]} Brightness`,
                  units: 'ratio',
                  range: [0, 1]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupRaymarineNightMode () {
    if (!raymarineI70Enabled()) {
      return
    }
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        !groupEnabled(raymarineGroupsConfig(), group)
      ) {
        return
      }

      let path = `electrical.displays.raymarine.${group}.nightMode.state`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayColor(group, value === 1 ? 'red/black' : 'day1')
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          const mapping = groupMappings().find((mapping: any) => {
            return mapping.raymarineGroup === group
          })
          if (mapping) {
            setSimradDisplayNightMode(mapping.simradGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `Raymarine ${raymarineDisplayGroups[group]} Night Mode`,
                  units: 'bool'
                }
              },
              {
                path: `electrical.displays.raymarine.${group}.nightMode`,
                value: {
                  displayName: `Raymarin ${raymarineDisplayGroups[group]} Night Mode`
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupRaymarineSt60Brightness () {
    if (!raymarineST60Enabled()) {
      return
    }
    const path = 'electrical.displays.raymarine.st60.brightness'
    app.registerPutHandler(
      'vessels.self',
      path,
      (_context: string, _path: string, value: any) => {
        setRaymarineDisplayBrightness('st60', value)
        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [
                {
                  path,
                  value: value
                }
              ]
            }
          ]
        })
        return {
          state: 'COMPLETED',
          statusCode: 200
        }
      }
    )
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path,
              value: 0
            }
          ],
          meta: [
            {
              path,
              value: {
                displayName: 'ST60 lamp',
                units: 'ratio',
                range: [0, 1]
              }
            }
          ]
        }
      ]
    })
  }

  function setupSimradNightColor () {
    Object.keys(simradDisplayGroups).forEach(group => {
      if (
        !groupEnabled(navicoGroupsConfig(), group)
      ) {
        return
      }
      let path = `electrical.displays.navico.${group}.nightModeColor`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayNightColor(group, value)
          learnPalette('navico', group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 'red'
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${simradDisplayGroups[group]} Night Color`,
                  possibleValues: [
                    ...Object.keys(simradDisplayNightColors).map(
                      (color: any) => {
                        return {
                          title: color.charAt(0).toUpperCase() + color.slice(1),
                          value: color
                        }
                      }
                    )
                  ],
                  enum: [...Object.keys(simradDisplayNightColors)]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupSimradBrightness () {
    Object.keys(simradDisplayGroups).forEach(group => {
      if (
        !groupEnabled(navicoGroupsConfig(), group)
      ) {
        return
      }

      let path = `electrical.displays.navico.${group}.brightness`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayBrightness(group, value)
          learnNative('navico', group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          const mapping = groupMappings().find((mapping: any) => {
            return mapping.simradGroup === group
          })
          if (mapping) {
            setRaymarineDisplayBrightness(mapping.raymarineGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `${simradDisplayGroups[group]} Brightness`,
                  units: 'ratio',
                  range: [0, 1]
                }
              }
            ]
          }
        ]
      })
    })
  }

  function setupSimradNightMode () {
    Object.keys(simradDisplayGroups).forEach(group => {
      if (
        !groupEnabled(navicoGroupsConfig(), group)
      ) {
        return
      }

      let path = `electrical.displays.navico.${group}.nightMode.state`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayNightMode(group, value)
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path,
                    value: value
                  }
                ]
              }
            ]
          })
          const mapping = groupMappings().find((mapping: any) => {
            return mapping.simradGroup === group
          })
          if (mapping) {
            setRaymarineDisplayNightMode(mapping.raymarineGroup, value)
          }
          return {
            state: 'COMPLETED',
            statusCode: 200
          }
        }
      )
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: 0
              }
            ],
            meta: [
              {
                path,
                value: {
                  displayName: `Navico ${simradDisplayGroups[group]} Night Mode`,
                  units: 'bool'
                }
              },
              {
                path: `electrical.displays.navico.${group}.nightMode`,
                value: {
                  displayName: `Navico ${simradDisplayGroups[group]} Night Mode`
                }
              }
            ]
          }
        ]
      })
    })
  }

  function groupEnabled (groupsConfig: any, group: string): boolean {
    return !(
      groupsConfig !== undefined &&
      groupsConfig[group] !== undefined &&
      groupsConfig[group] === false
    )
  }

  function raymarineI70Enabled (): boolean {
    const nested = props && props.raymarine
    if (nested && nested.i70 !== undefined) {
      return nested.i70 !== false
    }
    const products = props && props.raymarineProducts
    return !products || products.i70 !== false
  }

  function raymarineST60Enabled (): boolean {
    const nested = props && props.raymarine
    if (nested && nested.st60 !== undefined) {
      return nested.st60 === true
    }
    const products = props && props.raymarineProducts
    return !!(products && products.st60 === true)
  }

  function applyStartMapping () {
    applyBrightnessMaps(true)
    applyPaletteMaps(true)
  }

  function applyBrightnessMaps (force?: boolean) {
    if (!force && !shouldApplyMaps(intentState.control)) {
      return
    }
    hasApplied = true
    Object.keys(simradDisplayGroups).forEach(group => {
      if (!groupEnabled(navicoGroupsConfig(), group)) {
        return
      }
      setSimradDisplayBrightness(
        group,
        mappedNative(
          maps,
          deviceId('navico', group),
          intentState.mode,
          intentState.brightness
        )
      )
    })
    if (raymarineI70Enabled()) {
      Object.keys(raymarineDisplayGroups).forEach(group => {
        if (!groupEnabled(raymarineGroupsConfig(), group)) {
          return
        }
        setRaymarineDisplayBrightness(
          group,
          mappedNative(
            maps,
            deviceId('raymarine', group),
            intentState.mode,
            intentState.brightness
          )
        )
      })
    }
    if (raymarineST60Enabled()) {
      setRaymarineDisplayBrightness(
        'st60',
        mappedNative(
          maps,
          deviceId('raymarine', 'st60'),
          intentState.mode,
          intentState.brightness
        )
      )
    }
  }

  function applyPaletteMaps (force?: boolean) {
    if (!force && !shouldApplyMaps(intentState.control)) {
      return
    }
    const nightState = nativeNightModeState(intentState.mode)
    const rayDefaults = {
      day:
        (props.raymarine && props.raymarine.dayColor) ||
        props.raymarineDayColor,
      night:
        (props.raymarine && props.raymarine.nightColor) ||
        props.raymarineNightColor
    }
    Object.keys(simradDisplayGroups).forEach(group => {
      if (!groupEnabled(navicoGroupsConfig(), group)) {
        return
      }
      setSimradDisplayNightMode(group, nightState)
      const color = mappedPalette(
        maps,
        deviceId('navico', group),
        intentState.mode
      )
      if (color !== undefined) {
        setSimradDisplayNightColor(group, color)
      }
    })
    if (raymarineI70Enabled()) {
      Object.keys(raymarineDisplayGroups).forEach(group => {
        if (!groupEnabled(raymarineGroupsConfig(), group)) {
          return
        }
        publishVendorPath(
          `electrical.displays.raymarine.${group}.nightMode.state`,
          nightState
        )
        const color = mappedPalette(
          maps,
          deviceId('raymarine', group),
          intentState.mode,
          rayDefaults
        )
        if (color !== undefined) {
          setRaymarineDisplayColor(group, color)
        }
      })
    }
  }

  function luxPath (): string {
    return (
      (props && props.lux && props.lux.path) ||
      (props && props.luxPath) ||
      DEFAULT_LUX_PATH
    )
  }

  function sourceIntentFromReadings (): SourceIntent | undefined {
    return intentFromCascade(lastReadings, Date.now(), sourceCurves)
  }

  function publishIntentState () {
    app.handleMessage(
      plugin.id,
      intentDelta(
        INTENT_PATHS.brightness,
        intentState.brightness,
        INTENT_META[INTENT_PATHS.brightness]
      )
    )
    app.handleMessage(
      plugin.id,
      intentDelta(
        INTENT_PATHS.mode,
        intentState.mode,
        INTENT_META[INTENT_PATHS.mode]
      )
    )
    publishCompatBlob()
  }

  function applySourceFromReadings (force: boolean): boolean {
    if (!shouldApplyMaps(intentState.control)) {
      return false
    }
    const next = sourceIntentFromReadings()
    if (!next) {
      return false
    }
    if (!force && lastSourceBin === next.bin) {
      return false
    }
    const modeChanged = intentState.mode !== next.mode
    lastSourceBin = next.bin
    intentState.brightness = next.brightness
    intentState.mode = next.mode
    persistIntent()
    publishIntentState()
    applyBrightnessMaps()
    if (force || modeChanged) {
      applyPaletteMaps()
    }
    return true
  }

  function resyncLastIntent () {
    if (!hasApplied) {
      return
    }
    applyBrightnessMaps(true)
    applyPaletteMaps(true)
  }

  function considerResync (path: string, sourceId: string, now: number) {
    configuredResyncTriggers(props).forEach(trigger => {
      if (trigger.path !== path) {
        return
      }
      if (!sourceMatches(trigger.source, sourceId)) {
        return
      }
      const key = resyncTrackerKey(sourceId, path)
      if (shouldResync(lastSeen[key], now, trigger.timeout)) {
        resyncLastIntent()
      }
      lastSeen[key] = now
    })
  }

  function subscribeToSources () {
    const command: { context: string; subscribe: { path: string }[] } = {
      context: 'vessels.self',
      subscribe: [
        { path: 'environment.mode' },
        { path: 'environment.sun' },
        { path: luxPath() }
      ]
    }
    configuredResyncTriggers(props).forEach(trigger => {
      command.subscribe.push({ path: trigger.path })
    })
    app.subscriptionmanager.subscribe(
      command,
      onStop,
      subscription_error,
      (delta: any) => {
        if (!delta || !delta.updates) {
          return
        }
        const configuredLux = luxPath()
        const now = Date.now()
        delta.updates.forEach((update: any) => {
          if (update['$source'] === plugin.id) {
            return
          }
          const sourceId = deltaSourceId(update, delta)
          ;(update.values || []).forEach((vp: any) => {
            if (!vp || !vp.path) {
              return
            }
            considerResync(vp.path, sourceId, now)
            if (vp.path === 'environment.mode') {
              lastReadings.mode = { value: vp.value, seenAt: now }
            } else if (vp.path === 'environment.sun') {
              lastReadings.sun = { value: vp.value, seenAt: now }
            } else if (vp.path === configuredLux) {
              lastReadings.lux = { value: vp.value, seenAt: now }
            } else {
              return
            }
            applySourceFromReadings(false)
          })
        })
      }
    )
  }

  function publishVendorPath (path: string, value: any) {
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path,
              value
            }
          ]
        }
      ]
    })
  }

  function setRaymarineDisplayBrightness (group: string, value: number) {
    publishVendorPath(
      `electrical.displays.raymarine.${group}.brightness`,
      value
    )
  }

  function setRaymarineDisplayColor (group: string, value: string) {
    publishVendorPath(`electrical.displays.raymarine.${group}.color`, value)
  }

  function setRaymarineDisplayNightMode (group: string, value: number) {
    const dayColor =
      (props.raymarine && props.raymarine.dayColor) ||
      props.raymarineDayColor ||
      'day1'
    const nightColor =
      (props.raymarine && props.raymarine.nightColor) ||
      props.raymarineNightColor ||
      'red/black'
    setRaymarineDisplayColor(group, value === 1 ? nightColor : dayColor)
    publishVendorPath(
      `electrical.displays.raymarine.${group}.nightMode.state`,
      value
    )
  }

  function setSimradDisplayBrightness (group: string, value: number) {
    publishVendorPath(`electrical.displays.navico.${group}.brightness`, value)
  }

  function setSimradDisplayNightMode (group: string, value: number) {
    publishVendorPath(
      `electrical.displays.navico.${group}.nightMode.state`,
      value
    )
  }

  function setSimradDisplayNightColor (group: string, value: string) {
    publishVendorPath(
      `electrical.displays.navico.${group}.nightModeColor`,
      value
    )
  }

  function subscribeToSimnet () {
    let command = {
      context: 'vessels.self',
      subscribe: [
        {
          path: `electrical.displays.navico.*`,
          period: 1000
        }
      ]
    }

    app.debug('subscribe %j', command)

    app.subscriptionmanager.subscribe(
      command,
      onStop,
      subscription_error,
      (delta: any) => {
        delta.updates.forEach((update: any) => {
          if (update['$source'] !== plugin.id) {
            if (update.values) {
              update.values.forEach((vp: any) => {
                const path = vp.path
                if (!path) {
                  return
                }
                const value = vp.value
                const group = getDisplayGroupName(path)
                const mapping = groupMappings().find((mapping: any) => {
                  return mapping.simradGroup === group
                })
                if (mapping) {
                  const key = getKeyName(path)
                  const setter = raymarineSetter[key]
                  if (setter) {
                    app.debug(
                      'Syncing simnet %s %s to raymarine %s == %j',
                      group,
                      key,
                      mapping.raymarineGroup,
                      value
                    )
                    setter(mapping.raymarineGroup, value)
                  }
                }
              })
            }
          }
        })
      }
    )
  }

  function subscribeToRaymarine () {
    let command = {
      context: 'vessels.self',
      subscribe: [
        {
          path: `electrical.displays.raymarine.*`,
          period: 1000
        }
      ]
    }

    app.debug('subscribe raymarine %j', command)

    app.subscriptionmanager.subscribe(
      command,
      onStop,
      subscription_error,
      (delta: any) => {
        delta.updates.forEach((update: any) => {
          if (update['$source'] !== plugin.id) {
            if (update.values) {
              update.values.forEach((vp: any) => {
                const path = vp.path
                if (!path) {
                  return
                }
                const value = vp.value
                const group = getDisplayGroupName(path)
                const mapping = groupMappings().find((mapping: any) => {
                  return mapping.raymarineGroup === group
                })
                const key = getKeyName(path)
                if (mapping) {
                  const setter = simradSetter[key]
                  if (setter) {
                    app.debug(
                      'Syncing raymarine %s %s to simnet %s == %j',
                      group,
                      key,
                      mapping.raymarineGroup,
                      value
                    )
                    setter(mapping.simradGroup, value)
                  }
                }
                if (key === 'color') {
                  const nightColor =
                    (props.raymarine && props.raymarine.nightColor) ||
                    props.raymarineNightColor
                  let isNightMode = nightColor
                    ? value === nightColor
                      ? 1
                      : 0
                    : value === 'red/black'
                    ? 1
                    : 0
                  app.handleMessage(plugin.id, {
                    updates: [
                      {
                        values: [
                          {
                            path: `electrical.displays.raymarine.${group}.nightMode.state`,
                            value: isNightMode
                          }
                        ]
                      }
                    ]
                  })

                  if (mapping) {
                    setSimradDisplayNightMode(mapping.simradGroup, isNightMode)
                  }
                }
              })
            }
          }
        })
      }
    )
  }

  const raymarineSetter: any = {
    'nightMode.state': setRaymarineDisplayNightMode,
    brightness: setRaymarineDisplayBrightness
  }

  const simradSetter: any = {
    'nightMode.state': setSimradDisplayNightMode,
    brightness: setSimradDisplayBrightness
  }

  function subscription_error (err: any) {
    app.setPluginError(err)
  }

  return plugin
}

const raymarineDisplayGroups: { [key: string]: SeatalkNetworkGroup } = {
  none: SeatalkNetworkGroup.None,
  helm1: SeatalkNetworkGroup.Helm1,
  helm2: SeatalkNetworkGroup.Helm2,
  cockpit: SeatalkNetworkGroup.Cockpit,
  flybridge: SeatalkNetworkGroup.Flybridge,
  mast: SeatalkNetworkGroup.Mast,
  group1: SeatalkNetworkGroup.Group1,
  group2: SeatalkNetworkGroup.Group2,
  group3: SeatalkNetworkGroup.Group3,
  group4: SeatalkNetworkGroup.Group4,
  group5: SeatalkNetworkGroup.Group5
}

const raymarineColorMap: { [key: string]: SeatalkDisplayColor } = {
  day1: SeatalkDisplayColor.Day1,
  day2: SeatalkDisplayColor.Day2,
  'red/black': SeatalkDisplayColor.Redblack,
  inverse: SeatalkDisplayColor.Inverse
}

const simradDisplayGroups: { [key: string]: SimnetDisplayGroup } = {
  default: SimnetDisplayGroup.Default,
  group1: SimnetDisplayGroup.Group1,
  group2: SimnetDisplayGroup.Group2,
  group3: SimnetDisplayGroup.Group3,
  group4: SimnetDisplayGroup.Group4,
  group5: SimnetDisplayGroup.Group5,
  group6: SimnetDisplayGroup.Group6
}

const simradDisplayNightColors: {
  [key: string]: SimnetNightModeColor
} = {
  red: SimnetNightModeColor.Red,
  green: SimnetNightModeColor.Green,
  blue: SimnetNightModeColor.Blue,
  white: SimnetNightModeColor.White
}

interface Plugin {
  start: (app: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
  registerWithRouter?: (router: any) => void
}
