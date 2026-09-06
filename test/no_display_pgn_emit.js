const fs = require('fs')
const path = require('path')
const chai = require('chai')
chai.Should()

const src = fs.readFileSync(
  path.join(__dirname, '../src/index.ts'),
  'utf8'
)

describe('F4 converter owns encode', function () {
  it('does not emit nmea2000JsonOut', function () {
    src.should.not.match(/nmea2000JsonOut/)
  })

  it('does not emit nmea2000out HEX', function () {
    src.should.not.match(/nmea2000out/)
  })

  it('still writes vendor Signal K paths', function () {
    src.should.match(/electrical\.displays\.raymarine\.\$\{group\}\.brightness/)
    src.should.match(/electrical\.displays\.navico\.\$\{group\}\.brightness/)
    src.should.match(/electrical\.displays\.raymarine\.\$\{group\}\.color/)
    src.should.match(/electrical\.displays\.navico\.\$\{group\}\.nightModeColor/)
  })
})
