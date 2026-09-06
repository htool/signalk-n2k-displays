const fs = require('fs')
const os = require('os')
const path = require('path')
const chai = require('chai')
chai.Should()

const {
  COMPAT_META,
  COMPAT_PATHS,
  displayModeBlob,
  parseCompatPut
} = require('../dist/intent')
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

describe('F10 environment.displayMode compat', function () {
  it('maps backlight 1–10 onto brightness 0–1', function () {
    displayModeBlob({
      brightness: 0.3,
      mode: 'night',
      control: 'off'
    }).should.deep.equal({ mode: 'night', backlight: 3 })
    displayModeBlob({
      brightness: 0,
      mode: 'day',
      control: 'off'
    }).backlight.should.equal(0)
    parseCompatPut({ mode: 'night', backlight: 3 }).should.deep.equal({
      ok: true,
      mode: 'night',
      brightness: 0.3
    })
    parseCompatPut({ mode: 'day', backlight: '10' }).brightness.should.equal(1)
    parseCompatPut({ mode: 'dusk', backlight: 5 }).ok.should.equal(false)
  })

  it('marks the blob deprecated', function () {
    COMPAT_PATHS.blob.should.equal('environment.displayMode')
    COMPAT_PATHS.control.should.equal('environment.displayMode.control')
    COMPAT_META.deprecated.should.equal(true)
  })

  it('publishes the blob and accepts the old PUT', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-compat-'))
    const app = mockApp(dir)
    const plugin = createPlugin(app)
    plugin.start({ navicoGroups: { default: false } })
    lastValue(app.messages, COMPAT_PATHS.blob).should.deep.equal({
      mode: 'day',
      backlight: 10
    })
    const result = app.puts[COMPAT_PATHS.control](
      'vessels.self',
      COMPAT_PATHS.control,
      { mode: 'night', backlight: 2, group: 1 }
    )
    result.statusCode.should.equal(200)
    lastValue(app.messages, 'electrical.displays.mode').should.equal('night')
    lastValue(app.messages, 'electrical.displays.brightness').should.equal(0.2)
    lastValue(app.messages, COMPAT_PATHS.blob).should.deep.equal({
      mode: 'night',
      backlight: 2
    })
    const bad = app.puts[COMPAT_PATHS.control](
      'vessels.self',
      COMPAT_PATHS.control,
      { mode: 'dusk', backlight: 5 }
    )
    bad.statusCode.should.equal(400)
    plugin.stop()
  })
})
