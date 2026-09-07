const fs = require('fs')
const os = require('os')
const path = require('path')
const chai = require('chai')
chai.Should()

const {
  deviceId,
  emptyMaps,
  identityNative,
  loadMaps,
  mappedNative,
  mapsPath,
  saveMaps,
  shouldApplyMaps,
  vendorBrightnessTargets
} = require('../dist/maps')
const { INTENT_PATHS } = require('../dist/intent')
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
    puts,
    messages
  }
}

function enabledOnly (navico, raymarine) {
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
  return { navicoGroups, raymarineGroups, groupMappings: [] }
}

describe('identity brightness maps', function () {
  it('identity native is quantized intent', function () {
    identityNative(0.54).should.equal(0.5)
  })

  it('missing cell is identity', function () {
    mappedNative(emptyMaps(), 'navico.group1', 'day', 0.54).should.equal(0.5)
  })

  it('stored cell overrides identity', function () {
    const maps = {
      brightness: {
        'navico.group1': { day: { '0.5': 0.3 } }
      }
    }
    mappedNative(maps, 'navico.group1', 'day', 0.54).should.equal(0.3)
    mappedNative(maps, 'navico.group1', 'night', 0.54).should.equal(0.5)
    mappedNative(maps, 'raymarine.helm1', 'day', 0.54).should.equal(0.5)
  })

  it('applies in auto and auto-learning, not off', function () {
    shouldApplyMaps('off').should.equal(false)
    shouldApplyMaps('auto').should.equal(true)
    shouldApplyMaps('auto-learning').should.equal(true)
  })

  it('device ids are vendor.group', function () {
    deviceId('navico', 'group1').should.equal('navico.group1')
    deviceId('raymarine', 'helm1').should.equal('raymarine.helm1')
  })

  it('targets identity for every listed device', function () {
    vendorBrightnessTargets(emptyMaps(), 'day', 0.54, [
      'navico.group1',
      'raymarine.helm1'
    ]).should.deep.equal([
      { deviceId: 'navico.group1', native: 0.5 },
      { deviceId: 'raymarine.helm1', native: 0.5 }
    ])
  })

  it('loads empty maps when the file is missing', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    loadMaps(dir).should.deep.equal(emptyMaps())
  })

  it('roundtrips maps.json in the plugin data dir', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const maps = {
      brightness: {
        'navico.group1': { day: { '0.5': 0.4 } }
      },
      palettes: {}
    }
    saveMaps(dir, maps)
    fs.existsSync(mapsPath(dir)).should.equal(true)
    loadMaps(dir).should.deep.equal(maps)
  })
})

describe('apply maps on intent PUT', function () {
  it('applies glass brightness PUT while control is off', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.brightness]('vessels.self', INTENT_PATHS.brightness, 0.54)
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(0.5)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.brightness').should.equal(0.5)
  })

  it('identity-applies enabled groups when switching to auto', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(1)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.brightness').should.equal(1)
    chai.expect(lastValue(app.messages, 'electrical.displays.navico.group2.brightness')).to.equal(undefined)
    fs.existsSync(mapsPath(dir)).should.equal(false)
  })

  it('applies quantized intent while auto', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto-learning')
    app.puts[INTENT_PATHS.brightness]('vessels.self', INTENT_PATHS.brightness, 0.54)
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(0.5)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.brightness').should.equal(0.5)
  })

  it('uses a stored cell for that device and mode', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    saveMaps(dir, {
      brightness: {
        'navico.group1': { day: { '0.5': 0.3 } }
      }
    })
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.puts[INTENT_PATHS.brightness]('vessels.self', INTENT_PATHS.brightness, 0.5)
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(0.3)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.brightness').should.equal(0.5)
  })

  it('uses display mode as the brightness map key', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    saveMaps(dir, {
      brightness: {
        'navico.group1': {
          day: { '0.5': 0.3 },
          night: { '0.5': 0.1 }
        }
      }
    })
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.brightness]('vessels.self', INTENT_PATHS.brightness, 0.5)
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(0.3)
    app.puts[INTENT_PATHS.mode]('vessels.self', INTENT_PATHS.mode, 'night')
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(0.1)
  })
})

describe('start mapping when a brand is enabled', function () {
  it('starts enabled groups at identity of current intent, not 0', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(1)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.brightness').should.equal(1)
    chai.expect(lastValue(app.messages, 'electrical.displays.navico.group2.brightness')).to.equal(undefined)
    fs.existsSync(mapsPath(dir)).should.equal(false)
  })

  it('starts palettes at family defaults', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.color').should.equal('day1')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightMode.state'
    ).should.equal(0)
  })

  it('uses a stored cell when the brand is added', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    saveMaps(dir, {
      brightness: {
        'navico.group1': { day: { '1': 0.4 } }
      },
      palettes: {
        'raymarine.helm1': { day: 'day2' }
      }
    })
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    lastValue(app.messages, 'electrical.displays.navico.group1.brightness').should.equal(0.4)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.brightness').should.equal(1)
    lastValue(app.messages, 'electrical.displays.raymarine.helm1.color').should.equal('day2')
  })

  it('stores a native cell on instrument PUT while auto-learning', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control](
      'vessels.self',
      INTENT_PATHS.control,
      'auto-learning'
    )
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.4
    )
    app.puts['electrical.displays.navico.group1.brightness'](
      'vessels.self',
      'electrical.displays.navico.group1.brightness',
      0.2
    )
    loadMaps(dir).brightness['navico.group1'].day['0.4'].should.equal(0.2)
  })
})
