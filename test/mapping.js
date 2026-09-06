const fs = require('fs')
const os = require('os')
const path = require('path')
const chai = require('chai')
chai.Should()

const { mappingTables, saveMapping } = require('../dist/mapping')
const {
  defaultSourceCurves,
  loadSourceCurves,
  curvesFromPluginConfig,
  pluginConfigFromCurves,
  intentFromLux,
  intentFromSun
} = require('../dist/source')
const { emptyMaps, loadMaps, saveMaps } = require('../dist/maps')
const createPlugin = require('../index')

function mockApp (dataDir) {
  return {
    error: function () {},
    debug: function () {},
    registerPutHandler: function () {},
    handleMessage: function () {},
    getDataDirPath: function () {
      return dataDir
    }
  }
}

describe('F14 mapping table', function () {
  it('has Time, Sun, and Lux tables with bandg defaults', function () {
    const tables = mappingTables()
    tables.time.length.should.equal(2)
    tables.time[0].bin.should.equal('day')
    tables.time[0].brightness.should.equal(0.6)
    tables.time[1].bin.should.equal('night')
    tables.time[1].brightness.should.equal(0.3)
    tables.sun.length.should.equal(8)
    const dusk = tables.sun.find(function (row) {
      return row.bin === 'dusk'
    })
    dusk.mode.should.equal('night')
    dusk.brightness.should.equal(0.4)
    const dawn = tables.sun.find(function (row) {
      return row.bin === 'dawn'
    })
    dawn.brightness.should.equal(0.4)
    tables.lux.length.should.equal(6)
    tables.lux[0].luxMin.should.equal(0)
    tables.lux[0].luxMax.should.equal(1)
    ;(tables.lux[5].luxMax === null).should.equal(true)
    tables.native.length.should.equal(20)
    tables.native[0].mode.should.equal('day')
    tables.native[0].brightness.should.equal(1)
    tables.native[0].navicoBrightness.should.equal(1)
    tables.native[0].raymarineBrightness.should.equal(1)
    tables.palettes.navicoNight.should.equal('red')
    tables.palettes.raymarineNight.should.equal('red/black')
    ;(tables.time[0].navicoBrightness === undefined).should.equal(true)
  })

  it('roundtrips default curves without writing identity maps', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-maptable-'))
    const saved = saveMapping(mappingTables(), ['navico.default'], ['raymarine.helm1'])
    saved.ok.should.equal(true)
    saved.curves.lux.length.should.equal(6)
    Object.keys(saved.maps.brightness).length.should.equal(0)
    intentFromLux(733, saved.curves.lux).should.deep.equal({
      bin: 'lux:100-1000',
      mode: 'day',
      brightness: 0.4
    })
    intentFromSun('dusk', saved.curves.sun).brightness.should.equal(0.4)
    const again = mappingTables(saved.curves, saved.maps, ['navico.default'], [
      'raymarine.helm1'
    ])
    again.sun.find(function (row) {
      return row.bin === 'dusk'
    }).brightness.should.equal(0.4)
    fs.rmdirSync(dir)
  })

  it('stores a native cell when B&G brightness differs from intent', function () {
    const previous = emptyMaps()
    previous.palettes['navico.default'] = { night: 'green' }
    const tables = mappingTables()
    delete tables.palettes
    const night = tables.native.find(function (row) {
      return row.mode === 'night' && row.brightness === 0.3
    })
    night.navicoBrightness = 0.2
    const saved = saveMapping(tables, ['navico.default'], [], previous)
    saved.ok.should.equal(true)
    saved.maps.brightness['navico.default'].night['0.3'].should.equal(0.2)
    saved.maps.palettes['navico.default'].night.should.equal('green')
  })

  it('writes a night palette and omits the family default', function () {
    const previous = emptyMaps()
    previous.palettes['navico.default'] = { night: 'green' }
    const tables = mappingTables()
    tables.palettes = { navicoNight: 'blue', raymarineNight: 'red/black' }
    const saved = saveMapping(tables, ['navico.default'], ['raymarine.helm1'], previous)
    saved.ok.should.equal(true)
    saved.maps.palettes['navico.default'].night.should.equal('blue')
    const reset = mappingTables(saved.curves, saved.maps, ['navico.default'], [
      'raymarine.helm1'
    ])
    reset.palettes.navicoNight.should.equal('blue')
    reset.palettes.raymarineNight.should.equal('red/black')
    const backToDefault = saveMapping(
      Object.assign({}, tables, {
        palettes: { navicoNight: 'red', raymarineNight: 'red/black' }
      }),
      ['navico.default'],
      ['raymarine.helm1'],
      saved.maps
    )
    ;(backToDefault.maps.palettes['navico.default'].night === undefined).should.equal(
      true
    )
  })

  it('rejects overlapping lux ranges', function () {
    const tables = mappingTables()
    tables.lux[0].luxMax = 50
    tables.lux[1].luxMin = 10
    saveMapping(tables, [], []).ok.should.equal(false)
  })

  it('roundtrips plugin config curves', function () {
    const curves = defaultSourceCurves()
    const config = pluginConfigFromCurves(curves, 'environment.outside.lux')
    config.time.day.should.equal(0.6)
    config.sun.dusk.brightness.should.equal(0.4)
    config.lux.table.length.should.equal(6)
    const back = curvesFromPluginConfig(config)
    back.mode.night.brightness.should.equal(0.3)
    back.sun.sunrise.mode.should.equal('day')
    intentFromLux(2.5, back.lux).brightness.should.equal(0.3)
  })

  it('plugin schema has time, sun, and lux', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-schema-'))
    const plugin = createPlugin(mockApp(dir))
    const schema = plugin.schema()
    schema.description.should.match(/\/signalk-n2k-displays\//)
    schema.properties.webapp.default.should.equal('/signalk-n2k-displays/')
    schema.properties.time.properties.day.default.should.equal(0.6)
    schema.properties.sun.properties.dusk.properties.brightness.default.should.equal(0.4)
    schema.properties.lux.properties.table.default.length.should.equal(6)
    JSON.stringify(schema).should.not.match(/ADR/)
    schema.properties.source.description.should.match(/Auto uses lux, then sun, then time/)
  })

  it('GET mapping returns time, sun, and lux', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-getmap-'))
    const plugin = createPlugin(mockApp(dir))
    plugin.start({
      navicoGroups: { default: true },
      raymarineGroups: { helm1: false }
    })
    const routes = {}
    plugin.registerWithRouter({
      get: function (path, fn) {
        routes['GET ' + path] = fn
      },
      put: function (path, fn) {
        routes['PUT ' + path] = fn
      }
    })
    let body
    routes['GET /mapping'](
      {},
      {
        json: function (value) {
          body = value
        }
      }
    )
    body.luxPath.should.equal('environment.outside.lux')
    body.luxAvailable.should.equal(false)
    body.time.length.should.equal(2)
    body.sun.length.should.equal(8)
    body.lux.length.should.equal(6)
    body.native.length.should.equal(20)
    body.palettes.navicoNight.should.equal('red')
    body.palettes.raymarineNight.should.equal('red/black')
    plugin.stop()
  })

  it('GET mapping sets luxAvailable when the lux path exists', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-getlux-'))
    const app = mockApp(dir)
    app.getSelfPath = function (path) {
      if (path === 'environment.outside.lux') {
        return { value: 733 }
      }
    }
    const plugin = createPlugin(app)
    plugin.start({ navicoGroups: { default: true } })
    const routes = {}
    plugin.registerWithRouter({
      get: function (path, fn) {
        routes['GET ' + path] = fn
      },
      put: function (path, fn) {
        routes['PUT ' + path] = fn
      }
    })
    let body
    routes['GET /mapping'](
      {},
      {
        json: function (value) {
          body = value
        }
      }
    )
    body.luxAvailable.should.equal(true)
    plugin.stop()
  })

  it('loads curves from plugin config', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-cfgcurve-'))
    const plugin = createPlugin(mockApp(dir))
    plugin.start({
      time: { day: 0.8, night: 0.2 },
      sun: { dusk: { mode: 'night', brightness: 0.5 } },
      lux: {
        path: 'environment.outside.lux',
        table: [{ luxMin: 0, luxMax: 10, mode: 'night', brightness: 0.1 }]
      }
    })
    const routes = {}
    plugin.registerWithRouter({
      get: function (path, fn) {
        routes['GET ' + path] = fn
      },
      put: function (path, fn) {
        routes['PUT ' + path] = fn
      }
    })
    let body
    routes['GET /mapping'](
      {},
      {
        json: function (value) {
          body = value
        }
      }
    )
    body.time[0].brightness.should.equal(0.8)
    body.sun.find(function (row) {
      return row.bin === 'dusk'
    }).brightness.should.equal(0.5)
    body.lux.length.should.equal(1)
    plugin.stop()
  })

  it('roundtrips source.json', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-srcjson-'))
    const { saveSourceCurves } = require('../dist/source')
    const curves = defaultSourceCurves()
    saveSourceCurves(dir, curves)
    loadSourceCurves(dir).lux[0].min.should.equal(0)
    emptyMaps()
    saveMaps(dir, emptyMaps())
    loadMaps(dir).brightness.should.deep.equal({})
  })
})
