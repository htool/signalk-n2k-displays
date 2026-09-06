const fs = require('fs')
const os = require('os')
const path = require('path')
const chai = require('chai')
chai.Should()

const {
  DEFAULT_RESYNC_TIMEOUT,
  configuredResyncTriggers,
  deltaSourceId,
  resyncTrackerKey,
  shouldResync,
  sourceMatches
} = require('../dist/resync')
const { INTENT_PATHS } = require('../dist/intent')
const { mapsPath } = require('../dist/maps')
const createPlugin = require('../index')

function lastValue (messages, skPath) {
  let last
  for (const m of messages) {
    const updates = (m.delta && m.delta.updates) || []
    for (const u of updates) {
      for (const v of u.values || []) {
        if (v.path === skPath) {
          last = v.value
        }
      }
    }
  }
  return last
}

function countPath (messages, skPath) {
  let n = 0
  for (const m of messages) {
    const updates = (m.delta && m.delta.updates) || []
    for (const u of updates) {
      for (const v of u.values || []) {
        if (v.path === skPath) {
          n += 1
        }
      }
    }
  }
  return n
}

function mockApp (dataDir) {
  const puts = {}
  const messages = []
  const subscribers = []
  return {
    error: function () {},
    debug: function () {},
    registerPutHandler: function (_ctx, skPath, fn) {
      puts[skPath] = fn
    },
    handleMessage: function (id, delta) {
      messages.push({ id, delta })
    },
    getDataDirPath: function () {
      return dataDir
    },
    subscriptionmanager: {
      subscribe: function (_cmd, unsubs, _err, cb) {
        subscribers.push(cb)
        unsubs.push(function () {})
      }
    },
    emit: function (skPath, value, source) {
      subscribers.forEach(function (cb) {
        const update = {
          values: [{ path: skPath, value: value }]
        }
        if (source) {
          update.source = source
        }
        cb({ updates: [update] })
      })
    },
    puts,
    messages
  }
}

function enabledOnly (navico, raymarine, extra) {
  const navicoGroups = {
    default: false,
    group1: false,
    group2: false,
    group3: false,
    group4: false,
    group5: false,
    group6: false
  }
  navico.forEach(function (g) {
    navicoGroups[g] = true
  })
  const raymarineGroups = {
    none: false,
    helm1: false,
    helm2: false,
    cockpit: false,
    flybridge: false,
    mast: false,
    group1: false,
    group2: false,
    group3: false,
    group4: false,
    group5: false
  }
  raymarine.forEach(function (g) {
    raymarineGroups[g] = true
  })
  return Object.assign(
    { navicoGroups, raymarineGroups, groupMappings: [] },
    extra || {}
  )
}

describe('resync helpers', function () {
  it('defaults timeout to 60s and resyncs after silence', function () {
    DEFAULT_RESYNC_TIMEOUT.should.equal(60)
    shouldResync(undefined, 1000, 60).should.equal(true)
    shouldResync(1000, 2000, 60).should.equal(false)
    shouldResync(1000, 1000 + 60 * 1000 + 1, 60).should.equal(true)
  })

  it('matches empty source as any and N2K.17 exactly', function () {
    sourceMatches('', 'N2K.17').should.equal(true)
    sourceMatches(undefined, 'N2K.17').should.equal(true)
    sourceMatches('N2K.17', 'N2K.17').should.equal(true)
    sourceMatches('N2K.17', 'N2K.18').should.equal(false)
  })

  it('parses source from label.src', function () {
    deltaSourceId({ source: { label: 'N2K', src: 17 } }).should.equal('N2K.17')
    deltaSourceId({ $source: 'can0.17' }).should.equal('can0.17')
    resyncTrackerKey('N2K.17', 'navigation.currentRoute.name').should.equal(
      'N2K.17_navigation.currentRoute.name'
    )
  })

  it('ignores empty trigger paths', function () {
    configuredResyncTriggers({
      resync: [{ path: '' }, { path: 'navigation.currentRoute.name' }]
    }).should.deep.equal([{ path: 'navigation.currentRoute.name' }])
  })
})

describe('power-on resync', function () {
  const trigger = {
    path: 'navigation.currentRoute.name',
    source: 'N2K.17',
    timeout: 60
  }
  const n2k17 = { label: 'N2K', src: 17 }

  it('does not resync before intent has been applied', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-rs-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1'], { resync: [trigger] }))
    app.emit('navigation.currentRoute.name', 'Home', n2k17)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0)
  })

  it('re-applies last intent when the path appears', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-rs-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1'], { resync: [trigger] }))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.9
    )
    const before = countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    )
    app.emit('navigation.currentRoute.name', 'Home', n2k17)
    countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(before + 1)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.9)
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day1')
  })

  it('does not resync on the same path while still active', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-rs-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1'], { resync: [trigger] }))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.emit('navigation.currentRoute.name', 'Home', n2k17)
    const afterFirst = countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    )
    app.emit('navigation.currentRoute.name', 'Home', n2k17)
    countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(afterFirst)
  })

  it('ignores a non-matching source', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-rs-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1'], { resync: [trigger] }))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    const before = countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    )
    app.emit('navigation.currentRoute.name', 'Home', { label: 'N2K', src: 18 })
    countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(before)
  })

  it('still applies last intent when control is off', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-rs-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1'], { resync: [trigger] }))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.4
    )
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'off')
    const before = countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    )
    app.emit('navigation.currentRoute.name', 'Home', n2k17)
    countPath(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(before + 1)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.4)
    fs.existsSync(mapsPath(dir)).should.equal(false)
  })
})
