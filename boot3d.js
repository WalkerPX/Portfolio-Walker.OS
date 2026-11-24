// Walker.OS — 3D boot scene.
// Builds a dark room with a desk, monitor and tower in Three.js and moves the
// existing #screen element (off-state + boot terminal) onto the monitor glass
// with CSS3DRenderer, so index.html's boot()/typeBoot() keep driving the text.
// If WebGL is missing or this module fails to load, the 2D monitor stays as is.
import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const bootEl = document.getElementById('boot')
const screenEl = document.getElementById('screen')
const ledEl = document.getElementById('led')
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches
const LOGO = 'assets/logo-w-transparent.png'

const SCREEN_PX = { w: 800, h: 500 }          // DOM size of #screen in 3D mode (16:10)
const SCREEN_W = 1.76                          // world width of the monitor glass
const SCREEN_POS = new THREE.Vector3(0, 1.17, 0.075)

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) }
  catch (e) { return false }
}

// Session restore (returning from the gallery) hides #boot before this runs.
if (bootEl && screenEl && hasWebGL() && !bootEl.classList.contains('hidden')) {
  init().catch((err) => {
    console.warn('[boot3d] falling back to 2D monitor:', err)
    bootEl.classList.remove('three-on')
  })
}

async function init() {
  const ACC = new THREE.Color('#6B9FFF')

  // ---------- renderers ----------
  const stage = document.createElement('div')
  stage.id = 'stage3d'
  stage.setAttribute('aria-label', 'Walker.OS computer. Click to boot.')
  bootEl.prepend(stage)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  stage.appendChild(renderer.domElement)

  const css = new CSS3DRenderer()
  css.domElement.className = 'css3d'
  stage.appendChild(css.domElement)

  const hint = document.createElement('div')
  hint.className = 'hint3d'
  hint.textContent = 'drag to look around  ·  click to boot'
  stage.appendChild(hint)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#07070d')
  scene.fog = new THREE.Fog('#07070d', 7, 16)
  const cssScene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60)

  // ---------- materials ----------
  const std = (color, roughness = 0.6, metalness = 0.2, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  const shell = std('#1d1d34', 0.42, 0.35)      // same family as the 2D bezel (#2a2a50 → #181830)
  const shellDark = std('#121224', 0.55, 0.3)
  const trim = std('#2a2a50', 0.3, 0.75)
  const glass = std('#04040a', 0.18, 0.1, { emissive: ACC.clone(), emissiveIntensity: 0 })
  const keyMat = std('#191930', 0.6, 0.15)
  const ringMat = std('#0c0c18', 0.4, 0.2, { emissive: ACC.clone(), emissiveIntensity: 0.5 })
  const ledMat = std('#0b140f', 0.4, 0, { emissive: new THREE.Color('#00ff88'), emissiveIntensity: 0 })
  const hddMat = std('#140f08', 0.4, 0, { emissive: new THREE.Color('#ffb547'), emissiveIntensity: 0 })

  const logoTex = await loadTexture(LOGO)
  await document.fonts.ready.catch(() => {})
  const logoMat = (glow) => new THREE.MeshStandardMaterial({
    map: logoTex, transparent: true, roughness: 0.35, metalness: 0.4,
    emissive: new THREE.Color('#ffffff'), emissiveMap: logoTex, emissiveIntensity: glow,
    alphaTest: 0.02,
  })

  const mesh = (geo, material, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, material)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }
  const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 4, r)

  // ---------- room ----------
  const floor = mesh(new THREE.PlaneGeometry(40, 40), std('#0a0a12', 0.92, 0), 0, -1.15, 0)
  floor.rotation.x = -Math.PI / 2
  mesh(new THREE.PlaneGeometry(40, 14), std('#0c0c17', 0.95, 0), 0, 3, -2.3)

  const desk = std('#15131d', 0.72, 0.08)
  mesh(rbox(4.8, 0.08, 2.1, 0.02), desk, 0.25, -0.04, 0.3)
  for (const [x, z] of [[-2.0, -0.6], [2.5, -0.6], [-2.0, 1.2], [2.5, 1.2]]) mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), desk, x, -0.63, z)

  // ---------- monitor ----------
  const monitor = new THREE.Group()
  scene.add(monitor)
  mesh(rbox(2.05, 1.45, 0.14, 0.05), shell, 0, 1.12, 0, monitor)              // bezel
  mesh(rbox(1.7, 1.2, 0.6, 0.12), shellDark, 0, 1.12, -0.36, monitor)        // rear housing
  mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_W * SCREEN_PX.h / SCREEN_PX.w), glass, SCREEN_POS.x, SCREEN_POS.y, 0.071, monitor)
  mesh(new THREE.BoxGeometry(0.3, 0.42, 0.16), shellDark, 0, 0.25, -0.3, monitor) // neck
  mesh(rbox(0.9, 0.05, 0.55, 0.02), trim, 0, 0.025, -0.2, monitor)             // base

  // chin: logo + wordmark
  mesh(new THREE.PlaneGeometry(0.15, 0.15), logoMat(0.5), -0.24, 0.5, 0.072, monitor)
  mesh(new THREE.PlaneGeometry(0.52, 0.065), labelMat('WALKER.OS'), 0.1, 0.5, 0.072, monitor)
  mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), ledMat, 0.88, 0.5, 0.072, monitor) // power LED

  // ---------- tower ----------
  const tower = new THREE.Group()
  tower.position.set(1.72, 0.725, -0.15)
  tower.rotation.y = -0.28
  scene.add(tower)
  mesh(rbox(0.6, 1.45, 1.3, 0.04), shell, 0, 0, 0, tower)
  mesh(new THREE.PlaneGeometry(0.5, 1.35), shellDark, 0, 0, 0.651, tower)       // front panel
  // logo badge — the hero brand placement
  mesh(new THREE.CircleGeometry(0.175, 64), trim, 0, 0.3, 0.653, tower)
  const ring = mesh(new THREE.TorusGeometry(0.178, 0.007, 12, 96), ringMat, 0, 0.3, 0.655, tower)
  ring.castShadow = false
  mesh(new THREE.PlaneGeometry(0.27, 0.27), logoMat(0.6), 0, 0.3, 0.656, tower)
  mesh(new THREE.PlaneGeometry(0.42, 0.055), labelMat('WALKER.OS'), 0, 0.06, 0.653, tower)
  // power button + ring
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 32), trim, 0, 0.56, 0.66, tower).rotation.x = Math.PI / 2
  mesh(new THREE.TorusGeometry(0.052, 0.005, 10, 48), ringMat, 0, 0.56, 0.661, tower)
  mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), hddMat, 0.17, 0.56, 0.656, tower) // drive activity LED
  // drive bays + vents
  for (const y of [-0.12, -0.21]) mesh(new THREE.BoxGeometry(0.42, 0.065, 0.01), shellDark, 0, y, 0.656, tower)
  const vents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.012, 0.006), std('#06060c', 0.8, 0), 9)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 9; i++) vents.setMatrixAt(i, m4.makeTranslation(0, -0.33 - i * 0.04, 0.655))
  tower.add(vents)

  // ---------- keyboard + mouse ----------
  const kb = new THREE.Group()
  kb.position.set(-0.05, 0.022, 0.9)
  kb.rotation.y = 0.04
  scene.add(kb)
  mesh(rbox(1.5, 0.045, 0.5, 0.015), shellDark, 0, 0, 0, kb)
  const cols = 15, rows = 5
  const keys = new THREE.InstancedMesh(rbox(0.082, 0.03, 0.082, 0.01), keyMat, cols * rows)
  keys.castShadow = true
  for (let r = 0, i = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
    keys.setMatrixAt(i, m4.makeTranslation((c - (cols - 1) / 2) * 0.094, 0.035, (r - (rows - 1) / 2) * 0.092))
  }
  kb.add(keys)
  const mouse = mesh(new THREE.SphereGeometry(1, 24, 16), shellDark, 1.08, 0.03, 0.92)
  mouse.scale.set(0.075, 0.035, 0.115)

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#3a4a80', '#040406', 0.6))
  const key = new THREE.SpotLight('#a9bfff', 75, 14, 0.55, 0.65, 2)
  key.position.set(-2.6, 4.2, 3.2)
  key.target.position.set(0.4, 0.6, 0)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0004
  scene.add(key, key.target)
  const rim = new THREE.PointLight(ACC, 10, 9, 2)
  rim.position.set(2.8, 2.4, -1.9)
  scene.add(rim)
  const screenLight = new THREE.PointLight(ACC, 0, 5, 2)
  screenLight.position.set(0, 1.15, 0.7)
  scene.add(screenLight)

  // ---------- move the live #screen onto the glass ----------
  const holder = document.createElement('div')
  holder.className = 'screen3d'
  holder.appendChild(screenEl)
  const screenObj = new CSS3DObject(holder)
  screenObj.position.copy(SCREEN_POS)
  screenObj.scale.setScalar(SCREEN_W / SCREEN_PX.w)
  cssScene.add(screenObj)
  bootEl.classList.add('three-on')

  // ---------- camera rig ----------
  const T = new THREE.Vector3(0.35, 0.85, 0)
  const look = new THREE.Vector3()
  let R = 5.2
  let yaw = 0.2, pitch = 0.13, tYaw = 0.2, tPitch = 0.13, hx = 0, hy = 0
  const YAW = [-0.6, 0.6], PITCH = [0.03, 0.38]

  function resize() {
    const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight
    renderer.setSize(w, h)
    css.setSize(w, h)
    camera.aspect = w / h
    const narrow = camera.aspect < 0.85
    T.x = narrow ? 0.05 : 0.35
    const halfW = narrow ? 1.25 : 2.4
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
    R = Math.max(5.2, halfW / tanH)
    scene.fog.near = R + 0.5
    scene.fog.far = R + 10
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize)
  resize()

  // drag to orbit (limited), click to boot
  let down = null
  stage.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, yaw: tYaw, pitch: tPitch, moved: false }
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect()
    hx = ((e.clientX - r.left) / r.width) * 2 - 1
    hy = ((e.clientY - r.top) / r.height) * 2 - 1
    if (!down) return
    const dx = e.clientX - down.x, dy = e.clientY - down.y
    if (Math.hypot(dx, dy) > 5) { down.moved = true; stage.classList.add('dragging') }
    tYaw = THREE.MathUtils.clamp(down.yaw - dx * 0.004, ...YAW)
    tPitch = THREE.MathUtils.clamp(down.pitch + dy * 0.003, ...PITCH)
  })
  const end = () => {
    if (down && !down.moved && typeof window.boot === 'function') window.boot()
    down = null
    stage.classList.remove('dragging')
  }
  stage.addEventListener('pointerup', end)
  stage.addEventListener('pointercancel', () => { down = null; stage.classList.remove('dragging') })

  // ---------- power state, mirrored from the existing LED ----------
  let on = ledEl ? ledEl.classList.contains('on') : false
  if (ledEl) new MutationObserver(() => {
    on = ledEl.classList.contains('on')
    if (on) { hint.classList.add('gone'); flickerUntil = clock.elapsedTime + 0.7 }
  }).observe(ledEl, { attributes: true, attributeFilter: ['class'] })

  // ---------- zoom into the screen when boot finishes ----------
  let zoom = null
  window.WOS3D = {
    zoom() {
      if (REDUCE) return
      zoom = { t0: clock.elapsedTime, from: camera.position.clone(), fromLook: look.clone() }
    },
  }

  // stop rendering once the desktop takes over
  let raf = 0
  new MutationObserver(() => {
    if (bootEl.classList.contains('hidden')) setTimeout(() => { cancelAnimationFrame(raf); raf = 0 }, 1400)
    else if (!raf) frame()
  }).observe(bootEl, { attributes: true, attributeFilter: ['class'] })

  // ---------- loop ----------
  const clock = new THREE.Clock()
  let power = 0, flickerUntil = 0
  const zoomTo = new THREE.Vector3(SCREEN_POS.x, SCREEN_POS.y, 1.45)
  const ease = (k) => 1 - Math.pow(1 - k, 3)

  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime

    // power ramp + CRT warm-up flicker
    power += ((on ? 1 : 0) - power) * Math.min(1, dt * 2.2)
    const flick = t < flickerUntil ? 0.55 + Math.random() * 0.45 : 1
    screenLight.intensity = power * 3.4 * flick
    glass.emissiveIntensity = power * 0.25 * flick
    ledMat.emissiveIntensity = on ? 2.2 : 0
    ringMat.emissiveIntensity = on ? 1.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.4)) // idle "press me" pulse
    hddMat.emissiveIntensity = on ? (Math.random() > 0.55 ? 2.5 : 0.15) : 0

    // camera
    if (zoom) {
      const k = ease(Math.min(1, (t - zoom.t0) / 1.1))
      camera.position.lerpVectors(zoom.from, zoomTo, k)
      look.lerpVectors(zoom.fromLook, SCREEN_POS, k)
    } else {
      const s = Math.min(1, dt * 4)
      yaw += (tYaw - yaw) * s
      pitch += (tPitch - pitch) * s
      const drift = REDUCE ? 0 : 1
      const y = yaw + hx * 0.05 * drift + Math.sin(t * 0.25) * 0.015 * drift
      const p = pitch - hy * 0.025 * drift
      camera.position.set(
        T.x + R * Math.sin(y) * Math.cos(p),
        T.y + R * Math.sin(p),
        T.z + R * Math.cos(y) * Math.cos(p),
      )
      look.copy(T)
    }
    camera.lookAt(look)

    renderer.render(scene, camera)
    css.render(cssScene, camera)
  }
  frame()
}

function loadTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      resolve(tex)
    }, undefined, () => resolve(null)) // missing logo → plain badge, scene still loads
  })
}

function labelMat(text) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#C0C8E0'
  g.font = '500 64px "JetBrains Mono", monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if ('letterSpacing' in g) g.letterSpacing = '14px'
  g.fillText(text, c.width / 2, c.height / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.5, metalness: 0.2,
    emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25,
  })
}
