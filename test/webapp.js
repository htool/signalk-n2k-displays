const fs = require('fs')
const path = require('path')
const chai = require('chai')
chai.Should()

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')
const css = fs.readFileSync(path.join(__dirname, '../public/app.css'), 'utf8')
const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
const pkg = require('../package.json')

describe('F9 control webapp', function () {
  it('is a standalone public webapp', function () {
    pkg.keywords.should.include('signalk-webapp')
    html.should.match(/app\.js/)
    html.should.match(/app\.css/)
  })

  it('PUTs v1 intent paths, not plugin REST', function () {
    js.should.match(/electrical\.displays\.brightness/)
    js.should.match(/electrical\.displays\.mode/)
    js.should.match(/electrical\.displays\.control/)
    js.should.match(/\/signalk\/v1\/api\/vessels\/self\//)
    js.should.not.match(/\/plugins\//)
    js.should.match(/'off' \|\| value === 'auto' \|\| value === 'auto-learning'/)
  })

  it('is phone-first with 48px hit targets', function () {
    css.should.match(/--hit-size:\s*48px/)
    css.should.match(/min-height:\s*var\(--hit-size\)/)
    css.should.match(/min-width:\s*var\(--hit-size\)/)
    html.should.match(/width=device-width/)
  })

  it('follows environment.mode for chrome', function () {
    js.should.match(/environment\.mode/)
    js.should.match(/body\.classList\.toggle\('night'/)
    css.should.match(/body\.night/)
  })

  it('shows native scale and hides undeclared palettes', function () {
    js.should.match(/ \/ 10/)
    js.should.match(/quantize\(Number\(value\)\)/)
    html.should.match(/0–100%/)
    js.should.match(/intentPercent\(brightness\) \+ ' %'/)
    js.should.match(/0\.1/)
    js.should.match(/modes: \['night'\]/)
    js.should.match(/navico/)
    js.should.match(/raymarine/)
    js.should.not.match(/garmin/)
  })
})
