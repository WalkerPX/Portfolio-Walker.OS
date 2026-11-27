// Walker.OS: entry gate, routes and the workspace picker.
//
// The landing and "Explore the room" are the same 3D room (boot3d.js). On the landing the camera is
// anchored at the desk and only the computer answers a click; Explore unlocks walking and the room's
// activities without reloading anything. Without WebGL the 2D monitor in index.html is used.
//
// Routes (History API; 404.html sends unknown deep links back to index.html with the path kept):
//   /                       the room, anchored at the desk
//   /explore                the room, free to walk
//   /workspace              the workspace picker
//   /workspace/<mode>       a workspace with no window open (creative | professional)
//   /app/<name>             a workspace with <name> as the front window
// Each history entry also carries the open windows, so Back and Forward restore exactly what was on
// screen: closing a window and pressing Back opens it again.
;(function () {
  const bootEl = document.getElementById('boot')
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches

  function hasWebGL() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) }
    catch (e) { return false }
  }
  const WEBGL = hasWebGL()
  const parse = (p) => window.WOS_parseRoute(p)
  const first = window.WOS_ROUTE || { view: 'room' }

  // ---------- the room ----------
  let roomRequested = false
  let wantExplore = first.view === 'explore'

  function startRoom() {
    if (!WEBGL || roomRequested || window.WOS3D) return
    roomRequested = true
    window.WOS_EXPLORE = wantExplore
    bootEl.classList.add('three-pending')
    const s = document.createElement('script')
    s.type = 'module'
    s.src = 'boot3d.js'
    s.onerror = () => { roomRequested = false; window.fallback2D && window.fallback2D() }
    document.body.appendChild(s)
    // the room never arrived (blocked CDN, slow network): back to the 2D monitor
    setTimeout(() => {
      if (!bootEl.classList.contains('three-on')) { roomRequested = false; window.fallback2D && window.fallback2D() }
    }, 20000)
  }

  function setExplore(v) {
    wantExplore = !!v && WEBGL
    window.WOS_EXPLORE = wantExplore
    bootEl.classList.toggle('exploring', wantExplore)
    if (window.WOS3D && WOS3D.setExplore) WOS3D.setExplore(wantExplore)
  }

  // ---------- router ----------
  const POPUPS = /^(preview|photoview-)/
  let applying = false, quietUntil = 0, timer = 0, ready = false
  let pushedExplore = false // the /explore entry was pushed from the landing, so "Back to the desk" can pop it

  function visibleWins() {
    return Object.keys(S.ow)
      .filter((n) => !POPUPS.test(n))
      .map((n) => document.getElementById('w-' + n))
      .filter((el) => el && el.style.display !== 'none' && (el.classList.contains('o') || el.classList.contains('anim')) && el.style.opacity !== '0')
      .sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0))
      .map((el) => el.id.slice(2))
  }
  function pickerShown() {
    const p = document.getElementById('modePicker')
    return !!p && p.classList.contains('show') && p.style.opacity !== '0'
  }
  function currentState() {
    if (!S.booted) return { v: wantExplore ? 'explore' : 'room' }
    if (pickerShown() || !MODE) return { v: 'picker' }
    return { v: 'desk', m: MODE, w: visibleWins() }
  }
  function pathFor(st) {
    if (st.v === 'explore') return '/explore'
    if (st.v === 'picker') return '/workspace'
    if (st.v === 'desk') return st.w.length ? '/app/' + st.w[st.w.length - 1] : '/workspace/' + st.m
    return '/'
  }
  const TITLES = { about: 'About', work: 'Work', projects: 'Projects', gallery: 'Gallery', contact: 'Contact', links: 'Links' }
  function titleFor(st) {
    const base = 'Walker Birchfield'
    if (st.v === 'explore') return 'The room · ' + base
    if (st.v === 'picker') return 'Walker.OS · ' + base
    if (st.v === 'desk') {
      const top = st.w[st.w.length - 1]
      return (top ? TITLES[top] : MODE_LABELS[st.m]) + ' · ' + base
    }
    return base
  }

  // write the visible state into the address bar: a new entry when the view changed, else in place
  function commit(forceReplace) {
    if (applying) return
    // mid-boot the address bar already names where the boot is headed; it settles once the desktop is up
    if (!S.booted && bootEl.classList.contains('booting')) return
    if (typeof SWAPPING !== 'undefined' && SWAPPING) { timer = setTimeout(commit, 200); return }
    const st = currentState()
    // an old-style ?mode=&open= link (the Law Library's) is kept until the boot has read it
    const path = pathFor(st) + (st.v === 'room' || st.v === 'explore' ? location.search : '')
    const prev = history.state && history.state.wos
    const samePath = location.pathname + location.search === path
    const sameState = prev && JSON.stringify(prev) === JSON.stringify(st)
    if (samePath && sameState) return
    const replace = forceReplace || !ready || !prev || samePath
    history[replace ? 'replaceState' : 'pushState']({ wos: st }, '', path + location.hash)
    document.title = titleFor(st)
    ready = true
  }
  function sync() {
    clearTimeout(timer)
    timer = setTimeout(commit, Math.max(380, quietUntil - performance.now()))
  }
  function quiet(ms) {
    quietUntil = Math.max(quietUntil, performance.now() + ms)
    if (timer) sync()
  }
  window.WOS_ROUTER = { sync, quiet, go: navigate }

  // push a room-level view (the desktop views push themselves through sync)
  function navigate(v) {
    clearTimeout(timer)
    const st = { v }
    history.pushState({ wos: st }, '', pathFor(st) + location.search)
    document.title = titleFor(st)
    ready = true
  }

  // ---------- applying a history entry ----------
  function settle(ms) {
    applying = true
    clearTimeout(timer)
    setTimeout(() => { applying = false; commit(true) }, ms)
  }

  function reconcile(want) {
    const have = visibleWins()
    have.filter((n) => !want.includes(n)).forEach((n) => closeWin(n))
    const open = want.filter((n) => !have.includes(n))
    open.forEach((n, i) => setTimeout(() => toggleWin(n), 60 + i * 80))
    const top = want[want.length - 1]
    if (top) setTimeout(() => { if (top in S.ow) focusWin(top) }, 120 + open.length * 80 + 360)
    return open.length * 80 + 520
  }

  function hidePicker() {
    const p = document.getElementById('modePicker')
    if (!p.classList.contains('show')) return
    p.style.opacity = '0'
    setTimeout(() => { p.classList.remove('show'); p.style.opacity = '' }, 320)
  }

  function apply(st) {
    // the room: leave the desktop if it is up, then anchor or free the camera
    if (st.v === 'room' || st.v === 'explore') {
      if (st.v === 'explore' && !WEBGL) { history.replaceState({ wos: { v: 'room' } }, '', '/'); st = { v: 'room' } }
      pushedExplore = false
      if (S.booted) unboot()
      setExplore(st.v === 'explore')
      if (!window.WOS3D) startRoom()
      document.title = titleFor(st)
      return settle(50)
    }
    // the desktop views: boot first if the room is showing
    if (!S.booted) {
      if (S.bi === 0) {
        if (bootEl.classList.contains('three-pending')) { settle(400); return setTimeout(() => apply(st), 450) }
        boot()
      }
      return settle(60) // boot() finishes on its own, and launchFromURL reads this entry's windows
    }
    if (st.v === 'picker') {
      if (MODE) snapshotSession(MODE)
      showModePicker()
      minimizeAll(() => {})
      return settle(Object.keys(S.ow).length * 55 + 400)
    }
    // desk
    const m = MODE_LABELS[st.m] ? st.m : appMode(st.w && st.w[st.w.length - 1])
    const want = (st.w || []).filter((n) => document.getElementById('w-' + n))
    if (pickerShown() || !MODE) {
      applyMode(m)
      const sw = document.getElementById('modeSwitch')
      if (sw) sw.classList.add('show')
      hidePicker()
      return settle(reconcile(want) + 200)
    }
    if (m !== MODE) {
      swapMode(m)
      applying = true
      const wait = () => (SWAPPING ? setTimeout(wait, 120) : settle(reconcile(want)))
      return setTimeout(wait, 120)
    }
    settle(reconcile(want))
  }

  addEventListener('popstate', (e) => {
    const st = (e.state && e.state.wos) || stateFromPath(location.pathname)
    apply(st)
  })

  function stateFromPath(path) {
    const r = parse(path)
    if (r.view === 'desk') {
      const w = r.app ? [r.app] : []
      return { v: 'desk', m: r.mode || appMode(r.app), w }
    }
    return { v: r.view === 'explore' ? 'explore' : r.view === 'picker' ? 'picker' : 'room' }
  }

  // ---------- buttons ----------
  const exploreBtn = document.getElementById('exploreBtn')
  const deskBtn = document.getElementById('deskBtn')
  if (exploreBtn) {
    if (!WEBGL) exploreBtn.hidden = true
    exploreBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (bootEl.classList.contains('booting') || S.booted) return
      setExplore(true)
      navigate('explore')
      pushedExplore = true
    })
  }
  if (deskBtn) {
    if (!WEBGL) deskBtn.hidden = true
    deskBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (pushedExplore) return history.back() // pop back to the landing entry instead of stacking a new one
      setExplore(false)
      navigate('room')
    })
  }

  // ---------- first load ----------
  if (first.unknown) history.replaceState(null, '', '/')
  if (first.view === 'picker' || first.view === 'desk') {
    // straight into the workspace: no room, no boot sequence
    if (!S.booted) bootDirect()
    sync()
  } else {
    if (first.view === 'explore' && !WEBGL) history.replaceState(null, '', '/')
    setExplore(wantExplore)
    startRoom()
    commit(true)
  }

  // ---------- picker: 3D logo ----------
  // A CSS 3D extrusion of the W mark: stacked steel layers darkening toward the back, a metal face
  // with a moving sheen (the same --metal finish as the workspace labels, see entry.css), gentle
  // sway, and a tilt that follows the pointer. No WebGL needed.
  const logo = document.getElementById('mpLogo3d')
  const picker = document.getElementById('modePicker')
  if (logo) {
    const tilt = logo.querySelector('.l3d')
    const spin = logo.querySelector('.l3d-spin')
    const DEPTH = 14
    for (let i = 0; i < DEPTH; i++) {
      const k = i / (DEPTH - 1)
      const d = document.createElement('div')
      d.className = 'l3d-layer'
      d.style.transform = `translateZ(${(i - DEPTH) * 1.1}px)`
      // steel edge: dark at the back, brighter toward the face
      const l = Math.round(14 + k * 34)
      d.style.setProperty('--c', `hsl(208 ${22 + k * 10}% ${l}%)`)
      spin.appendChild(d)
    }
    const face = document.createElement('div')
    face.className = 'l3d-layer l3d-face'
    face.style.transform = 'translateZ(0px)'
    const sheen = document.createElement('div')
    sheen.className = 'l3d-sheen'
    sheen.style.transform = 'translateZ(0.5px)'
    spin.append(face, sheen)

    if (picker && tilt && !REDUCE) {
      picker.addEventListener('pointermove', (e) => {
        const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5
        tilt.style.setProperty('--ry', `${nx * 22}deg`)
        tilt.style.setProperty('--rx', `${-ny * 14}deg`)
      })
      picker.addEventListener('pointerleave', () => {
        tilt.style.setProperty('--ry', '0deg')
        tilt.style.setProperty('--rx', '0deg')
      })
    }
  }

  // ---------- picker: menu bar clock ----------
  const clockEl = document.getElementById('mpClock')
  let clockTimer = 0
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const tick = () => { if (clockEl) clockEl.textContent = fmt.format(new Date()) }

  // ---------- picker: cards ----------
  document.querySelectorAll('.mp-card').forEach((card) => {
    card.tabIndex = 0
    card.setAttribute('role', 'button')
    const name = card.querySelector('.mp-name')?.textContent || card.dataset.mode
    card.setAttribute('aria-label', `Open the ${name} workspace`)
    // selected state shows before the zoom takes over (capture runs before the inline onclick)
    card.addEventListener('click', () => {
      document.querySelectorAll('.mp-card.chosen').forEach((c) => c.classList.remove('chosen'))
      card.classList.add('chosen')
    }, true)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        card.click()
      }
    })
  })

  // ---------- picker: animated 3D icons (picker-icons.js, three.js) ----------
  // Loaded the first time the picker opens. If WebGL or the module is unavailable, the flat
  // icons stay and the CSS hover styles still apply.
  let icons = null, iconsLoading = false
  function loadIcons() {
    if (!WEBGL || icons || iconsLoading || !picker) return
    iconsLoading = true
    import('./picker-icons.js')
      .then((m) => m.mountPickerIcons(picker))
      .then((h) => { icons = h; if (pickerShown()) h.start() })
      .catch((err) => console.warn('[picker] 3D icons unavailable, keeping the flat icons:', err))
      .finally(() => { iconsLoading = false })
  }

  // Hover highlights only "arm" once the pointer actually moves after the picker opens. Without
  // this, the cursor left over from clicking the computer sits on a card and lights it up.
  if (picker) {
    const arm = () => picker.classList.add('mp-armed')
    let wasShown = false
    const onShowChange = () => {
      // this observer edits the picker's own classes, so act only when "show" actually flips
      const shown = picker.classList.contains('show')
      if (shown === wasShown) return
      wasShown = shown
      if (shown) {
        picker.classList.remove('mp-armed')
        document.querySelectorAll('.mp-card.chosen').forEach((c) => c.classList.remove('chosen'))
        picker.addEventListener('pointermove', arm, { once: true })
        tick()
        clearInterval(clockTimer)
        clockTimer = setInterval(tick, 15000)
        loadIcons()
        if (icons) icons.start()
      } else {
        clearInterval(clockTimer)
        picker.removeEventListener('pointermove', arm)
        if (icons) icons.stop()
      }
    }
    new MutationObserver(onShowChange).observe(picker, { attributes: true, attributeFilter: ['class'] })
    onShowChange()
  }
})()
