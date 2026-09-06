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
  DEFAULTS,
  DisplayControl,
  DisplayMode,
  INTENT_META,
  INTENT_PATHS,
  intentDelta,
  parseIntentPut
} from './intent'
import {
  BrightnessMaps,
  deviceId,
  emptyMaps,
  loadMaps,
  mappedNative,
  mappedPalette,
  nativeNightModeState,
  shouldApplyMaps
} from './maps'
import {
  DEFAULT_LUX_PATH,
  parseSource,
  SourceIntent,
  intentFromLux,
  intentFromMode,
  intentFromSun
} from './source'
import {
  configuredResyncTriggers,
  deltaSourceId,
  resyncTrackerKey,
  shouldResync,
  sourceMatches
} from './resync'

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let props: any
  let onStop: any = []
  let maps: BrightnessMaps = emptyMaps()
  let intentState = {
    brightness: DEFAULTS.brightness,
    mode: DEFAULTS.mode,
    control: DEFAULTS.control
  }
  let lastReadings: { mode?: any; sun?: any; lux?: any } = {}
  let lastSourceBin: string | undefined
  let lastSeen: { [key: string]: number } = {}
  let hasApplied = false

  const plugin: Plugin = {
    start: function (properties: any) {
      props = properties
      maps =
        typeof app.getDataDirPath === 'function'
          ? loadMaps(app.getDataDirPath())
          : emptyMaps()
      intentState = {
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

      setupSimradBrightness()
      setupSimradNightColor()
      setupSimradNightMode()

      if (app.subscriptionmanager) {
        subscribeToSources()
      }

      if (properties.groupMappings && properties.groupMappings.length > 0) {
        subscribeToSimnet(properties)
        subscribeToRaymarine(properties)
      }
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
      const schema: any = {
        type: 'object',
        required: ['raymarineDayColor', 'raymarineNightColor'],
        properties: {
          raymarineNightColor: {
            type: 'string',
            title: 'Raymarine Night Color',
            enum: Object.keys(raymarineColorMap),
            enumNames: Object.values(raymarineColorMap),
            default: 'red/black'
          },
          raymarineDayColor: {
            type: 'string',
            title: 'Raymarine Day Color',
            enum: Object.keys(raymarineColorMap),
            enumNames: Object.values(raymarineColorMap),
            default: 'day1'
          },
          source: {
            type: 'string',
            title: 'Light steering source',
            description:
              'Used when control is auto or auto-learning. Time is environment.mode (derived-data).',
            enum: ['mode', 'sun', 'lux'],
            enumNames: [
              'Time (environment.mode)',
              'Sun (environment.sun)',
              'Lux'
            ],
            default: 'mode'
          },
          luxPath: {
            type: 'string',
            title: 'Path to outside lux',
            default: DEFAULT_LUX_PATH
          },
          resync: {
            title: 'Device power-on resync',
            description:
              'Re-apply last intent when a device path appears after silence (e.g. chartplotter boot). Path and source are case sensitive.',
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
          },
          navicoGroups: {
            title: 'Enabled Navico Groups',
            type: 'object',
            properties: {}
          },
          raymarineGroups: {
            title: 'Enabled Raymarine Groups',
            type: 'object',
            properties: {}
          },
          groupMappings: {
            title: 'Display Group Mappings',
            description:
              'If you setup a mapping, the display settings will be kept in sync between your Raymarine and Navico devices in those groups',
            type: 'array',
            items: {
              type: 'object',
              required: ['raymarineGroup', 'simradGroup'],
              properties: {
                raymarineGroup: {
                  type: 'string',
                  title: 'Raymarine Group',
                  enum: Object.keys(raymarineDisplayGroups),
                  enumNames: Object.values(raymarineDisplayGroups)
                },
                simradGroup: {
                  type: 'string',
                  title: 'Navico Group',
                  enum: Object.keys(simradDisplayGroups),
                  enumNames: Object.values(simradDisplayGroups)
                }
              }
            }
          }
        }
      }
      Object.keys(simradDisplayGroups).forEach(key => {
        let name = simradDisplayGroups[key]
        schema.properties.navicoGroups.properties[key] = {
          type: 'boolean',
          title: `${name}`,
          default: true
        }
      })
      Object.keys(raymarineDisplayGroups).forEach(key => {
        let name = raymarineDisplayGroups[key]
        schema.properties.raymarineGroups.properties[key] = {
          type: 'boolean',
          title: `${name}`,
          default: true
        }
      })
      return schema
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

  function setupIntentPaths () {
    const initial: { [path: string]: any } = {
      [INTENT_PATHS.brightness]: DEFAULTS.brightness,
      [INTENT_PATHS.mode]: DEFAULTS.mode,
      [INTENT_PATHS.control]: DEFAULTS.control
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
          app.handleMessage(
            plugin.id,
            intentDelta(putPath, parsed.value, INTENT_META[putPath])
          )
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
            applyBrightnessMaps()
            if (putPath !== INTENT_PATHS.brightness) {
              applyPaletteMaps()
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
  }

  function setupRaymarineColor () {
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        props.raymarineGroups !== undefined &&
        props.raymarineGroups[group] !== undefined &&
        props.raymarineGroups[group] === false
      ) {
        return
      }
      
      let path = `electrical.displays.raymarine.${group}.color`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayColor(group, value)
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
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        props.raymarineGroups !== undefined &&
        props.raymarineGroups[group] !== undefined &&
        props.raymarineGroups[group] === false
      ) {
        return
      }

      let path = `electrical.displays.raymarine.${group}.brightness`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setRaymarineDisplayBrightness(group, value)
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

          const mapping = props.groupMappings.find((mapping: any) => {
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
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (
        props.raymarineGroups !== undefined &&
        props.raymarineGroups[group] !== undefined &&
        props.raymarineGroups[group] === false
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
          const mapping = props.groupMappings.find((mapping: any) => {
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

  function setupSimradNightColor () {
    Object.keys(simradDisplayGroups).forEach(group => {
      if (
        props.navicoGroups !== undefined &&
        props.navicoGroups[group] !== undefined &&
        props.navicoGroups[group] === false
      ) {
        return
      }
      let path = `electrical.displays.navico.${group}.nightModeColor`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayNightColor(group, value)
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
        props.navicoGroups !== undefined &&
        props.navicoGroups[group] !== undefined &&
        props.navicoGroups[group] === false
      ) {
        return
      }

      let path = `electrical.displays.navico.${group}.brightness`
      app.registerPutHandler(
        'vessels.self',
        path,
        (context: string, path: string, value: any, cb: any) => {
          setSimradDisplayBrightness(group, value)
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
          const mapping = props.groupMappings.find((mapping: any) => {
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
        props.navicoGroups !== undefined &&
        props.navicoGroups[group] !== undefined &&
        props.navicoGroups[group] === false
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
          const mapping = props.groupMappings.find((mapping: any) => {
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

  function applyBrightnessMaps (force?: boolean) {
    if (!force && !shouldApplyMaps(intentState.control)) {
      return
    }
    hasApplied = true
    Object.keys(simradDisplayGroups).forEach(group => {
      if (!groupEnabled(props.navicoGroups, group)) {
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
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (!groupEnabled(props.raymarineGroups, group)) {
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

  function applyPaletteMaps (force?: boolean) {
    if (!force && !shouldApplyMaps(intentState.control)) {
      return
    }
    const nightState = nativeNightModeState(intentState.mode)
    const rayDefaults = {
      day: props.raymarineDayColor,
      night: props.raymarineNightColor
    }
    Object.keys(simradDisplayGroups).forEach(group => {
      if (!groupEnabled(props.navicoGroups, group)) {
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
    Object.keys(raymarineDisplayGroups).forEach(group => {
      if (!groupEnabled(props.raymarineGroups, group)) {
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

  function luxPath (): string {
    return (props && props.luxPath) || DEFAULT_LUX_PATH
  }

  function sourceIntentFromReadings (): SourceIntent | undefined {
    const source = parseSource(props && props.source)
    if (source === 'sun') {
      return intentFromSun(lastReadings.sun)
    }
    if (source === 'lux') {
      return intentFromLux(lastReadings.lux)
    }
    return intentFromMode(lastReadings.mode)
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
              lastReadings.mode = vp.value
            } else if (vp.path === 'environment.sun') {
              lastReadings.sun = vp.value
            } else if (vp.path === configuredLux) {
              lastReadings.lux = vp.value
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
    const dayColor = props.raymarineDayColor || 'day1'
    const nightColor = props.raymarineNightColor || 'red/black'
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

  function subscribeToSimnet (properties: any) {
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
                const mapping = properties.groupMappings.find(
                  (mapping: any) => {
                    return mapping.simradGroup === group
                  }
                )
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

  function subscribeToRaymarine (properties: any) {
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
                const mapping = properties.groupMappings.find(
                  (mapping: any) => {
                    return mapping.raymarineGroup === group
                  }
                )
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
                  let isNightMode = properties.raymarineNightColor
                    ? value === properties.raymarineNightColor
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
  [key: string]: SimnetNightModeColor | number
} = {
  red: SimnetNightModeColor.Red,
  green: SimnetNightModeColor.Green,
  blue: SimnetNightModeColor.Blue,
  white: SimnetNightModeColor.White,
  magenta: 4
}

interface Plugin {
  start: (app: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}
