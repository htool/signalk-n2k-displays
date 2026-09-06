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
  var brightness = 1
  var glassMode = 'day'
  var control = 'off'
  var devices = {}
  var statusEl = document.getElementById('status')
  var backoff = 500
  var ws
  var luxPath = 'environment.outside.lux'
  var hasLux = true
  var liveLux
  var liveSun
  var liveTime
  var timeRows = []
  var sunRows = []
  var luxRows = []
  var nativeRows = []
  var mappingPalettes = defaultPalettes()
  var mappingTimer
  var mappingStatusEl = document.getElementById('mapping-status')
  var SUN_OPTIONS = [
    ['nauticalDawn', 'Nautical dawn'],
    ['dawn', 'Dawn'],
    ['sunrise', 'Sunrise'],
    ['day', 'Day'],
    ['sunset', 'Sunset'],
    ['dusk', 'Dusk'],
    ['nauticalDusk', 'Nautical dusk'],
    ['night', 'Night']
  ]
  var STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
  var INTENT_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]

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
    if (path === 'environment.mode') {
      liveTime = value
      return
    }
    if (path === 'environment.sun') {
      liveSun = value
      return
    }
    if (path === luxPath) {
      liveLux = value
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

  function intentPercent (ratio) {
    return Math.round(quantize(ratio) * 100)
  }

  function nativeLabel (_vendor, ratio) {
    var n = typeof ratio === 'number' && isFinite(ratio) ? ratio : 0
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
      ['night', 'Night'],
      ['off', 'Off']
    ].forEach(function (pair) {
      var on =
        pair[0] === 'off'
          ? brightness === 0
          : brightness !== 0 && glassMode === pair[0]
      modeRow.appendChild(
        hit(pair[1], on, function () {
          if (pair[0] === 'off') {
            put(INTENT.brightness, 0)
            return
          }
          put(INTENT.mode, pair[0])
          if (brightness === 0) {
            put(INTENT.brightness, 0.1)
          }
        })
      )
    })
    document.getElementById('bright-value').textContent =
      intentPercent(brightness) + ' %'
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

  function formatLive (value) {
    if (value === undefined || value === null || value === '') {
      return '—'
    }
    if (typeof value === 'number' && isFinite(value)) {
      return Math.round(value * 100) / 100 + ''
    }
    return String(value)
  }

  function sunLabel (bin) {
    for (var i = 0; i < SUN_OPTIONS.length; i++) {
      if (SUN_OPTIONS[i][0] === bin) {
        return SUN_OPTIONS[i][1]
      }
    }
    return bin
  }

  function modeLabel (mode) {
    if (mode === 'off') {
      return 'Off'
    }
    return mode === 'night' ? 'Night' : 'Day'
  }

  function applyLuxUi () {
    document.getElementById('mapping').classList.toggle('no-lux', !hasLux)
  }

  function percentLabel (ratio) {
    return Math.round(quantize(ratio) * 100) + '%'
  }

  function emptyNativeRows () {
    var rows = []
    ;['day', 'night'].forEach(function (mode) {
      INTENT_STEPS.forEach(function (step) {
        rows.push({
          mode: mode,
          brightness: step,
          navicoBrightness: step,
          raymarineBrightness: step
        })
      })
    })
    return rows
  }

  function defaultPalettes () {
    return {
      navicoNight: 'red',
      raymarineNight: 'red/black'
    }
  }

  function paletteSelect (vendor, mode, value, onchange) {
    var spec = PALETTE[vendor]
    var colors = (spec && spec.values[mode]) || []
    var options = colors.map(function (color) {
      return [color, (spec.labels && spec.labels[color]) || color]
    })
    return selectOne(value, options, onchange)
  }

  function patchPalettes (patch) {
    Object.keys(patch).forEach(function (key) {
      mappingPalettes[key] = patch[key]
    })
    renderMapping()
    scheduleMappingSave()
  }

  function markLive (tbodyId, test) {
    var body = document.getElementById(tbodyId)
    if (!body) {
      return
    }
    Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) {
      tr.classList.toggle('live-match', !!test(tr))
    })
  }

  function renderLiveSources () {
    document.getElementById('live-lux').textContent = formatLive(liveLux)
    document.getElementById('live-sun').textContent = liveSun
      ? sunLabel(liveSun)
      : '—'
    document.getElementById('live-time').textContent = liveTime
      ? modeLabel(liveTime)
      : '—'
    var timeBin = liveTime === 'night' ? 'night' : liveTime ? 'day' : ''
    markLive('time-body', function (tr) {
      return timeBin && tr.getAttribute('data-bin') === timeBin
    })
    markLive('sun-body', function (tr) {
      return liveSun && tr.getAttribute('data-bin') === liveSun
    })
    markLive('lux-body', function (tr) {
      if (!hasLux || typeof liveLux !== 'number' || !isFinite(liveLux)) {
        return false
      }
      var idx = Number(tr.getAttribute('data-row'))
      var row = luxRows[idx]
      if (!row || row.luxMin === null || row.luxMin === undefined || row.luxMin === '') {
        return false
      }
      var start = Number(row.luxMin)
      var end =
        row.luxMax === null || row.luxMax === undefined || row.luxMax === ''
          ? Infinity
          : Number(row.luxMax)
      return liveLux >= start && liveLux < end
    })
  }

  function optionEl (value, label, selected) {
    var o = document.createElement('option')
    o.value = value
    o.textContent = label
    if (selected) {
      o.selected = true
    }
    return o
  }

  function numberInput (value, onchange) {
    var input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.step = 'any'
    input.value =
      value === null || value === undefined || !isFinite(Number(value))
        ? ''
        : String(value)
    input.addEventListener('change', function () {
      onchange(input.value === '' ? null : Number(input.value))
    })
    return input
  }

  function selectOne (value, options, onchange, disabled) {
    var s = document.createElement('select')
    s.disabled = !!disabled
    options.forEach(function (pair) {
      var v = Array.isArray(pair) ? pair[0] : pair
      var label = Array.isArray(pair) ? pair[1] : percentLabel(pair)
      s.appendChild(optionEl(v, label, value === v || value === Number(v)))
    })
    s.addEventListener('change', function () {
      onchange(s.value)
    })
    return s
  }

  function selectBright (value, onchange, steps) {
    var list = steps || STEPS
    var s = document.createElement('select')
    list.forEach(function (step) {
      s.appendChild(
        optionEl(String(step), percentLabel(step), quantize(value) === step)
      )
    })
    s.addEventListener('change', function () {
      onchange(Number(s.value))
    })
    return s
  }

  function scheduleMappingSave () {
    if (demo) {
      mappingStatusEl.textContent = ''
      renderLiveSources()
      return
    }
    mappingStatusEl.textContent = 'Saving…'
    clearTimeout(mappingTimer)
    mappingTimer = setTimeout(putMapping, 400)
  }

  function patchRow (rows, index, patch) {
    Object.keys(patch).forEach(function (key) {
      rows[index][key] = patch[key]
    })
    renderMapping()
    scheduleMappingSave()
  }

  function cellText (value) {
    var span = document.createElement('span')
    span.textContent = value
    return span
  }

  function appendCell (tr, node) {
    var td = document.createElement('td')
    td.appendChild(node)
    tr.appendChild(td)
  }

  function renderTimeTable () {
    var body = document.getElementById('time-body')
    body.innerHTML = ''
    timeRows.forEach(function (row, index) {
      var tr = document.createElement('tr')
      tr.setAttribute('data-bin', row.bin)
      appendCell(tr, cellText(modeLabel(row.bin)))
      appendCell(
        tr,
        selectBright(
          row.brightness,
          function (v) {
            patchRow(timeRows, index, { brightness: v })
          },
          INTENT_STEPS
        )
      )
      body.appendChild(tr)
    })
  }

  function renderSunTable () {
    var body = document.getElementById('sun-body')
    body.innerHTML = ''
    sunRows.forEach(function (row, index) {
      var tr = document.createElement('tr')
      tr.setAttribute('data-bin', row.bin)
      appendCell(tr, cellText(sunLabel(row.bin)))
      appendCell(
        tr,
        selectOne(
          row.mode,
          [
            ['day', 'Day'],
            ['night', 'Night']
          ],
          function (v) {
            patchRow(sunRows, index, { mode: v })
          }
        )
      )
      appendCell(
        tr,
        selectBright(
          row.brightness,
          function (v) {
            patchRow(sunRows, index, { brightness: v })
          },
          INTENT_STEPS
        )
      )
      body.appendChild(tr)
    })
  }

  function renderLuxTable () {
    var body = document.getElementById('lux-body')
    body.innerHTML = ''
    luxRows.forEach(function (row, index) {
      var tr = document.createElement('tr')
      tr.setAttribute('data-row', String(index))
      appendCell(
        tr,
        numberInput(row.luxMin, function (v) {
          patchRow(luxRows, index, { luxMin: v })
        })
      )
      appendCell(
        tr,
        numberInput(row.luxMax, function (v) {
          patchRow(luxRows, index, { luxMax: v })
        })
      )
      appendCell(
        tr,
        selectOne(
          row.mode,
          [
            ['day', 'Day'],
            ['night', 'Night']
          ],
          function (v) {
            patchRow(luxRows, index, { mode: v })
          }
        )
      )
      appendCell(
        tr,
        selectBright(
          row.brightness,
          function (v) {
            patchRow(luxRows, index, { brightness: v })
          },
          INTENT_STEPS
        )
      )
      var remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'hit'
      remove.textContent = 'Remove'
      remove.addEventListener('click', function () {
        luxRows.splice(index, 1)
        renderMapping()
        scheduleMappingSave()
      })
      appendCell(tr, remove)
      body.appendChild(tr)
    })
  }

  function appendNativeSelectAll (body) {
    var tr = document.createElement('tr')
    tr.className = 'native-all'
    var th = document.createElement('th')
    th.scope = 'row'
    th.textContent = 'Select for all'
    tr.appendChild(th)
    appendCell(tr, cellText(''))
    appendCell(
      tr,
      paletteSelect('navico', 'night', mappingPalettes.navicoNight, function (v) {
        patchPalettes({ navicoNight: v })
      })
    )
    appendCell(tr, cellText(''))
    appendCell(
      tr,
      paletteSelect(
        'raymarine',
        'night',
        mappingPalettes.raymarineNight,
        function (v) {
          patchPalettes({ raymarineNight: v })
        }
      )
    )
    body.appendChild(tr)
  }

  function appendNativeRow (body, row, index, night) {
    var tr = document.createElement('tr')
    appendCell(tr, cellText(percentLabel(row.brightness)))
    appendCell(
      tr,
      selectBright(row.navicoBrightness, function (v) {
        patchRow(nativeRows, index, { navicoBrightness: v })
      })
    )
    if (night) {
      appendCell(
        tr,
        paletteSelect('navico', 'night', mappingPalettes.navicoNight, function (v) {
          patchPalettes({ navicoNight: v })
        })
      )
    }
    appendCell(
      tr,
      selectBright(row.raymarineBrightness, function (v) {
        patchRow(nativeRows, index, { raymarineBrightness: v })
      })
    )
    if (night) {
      appendCell(
        tr,
        paletteSelect(
          'raymarine',
          'night',
          mappingPalettes.raymarineNight,
          function (v) {
            patchPalettes({ raymarineNight: v })
          }
        )
      )
    }
    body.appendChild(tr)
  }

  function renderNativeTable () {
    var dayBody = document.getElementById('native-day-body')
    var nightBody = document.getElementById('native-night-body')
    dayBody.innerHTML = ''
    nightBody.innerHTML = ''
    nativeRows.forEach(function (row, index) {
      if (row.mode === 'day') {
        appendNativeRow(dayBody, row, index, false)
      }
    })
    appendNativeSelectAll(nightBody)
    nativeRows.forEach(function (row, index) {
      if (row.mode === 'night') {
        appendNativeRow(nightBody, row, index, true)
      }
    })
  }

  function renderMapping () {
    renderTimeTable()
    renderSunTable()
    renderLuxTable()
    renderNativeTable()
    renderLiveSources()
  }

  function applyMappingBody (body) {
    if (body.luxPath) {
      luxPath = body.luxPath
    }
    if (typeof body.luxAvailable === 'boolean') {
      hasLux = body.luxAvailable
    }
    applyLuxUi()
    if (body.time) {
      timeRows = body.time
    }
    if (body.sun) {
      sunRows = body.sun
    }
    if (body.lux) {
      luxRows = body.lux
    }
    nativeRows = Array.isArray(body.native) ? body.native : emptyNativeRows()
    mappingPalettes = {
      navicoNight:
        (body.palettes && body.palettes.navicoNight) || defaultPalettes().navicoNight,
      raymarineNight:
        (body.palettes && body.palettes.raymarineNight) ||
        defaultPalettes().raymarineNight
    }
    renderMapping()
  }

  function putMapping () {
    fetch('/plugins/signalk-n2k-displays/mapping', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        time: timeRows,
        sun: sunRows,
        lux: luxRows,
        native: nativeRows,
        palettes: mappingPalettes
      })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok) {
          mappingStatusEl.textContent = result.body.message || 'Save failed'
          return
        }
        applyMappingBody(result.body)
        mappingStatusEl.textContent = ''
      })
      .catch(function () {
        mappingStatusEl.textContent = 'Save failed'
      })
  }

  function defaultMappingTables () {
    return {
      time: [
        { bin: 'day', brightness: 0.6 },
        { bin: 'night', brightness: 0.3 }
      ],
      sun: [
        ['nauticalDawn', 'night', 0.3],
        ['dawn', 'night', 0.4],
        ['sunrise', 'day', 0.4],
        ['day', 'day', 0.6],
        ['sunset', 'day', 0.4],
        ['dusk', 'night', 0.4],
        ['nauticalDusk', 'night', 0.3],
        ['night', 'night', 0.2]
      ].map(function (row) {
        return {
          bin: row[0],
          mode: row[1],
          brightness: row[2]
        }
      }),
      lux: [
        { luxMin: 0, luxMax: 1, mode: 'night', brightness: 0.2 },
        { luxMin: 1, luxMax: 10, mode: 'night', brightness: 0.3 },
        { luxMin: 10, luxMax: 100, mode: 'night', brightness: 0.4 },
        { luxMin: 100, luxMax: 1000, mode: 'day', brightness: 0.4 },
        { luxMin: 1000, luxMax: 10000, mode: 'day', brightness: 0.6 },
        { luxMin: 10000, luxMax: null, mode: 'day', brightness: 1 }
      ],
      native: emptyNativeRows(),
      palettes: defaultPalettes()
    }
  }

  function loadMapping () {
    if (demo) {
      hasLux = true
      applyMappingBody(defaultMappingTables())
      return Promise.resolve()
    }
    return fetch('/plugins/signalk-n2k-displays/mapping', { credentials: 'include' })
      .then(function (res) {
        return res.json()
      })
      .then(applyMappingBody)
      .catch(function () {
        mappingStatusEl.textContent = 'Mapping unavailable'
      })
  }

  document.getElementById('lux-add').addEventListener('click', function () {
    luxRows.push({
      luxMin: null,
      luxMax: null,
      mode: 'night',
      brightness: 0.2
    })
    renderMapping()
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
    renderLiveSources()
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
      if (path === luxPath && flat[path] !== undefined) {
        hasLux = true
      }
      if (
        path.indexOf('electrical.displays') === 0 ||
        path === 'environment.mode' ||
        path === 'environment.sun' ||
        (hasLux && path === luxPath)
      ) {
        applyPath(path, flat[path])
      }
    })
    applyLuxUi()
    render()
    renderLiveSources()
  }

  function subscribeWs () {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(proto + '//' + location.host + '/signalk/v1/stream?subscribe=none')
    ws.onopen = function () {
      backoff = 500
      statusEl.textContent = 'Live'
      var subscribe = [
        { path: 'electrical.displays.*', period: 1000 },
        { path: 'environment.mode', period: 1000 },
        { path: 'environment.sun', period: 1000 }
      ]
      if (hasLux) {
        subscribe.push({ path: luxPath, period: 1000 })
      }
      ws.send(
        JSON.stringify({
          context: 'vessels.self',
          subscribe: subscribe
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
    return fetch('/signalk/v1/api/vessels/self', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('no signalk')
        }
        return res.json()
      })
      .then(function (tree) {
        hydrate(tree)
        return true
      })
      .catch(function () {
        return false
      })
  }

  function seedDemo () {
    statusEl.textContent = ''
    applyPath(INTENT.control, 'auto')
    applyPath(INTENT.mode, 'night')
    applyPath(INTENT.brightness, 0.4)
    applyPath('electrical.displays.navico.group1.brightness', 0.4)
    applyPath('electrical.displays.navico.group1.nightModeColor', 'red')
    applyPath('electrical.displays.raymarine.helm1.brightness', 0.4)
    applyPath('electrical.displays.raymarine.helm1.color', 'red/black')
    applyPath('environment.outside.lux', 733)
    applyPath('environment.sun', 'dusk')
    applyPath('environment.mode', 'night')
    hasLux = true
    applyMappingBody(defaultMappingTables())
    render()
  }

  render()
  if (demo) {
    seedDemo()
  } else {
    loadMapping().then(function () {
      return loadTree()
    }).then(function (live) {
      if (live) {
        subscribeWs()
      } else {
        seedDemo()
      }
    })
  }
})()
