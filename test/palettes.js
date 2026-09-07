const fs = require('fs')
const os = require('os')
const path = require('path')
const chai = require('chai')
chai.Should()

const {
  emptyMaps,
  loadMaps,
  mappedPalette,
  mapsPath,
  nativeNightModeState,
  paletteDeclared,
  saveMaps
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

describe('palette maps', function () {
  it('declares Navico night and Raymarine day/night only', function () {
    paletteDeclared('navico', 'night').should.equal(true)
    paletteDeclared('navico', 'day').should.equal(false)
    paletteDeclared('raymarine', 'day').should.equal(true)
    paletteDeclared('raymarine', 'night').should.equal(true)
    paletteDeclared('garmin', 'night').should.equal(false)
  })

  it('hides undeclared cells', function () {
    chai.expect(mappedPalette(emptyMaps(), 'navico.group1', 'day')).to.equal(
      undefined
    )
    chai.expect(mappedPalette(emptyMaps(), 'garmin.keypad', 'night')).to.equal(
      undefined
    )
  })

  it('identity palettes are family defaults', function () {
    mappedPalette(emptyMaps(), 'navico.group1', 'night').should.equal('red')
    mappedPalette(emptyMaps(), 'raymarine.helm1', 'day').should.equal('day1')
    mappedPalette(emptyMaps(), 'raymarine.helm1', 'night').should.equal(
      'red/black'
    )
  })

  it('stored cell overrides identity', function () {
    const maps = {
      brightness: {},
      palettes: {
        'navico.group1': { night: 'green' },
        'raymarine.helm1': { day: 'day2', night: 'inverse' }
      }
    }
    mappedPalette(maps, 'navico.group1', 'night').should.equal('green')
    mappedPalette(maps, 'raymarine.helm1', 'day').should.equal('day2')
    mappedPalette(maps, 'raymarine.helm1', 'night').should.equal('inverse')
  })

  it('ignores invalid stored colors', function () {
    const maps = {
      brightness: {},
      palettes: {
        'navico.group1': { night: 'day1' },
        'raymarine.helm1': { day: 'red' }
      }
    }
    mappedPalette(maps, 'navico.group1', 'night').should.equal('red')
    mappedPalette(maps, 'raymarine.helm1', 'day').should.equal('day1')
  })

  it('maps intent mode to vendor nightMode.state', function () {
    nativeNightModeState('day').should.equal(0)
    nativeNightModeState('night').should.equal(1)
  })

  it('roundtrips palettes in maps.json', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const maps = {
      brightness: {},
      palettes: {
        'navico.group1': { night: 'magenta' }
      }
    }
    saveMaps(dir, maps)
    loadMaps(dir).should.deep.equal(maps)
  })
})

describe('apply palettes on intent PUT', function () {
  it('applies night mode PUT while control is off', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.mode]('vessels.self', INTENT_PATHS.mode, 'night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightModeColor'
    ).should.equal('red')
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('red/black')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightMode.state'
    ).should.equal(1)
  })

  it('applies Raymarine day color and hides Navico palette in day', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    saveMaps(dir, {
      brightness: {},
      palettes: {
        'navico.group1': { night: 'green' },
        'raymarine.helm1': { day: 'day2' }
      }
    })
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day2')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightModeColor'
    ).should.equal('red')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightMode.state'
    ).should.equal(0)
    chai
      .expect(lastValue(app.messages, 'electrical.displays.navico.group2.nightModeColor'))
      .to.equal(undefined)
  })

  it('applies Navico night color and Raymarine night color', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    saveMaps(dir, {
      brightness: {},
      palettes: {
        'navico.group1': { night: 'green' },
        'raymarine.helm1': { night: 'inverse' }
      }
    })
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.puts[INTENT_PATHS.mode]('vessels.self', INTENT_PATHS.mode, 'night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightModeColor'
    ).should.equal('green')
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('inverse')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightMode.state'
    ).should.equal(1)
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.nightMode.state'
    ).should.equal(1)
  })

  it('does not write brightness when applying palettes', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.4
    )
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.4)
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day1')
    app.puts[INTENT_PATHS.mode]('vessels.self', INTENT_PATHS.mode, 'night')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.brightness'
    ).should.equal(0.4)
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('red/black')
    lastValue(
      app.messages,
      'electrical.displays.navico.group1.nightModeColor'
    ).should.equal('red')
  })

  it('brightness PUT while auto does not reset palette', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    saveMaps(dir, {
      brightness: {},
      palettes: {
        'raymarine.helm1': { day: 'day2' }
      }
    })
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start(enabledOnly(['group1'], ['helm1']))
    app.puts[INTENT_PATHS.control]('vessels.self', INTENT_PATHS.control, 'auto')
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day2')
    app.puts[INTENT_PATHS.brightness](
      'vessels.self',
      INTENT_PATHS.brightness,
      0.6
    )
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day2')
    fs.existsSync(mapsPath(dir)).should.equal(true)
  })

  it('uses plugin Raymarine day/night defaults when no cell is stored', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maps-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    const props = enabledOnly(['group1'], ['helm1'])
    props.raymarineDayColor = 'day2'
    props.raymarineNightColor = 'inverse'
    plugin.start(props)
    app.puts[INTENT_PATHS.control](
      'vessels.self',
      INTENT_PATHS.control,
      'auto-learning'
    )
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('day2')
    app.puts[INTENT_PATHS.mode]('vessels.self', INTENT_PATHS.mode, 'night')
    lastValue(
      app.messages,
      'electrical.displays.raymarine.helm1.color'
    ).should.equal('inverse')
    fs.existsSync(mapsPath(dir)).should.equal(false)
  })
})
