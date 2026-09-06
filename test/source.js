const fs = require('fs')
const os = require('os')
const path = require('path')
const chai = require('chai')
chai.Should()

const {
  DEFAULT_LUX_PATH,
  LUX_CURVE,
  MODE_CURVE,
  SUN_CURVE,
  intentFromLux,
  intentFromMode,
  intentFromSource,
  intentFromSun,
  parseSource
} = require('../dist/source')
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
    emit: function (skPath, value) {
      subscribers.forEach(function (cb) {
        cb({
          updates: [{ values: [{ path: skPath, value: value }] }]
        })
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

describe('given source curves', function () {
  it('parses source with mode default', function () {
    parseSource('sun').should.equal('sun')
    parseSource('nope').should.equal('mode')
  })

  it('maps environment.mode night/day using bandg defaults', function () {
    intentFromMode('night').should.deep.equal(MODE_CURVE.night)
    intentFromMode('day').should.deep.equal(MODE_CURVE.day)
    intentFromMode('restricted').mode.should.equal('day')
    chai.expect(intentFromMode(undefined)).to.equal(undefined)
  })

  it('maps environment.sun bins from the given table', function () {
    intentFromSun('dawn').should.deep.equal(SUN_CURVE.dawn)
    intentFromSun('sunrise').should.deep.equal(SUN_CURVE.sunrise)
    intentFromSun('night').brightness.should.equal(0.2)
    chai.expect(intentFromSun('bogus')).to.equal(undefined)
  })

  it('maps log-lux bins from the given curve', function () {
    intentFromLux(0.5).should.deep.equal({
      bin: 'lux:0-1',
      mode: 'night',
      brightness: 0.2
    })
    intentFromLux(50).mode.should.equal('night')
    intentFromLux(50).brightness.should.equal(0.4)
    intentFromLux(500).mode.should.equal('day')
    intentFromLux(5000).brightness.should.equal(0.6)
    intentFromLux(20000).brightness.should.equal(1)
    chai.expect(intentFromLux(-1)).to.equal(undefined)
    LUX_CURVE.length.should.equal(6)
  })

  it('ignores paths that are not the configured source', function () {
    chai
      .expect(intentFromSource('mode', 'environment.sun', 'dawn', DEFAULT_LUX_PATH))
      .to.equal(undefined)
    intentFromSource(
      'lux',
      DEFAULT_LUX_PATH,
      50,
      DEFAULT_LUX_PATH
    ).brightness.should.equal(0.4)
  })
})

describe('apply source policy', function () {
  it('does not steer while control is off', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-src-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.emit('environment.mode', 'night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0)
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('day')
  })

  it('applies cached mode when switching to auto', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-src-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.emit('environment.mode', 'night')
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('night')
    lastValue(app.messages, INTENT_PATHS.brightness).should.equal(0.3)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.3)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightMode.state'
    ).should.equal(1)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightModeColor'
    ).should.equal('red')
  })

  it('keeps a live brightness override until the source bin changes', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-src-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.emit('environment.mode', 'day')
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.9
    )
    app.emit('environment.mode', 'day')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.9)
    app.emit('environment.mode', 'night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.3)
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('night')
  })

  it('applies given sun bins and ignores environment.mode', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-src-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1'], { source: 'sun' }))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.emit('environment.mode', 'night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(1)
    app.emit('environment.sun', 'dawn')
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.4)
    app.emit('environment.sun', 'sunrise')
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('day')
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day1')
  })

  it('applies given lux bins only when the bin changes', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-src-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(
      enabledOnly(['group1'], ['helm1'], {
        source: 'lux',
        luxPath: 'environment.outside.illuminance'
      })
    )
    app.puts[INTENT_PATHS.control](
      'vessels.self',
      INTENT_PATHS.control,
      'auto-learning'
    )
    app.emit('environment.outside.illuminance', 20)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.4)
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('night')
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.8
    )
    app.emit('environment.outside.illuminance', 80)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.8)
    app.emit('environment.outside.illuminance', 5000)
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.6)
    lastValue(app.messages, INTENT_PATHS.mode).should.equal('day')
    fs.existsSync(mapsPath(dir)).should.equal(false)
  })
})
