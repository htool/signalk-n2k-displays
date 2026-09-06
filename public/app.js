;(function () {
  var INTENT = {
    brightness: 'electrical.displays.brightness',
    mode: 'electrical.displays.mode',
    control: 'electrical.displays.control'
  }
  var RESERVED = { brightness: true, mode: true, control: true }
  var PALETTE = {
    navico: {
      path: 'nightModeColor',
      modes: ['night'],
      values: {
        night: ['red', 'green', 'blue', 'white', 'magenta']
      },
      labels: {
        red: 'Red',
        green: 'Green',
        blue: 'Blue',
        white: 'White',
        magenta: 'Magenta'
      }
    },
    raymarine: {
      path: 'color',
      modes: ['day', 'night'],
      values: {
        day: ['day1', 'day2'],
        night: ['red/black', 'inverse']
      },
      labels: {
        day1: 'Day 1',
        day2: 'Day 2',
        'red/black': 'Red/Black',
        inverse: 'Inverse'
      }
    }
  }
  var VENDOR_TITLE = {
    navico: 'Navico / B&G',
    raymarine: 'Raymarine'
  }

  var demo = /(?:\?|&)demo=1(?:&|$)/.test(location.search)
  var vesselMode = 'day'
  var brightness = 1
  var glassMode = 'day'
  var control = 'off'
  var devices = {}
  var statusEl = document.getElementById('status')
  var backoff = 500
  var ws

  function quantize (n) {
    var x = Math.min(1, Math.max(0, n))
    return Math.round(x * 10) / 10
  }

  function putUrl (path) {
    return '/signalk/v1/api/vessels/self/' + path.split('.').join('/')
  }

  function put (path, value) {
    applyPath(path, value)
    render()
    if (demo) {
      return
    }
    fetch(putUrl(path), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value })
    }).catch(function () {})
  }

  function applyPath (path, value) {
    if (path === 'environment.mode') {
      vesselMode = value === 'night' ? 'night' : 'day'
      return
    }
    if (path === INTENT.brightness) {
      brightness = quantize(Number(value))
      return
    }
    if (path === INTENT.mode) {
      glassMode = value === 'night' ? 'night' : 'day'
      return
    }
    if (path === INTENT.control) {
      if (value === 'off' || value === 'auto' || value === 'auto-learning') {
        control = value
      }
      return
    }
    var parts = path.split('.')
    if (parts[0] !== 'electrical' || parts[1] !== 'displays') {
      return
    }
    var vendor = parts[2]
    var group = parts[3]
    var leaf = parts.slice(4).join('.')
    if (!vendor || !group || RESERVED[vendor] || !leaf) {
      return
    }
    var id = vendor + '.' + group
    if (!devices[id]) {
      devices[id] = { vendor: vendor, group: group }
    }
    if (leaf === 'brightness') {
      devices[id].brightness = Number(value)
    } else if (leaf === 'nightModeColor') {
      devices[id].nightModeColor = value
    } else if (leaf === 'color') {
      devices[id].color = value
    }
  }

  function nativeLabel (vendor, ratio) {
    var n = typeof ratio === 'number' && isFinite(ratio) ? ratio : 0
    if (vendor === 'navico') {
      return Math.round(n * 10) + ' / 10'
    }
    return Math.round(n * 100) + ' %'
  }

  function groupTitle (group) {
    return String(group)
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/^./, function (c) {
        return c.toUpperCase()
      })
  }

  function paletteFor (vendor) {
    return PALETTE[vendor]
  }

  function showPalette (vendor) {
    var spec = paletteFor(vendor)
    return !!(spec && spec.modes.indexOf(glassMode) !== -1)
  }

  function deviceList () {
    return Object.keys(devices)
      .sort()
      .map(function (id) {
        return devices[id]
      })
  }

  function hit (label, on, onclick) {
    var b = document.createElement('button')
    b.type = 'button'
    b.className = 'hit' + (on ? ' on' : '')
    b.textContent = label
    b.addEventListener('click', onclick)
    return b
  }

  function render () {
    document.body.classList.toggle('night', vesselMode === 'night')
    var controlRow = document.getElementById('control-row')
    controlRow.innerHTML = ''
    ;[
      ['off', 'Off'],
      ['auto', 'Auto'],
      ['auto-learning', 'Learn']
    ].forEach(function (pair) {
      controlRow.appendChild(
        hit(pair[1], control === pair[0], function () {
          put(INTENT.control, pair[0])
        })
      )
    })
    var modeRow = document.getElementById('mode-row')
    modeRow.innerHTML = ''
    ;[
      ['day', 'Day'],
      ['night', 'Night']
    ].forEach(function (pair) {
      modeRow.appendChild(
        hit(pair[1], glassMode === pair[0], function () {
          put(INTENT.mode, pair[0])
        })
      )
    })
    document.getElementById('bright-value').textContent = brightness.toFixed(1)
    var mount = document.getElementById('devices')
    mount.innerHTML = ''
    var list = deviceList()
    if (list.length === 0) {
      var empty = document.createElement('p')
      empty.className = 'empty'
      empty.textContent = 'No instrument groups yet.'
      mount.appendChild(empty)
      return
    }
    list.forEach(function (dev) {
      var card = document.createElement('article')
      card.className = 'device'
      var h = document.createElement('h3')
      h.textContent =
        (VENDOR_TITLE[dev.vendor] || dev.vendor) +
        ' · ' +
        groupTitle(dev.group)
      card.appendChild(h)
      var native = document.createElement('div')
      native.className = 'native'
      native.appendChild(
        hit('−', false, function () {
          put(
            'electrical.displays.' + dev.vendor + '.' + dev.group + '.brightness',
            quantize((dev.brightness || 0) - 0.1)
          )
        })
      )
      var read = document.createElement('div')
      read.className = 'native-read'
      read.textContent = nativeLabel(dev.vendor, dev.brightness)
      native.appendChild(read)
      native.appendChild(
        hit('+', false, function () {
          put(
            'electrical.displays.' + dev.vendor + '.' + dev.group + '.brightness',
            quantize((dev.brightness || 0) + 0.1)
          )
        })
      )
      card.appendChild(native)
      if (showPalette(dev.vendor)) {
        var spec = paletteFor(dev.vendor)
        var pal = document.createElement('div')
        pal.className = 'palette'
        var current =
          spec.path === 'color' ? dev.color : dev.nightModeColor
        ;(spec.values[glassMode] || []).forEach(function (color) {
          pal.appendChild(
            hit(spec.labels[color] || color, current === color, function () {
              put(
                'electrical.displays.' +
                  dev.vendor +
                  '.' +
                  dev.group +
                  '.' +
                  spec.path,
                color
              )
            })
          )
        })
        card.appendChild(pal)
      }
      mount.appendChild(card)
    })
  }

  document.getElementById('bright-down').addEventListener('click', function () {
    put(INTENT.brightness, quantize(brightness - 0.1))
  })
  document.getElementById('bright-up').addEventListener('click', function () {
    put(INTENT.brightness, quantize(brightness + 0.1))
  })

  function onDelta (delta) {
    if (!delta || !delta.updates) {
      return
    }
    delta.updates.forEach(function (update) {
      ;(update.values || []).forEach(function (vp) {
        if (vp && vp.path) {
          applyPath(vp.path, vp.value)
        }
      })
    })
    render()
  }

  function flatten (obj, prefix, out) {
    if (!obj || typeof obj !== 'object') {
      return
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'value') && prefix) {
      out[prefix] = obj.value
    }
    Object.keys(obj).forEach(function (key) {
      if (key === 'value' || key === 'meta' || key === '$source' || key === 'sentence') {
        return
      }
      flatten(obj[key], prefix ? prefix + '.' + key : key, out)
    })
  }

  function hydrate (tree) {
    var flat = {}
    flatten(tree, '', flat)
    Object.keys(flat).forEach(function (path) {
      if (
        path.indexOf('electrical.displays') === 0 ||
        path === 'environment.mode'
      ) {
        applyPath(path, flat[path])
      }
    })
    render()
  }

  function subscribeWs () {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(proto + '//' + location.host + '/signalk/v1/stream?subscribe=none')
    ws.onopen = function () {
      backoff = 500
      statusEl.textContent = 'Live'
      ws.send(
        JSON.stringify({
          context: 'vessels.self',
          subscribe: [
            { path: 'electrical.displays.*', period: 1000 },
            { path: 'environment.mode', period: 1000 }
          ]
        })
      )
    }
    ws.onmessage = function (ev) {
      try {
        onDelta(JSON.parse(ev.data))
      } catch (err) {}
    }
    ws.onclose = function () {
      statusEl.textContent = 'Reconnecting…'
      setTimeout(subscribeWs, backoff)
      backoff = Math.min(backoff * 2, 15000)
    }
    ws.onerror = function () {
      ws.close()
    }
  }

  function loadTree () {
    fetch('/signalk/v1/api/vessels/self', { credentials: 'include' })
      .then(function (res) {
        return res.json()
      })
      .then(hydrate)
      .catch(function () {})
  }

  function seedDemo () {
    statusEl.textContent = ''
    applyPath('environment.mode', 'night')
    applyPath(INTENT.control, 'auto')
    applyPath(INTENT.mode, 'night')
    applyPath(INTENT.brightness, 0.4)
    applyPath('electrical.displays.navico.group1.brightness', 0.4)
    applyPath('electrical.displays.navico.group1.nightModeColor', 'red')
    applyPath('electrical.displays.raymarine.helm1.brightness', 0.4)
    applyPath('electrical.displays.raymarine.helm1.color', 'red/black')
    render()
  }

  render()
  if (demo) {
    seedDemo()
  } else {
    loadTree()
    subscribeWs()
  }
})()
