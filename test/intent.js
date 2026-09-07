const chai = require('chai')
chai.Should()

const {
  DEFAULTS,
  INTENT_META,
  INTENT_PATHS,
  parseIntentPut,
  quantizeBrightness
} = require('../dist/intent')

describe('intent paths', function () {
  it('uses reserved leaves under electrical.displays', function () {
    INTENT_PATHS.brightness.should.equal('electrical.displays.brightness')
    INTENT_PATHS.mode.should.equal('electrical.displays.mode')
    INTENT_PATHS.control.should.equal('electrical.displays.control')
  })

  it('quantizes brightness to 0.1 steps', function () {
    quantizeBrightness(0.54).should.equal(0.5)
    quantizeBrightness(0.55).should.equal(0.6)
    quantizeBrightness(-1).should.equal(0)
    quantizeBrightness(2).should.equal(1)
  })

  it('accepts PUT brightness 0.5', function () {
    parseIntentPut(INTENT_PATHS.brightness, 0.5).should.deep.equal({
      ok: true,
      value: 0.5
    })
  })

  it('accepts PUT mode night', function () {
    parseIntentPut(INTENT_PATHS.mode, 'night').should.deep.equal({
      ok: true,
      value: 'night'
    })
  })

  it('accepts PUT control auto-learning', function () {
    parseIntentPut(INTENT_PATHS.control, 'auto-learning').should.deep.equal({
      ok: true,
      value: 'auto-learning'
    })
  })

  it('rejects invalid control', function () {
    parseIntentPut(INTENT_PATHS.control, 'once').ok.should.equal(false)
  })

  it('does not treat vendor group paths as intent', function () {
    parseIntentPut(
      'electrical.displays.navico.group1.brightness',
      0.5
    ).ok.should.equal(false)
  })

  it('publishes meta for all three intent paths', function () {
    INTENT_META[INTENT_PATHS.brightness].range.should.deep.equal([0, 1])
    INTENT_META[INTENT_PATHS.brightness].units.should.equal('ratio')
    INTENT_META[INTENT_PATHS.mode].enum.should.deep.equal(['day', 'night'])
    INTENT_META[INTENT_PATHS.control].enum.should.deep.equal([
      'off',
      'auto',
      'auto-learning'
    ])
    INTENT_META[INTENT_PATHS.control].possibleValues.should.deep.equal([
      { title: 'Manual', value: 'off' },
      { title: 'Auto', value: 'auto' },
      { title: 'Learning', value: 'auto-learning' }
    ])
  })

  it('defaults to full brightness, day, off', function () {
    DEFAULTS.brightness.should.equal(1)
    DEFAULTS.mode.should.equal('day')
    DEFAULTS.control.should.equal('off')
  })

  it('roundtrips last intent in the plugin data dir', function () {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const { loadIntent, saveIntent } = require('../dist/intent')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2k-intent-'))
    saveIntent(dir, { brightness: 0.54, mode: 'night', control: 'auto' })
    loadIntent(dir).should.deep.equal({
      brightness: 0.5,
      mode: 'night',
      control: 'auto'
    })
  })
})
