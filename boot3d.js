// Walker.OS — 3D boot room.
// A dark room with a desk setup, posters and room objects drawn from the
// portfolio's themes (photography, game day, baseball, history, law). The
// existing #screen element (off-state + boot terminal) is mapped onto the
// monitor glass with CSS3DRenderer, so index.html's boot()/typeBoot() still
// drive the text. Without WebGL the 2D monitor in index.html is used instead.
import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const bootEl = document.getElementById('boot')
const screenEl = document.getElementById('screen')
const ledEl = document.getElementById('led')
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches

// Palette — the site's own tokens
const P = { bg: '#141420', surf: '#1A1A2E', elev: '#222240', acc: '#8CB4FF', acc2: '#6B9FFF', text: '#F0F4FF', dim: '#C0C8E0', muted: '#8894B0' }

const SCREEN_PX = { w: 800, h: 500 }
const SCREEN_W = 1.76
const SCREEN_POS = new THREE.Vector3(0, 1.17, 0.075)

const ZOOM = { min: 3.4, max: 7.6 }
const YAW = [-0.65, 0.65]
const PITCH = [0.02, 0.42]

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) }
  catch (e) { return false }
}

if (bootEl && screenEl && hasWebGL() && !bootEl.classList.contains('hidden')) {
  init().catch((err) => {
    console.warn('[boot3d] falling back to 2D monitor:', err)
    bootEl.classList.remove('three-on')
  })
}

async function init() {
  const ACC = new THREE.Color(P.acc2)
  await document.fonts.ready.catch(() => {})

  // ---------- renderers ----------
  const stage = document.createElement('div')
  stage.id = 'stage3d'
  stage.setAttribute('role', 'button')
  stage.setAttribute('aria-label', 'Walker.OS computer. Click the computer to boot.')
  bootEl.prepend(stage)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  stage.appendChild(renderer.domElement)

  const css = new CSS3DRenderer()
  css.domElement.className = 'css3d'
  stage.appendChild(css.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#06060b')
  scene.fog = new THREE.Fog('#06060b', 9, 20)
  const cssScene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60)

  // depth of field — focus follows the monitor
  let composer = null, bokeh = null
  if (!REDUCE) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bokeh = new BokehPass(scene, camera, { focus: 5, aperture: 0.0016, maxblur: 0.006 })
    composer.addPass(bokeh)
    composer.addPass(new OutputPass())
  }

  // ---------- helpers ----------
  const std = (color, roughness = 0.6, metalness = 0.2, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 4, r)
  const add = (geo, material, x = 0, y = 0, z = 0, parent = scene, shadow = true) => {
    const m = new THREE.Mesh(geo, material)
    m.position.set(x, y, z)
    m.castShadow = shadow
    m.receiveShadow = true
    parent.add(m)
    return m
  }
  const group = (x = 0, y = 0, z = 0, ry = 0, parent = scene) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.rotation.y = ry
    parent.add(g)
    return g
  }

  // materials
  const shell = std('#1d1d34', 0.42, 0.35)
  const shellDark = std('#121224', 0.55, 0.3)
  const trim = std('#2a2a50', 0.3, 0.75)
  const frameMat = std('#0d0d16', 0.5, 0.4)
  const glass = std('#04040a', 0.15, 0.1, { emissive: ACC.clone(), emissiveIntensity: 0 })
  const ringMat = std('#0c0c18', 0.4, 0.2, { emissive: ACC.clone(), emissiveIntensity: 0.5 })
  const ledMat = std('#0b140f', 0.4, 0, { emissive: new THREE.Color('#00ff88'), emissiveIntensity: 0 })
  const hddMat = std('#140f08', 0.4, 0, { emissive: new THREE.Color('#ffb547'), emissiveIntensity: 0 })
  const wallMat = std('#0f0f1a', 0.94, 0)
  const deskMat = std('#15131d', 0.7, 0.08)

  // ---------- room ----------
  const ROOM = { l: -4.2, r: 4.6, back: -1.6, floor: -1.15, ceil: 3.6 }
  const floor = add(new THREE.PlaneGeometry(9, 9), std('#0a0a12', 0.88, 0.05), 0.2, ROOM.floor, 1.9, scene, false)
  floor.rotation.x = -Math.PI / 2
  const ceil = add(new THREE.PlaneGeometry(9, 9), std('#08080f', 1, 0), 0.2, ROOM.ceil, 1.9, scene, false)
  ceil.rotation.x = Math.PI / 2
  add(new THREE.PlaneGeometry(8.8, 4.75), wallMat, 0.2, 1.225, ROOM.back, scene, false)
  const lw = add(new THREE.PlaneGeometry(7, 4.75), wallMat, ROOM.l, 1.225, 1.9, scene, false)
  lw.rotation.y = Math.PI / 2
  const rw = add(new THREE.PlaneGeometry(7, 4.75), wallMat, ROOM.r, 1.225, 1.9, scene, false)
  rw.rotation.y = -Math.PI / 2
  // baseboards
  add(new THREE.BoxGeometry(8.8, 0.12, 0.03), frameMat, 0.2, ROOM.floor + 0.06, ROOM.back + 0.015, scene, false)
  add(new THREE.BoxGeometry(0.03, 0.12, 7), frameMat, ROOM.l + 0.015, ROOM.floor + 0.06, 1.9, scene, false)
  add(new THREE.BoxGeometry(0.03, 0.12, 7), frameMat, ROOM.r - 0.015, ROOM.floor + 0.06, 1.9, scene, false)
  // rug
  const rug = add(new THREE.CircleGeometry(1.5, 64), std('#12122a', 1, 0), -0.3, ROOM.floor + 0.005, 1.9, scene, false)
  rug.rotation.x = -Math.PI / 2
  rug.scale.set(1.3, 1, 1)

  // desk
  add(rbox(4.8, 0.08, 2.1, 0.02), deskMat, 0.25, -0.04, 0.3)
  for (const [x, z] of [[-2.0, -0.6], [2.5, -0.6], [-2.0, 1.2], [2.5, 1.2]]) add(new THREE.BoxGeometry(0.07, 1.1, 0.07), deskMat, x, -0.63, z)
  const mat = add(rbox(1.9, 0.006, 0.7, 0.003), std('#0b0b18', 0.95, 0), -0.05, 0.003, 0.95, scene, false)

  // ---------- computer (no branding) ----------
  const computer = new THREE.Group()
  scene.add(computer)
  const monitor = group(0, 0, 0, 0, computer)
  add(rbox(2.05, 1.45, 0.14, 0.05), shell, 0, 1.12, 0, monitor)
  add(rbox(1.7, 1.2, 0.6, 0.12), shellDark, 0, 1.12, -0.36, monitor)
  add(new THREE.PlaneGeometry(SCREEN_W, SCREEN_W * SCREEN_PX.h / SCREEN_PX.w), glass, SCREEN_POS.x, SCREEN_POS.y, 0.071, monitor, false)
  add(new THREE.BoxGeometry(0.3, 0.42, 0.16), shellDark, 0, 0.25, -0.3, monitor)
  add(rbox(0.9, 0.05, 0.55, 0.02), trim, 0, 0.025, -0.2, monitor)
  add(new THREE.BoxGeometry(0.03, 0.03, 0.01), ledMat, 0.88, 0.5, 0.072, monitor, false)

  const tower = group(1.72, 0.725, -0.15, -0.28, computer)
  add(rbox(0.6, 1.45, 1.3, 0.04), shell, 0, 0, 0, tower)
  add(new THREE.PlaneGeometry(0.5, 1.35), shellDark, 0, 0, 0.651, tower, false)
  const pb = add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 40), trim, 0, 0.45, 0.66, tower)
  pb.rotation.x = Math.PI / 2
  add(new THREE.TorusGeometry(0.07, 0.007, 12, 64), ringMat, 0, 0.45, 0.662, tower, false)
  add(new THREE.BoxGeometry(0.02, 0.02, 0.01), hddMat, 0.17, 0.45, 0.656, tower, false)
  for (const y of [0.12, 0.02]) add(new THREE.BoxGeometry(0.42, 0.065, 0.01), shellDark, 0, y, 0.656, tower, false)
  const vents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.012, 0.006), std('#06060c', 0.8, 0), 12)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 12; i++) vents.setMatrixAt(i, m4.makeTranslation(0, -0.18 - i * 0.042, 0.655))
  tower.add(vents)

  const kb = group(-0.05, 0.022, 0.9, 0.04, computer)
  add(rbox(1.5, 0.045, 0.5, 0.015), shellDark, 0, 0, 0, kb)
  const keys = new THREE.InstancedMesh(rbox(0.082, 0.03, 0.082, 0.01), std('#191930', 0.6, 0.15), 75)
  keys.castShadow = true
  for (let r = 0, i = 0; r < 5; r++) for (let c = 0; c < 15; c++, i++) keys.setMatrixAt(i, m4.makeTranslation((c - 7) * 0.094, 0.035, (r - 2) * 0.092))
  kb.add(keys)
  const mouse = add(new THREE.SphereGeometry(1, 24, 16), shellDark, 1.08, 0.03, 0.92, computer)
  mouse.scale.set(0.075, 0.035, 0.115)

  // ---------- desk objects ----------
  // camera (photography)
  const cam = group(-1.3, 0, 0.55, 0.5)
  add(rbox(0.34, 0.21, 0.13, 0.03), std('#101018', 0.5, 0.3), 0, 0.105, 0, cam)
  add(rbox(0.12, 0.06, 0.1, 0.02), std('#101018', 0.5, 0.3), -0.02, 0.235, 0, cam)
  const lens = add(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 40), std('#0a0a10', 0.35, 0.6), 0.03, 0.1, 0.13, cam)
  lens.rotation.x = Math.PI / 2
  const lensGlass = add(new THREE.CircleGeometry(0.06, 40), std('#0b1230', 0.05, 0.9, { emissive: ACC.clone(), emissiveIntensity: 0.15 }), 0.03, 0.1, 0.211, cam, false)
  lensGlass.rotation.y = 0
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), trim, 0.11, 0.22, 0.02, cam)

  // law books
  const books = group(-1.95, 0, -0.25, 0.25)
  const spines = [['CON LAW', '#1b1b3a'], ['CIV PRO', '#222240'], ['TORTS', '#16162c']]
  spines.forEach(([title, color], i) => {
    const h = 0.085
    const b = group(0, h / 2 + i * h, 0, (i - 1) * 0.08, books)
    add(rbox(0.52, h, 0.36, 0.008), std(color, 0.75, 0.05), 0, 0, 0, b)
    add(new THREE.PlaneGeometry(0.5, h * 0.8), labelMat(title, { color: P.dim, w: 512, h: 80 }), 0, 0, 0.181, b, false)
  })

  // mug
  const mug = group(0.95, 0, 0.62)
  add(new THREE.CylinderGeometry(0.065, 0.058, 0.15, 32), std('#1d1d34', 0.35, 0.1), 0, 0.075, 0, mug)
  const handle = add(new THREE.TorusGeometry(0.04, 0.012, 10, 24, Math.PI), std('#1d1d34', 0.35, 0.1), 0.065, 0.08, 0, mug)
  handle.rotation.z = -Math.PI / 2

  // desk lamp
  const lamp = group(-2.05, 0, 0.35, 0.6)
  add(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 32), frameMat, 0, 0.015, 0, lamp)
  const arm1 = add(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 10), trim, 0.1, 0.34, 0, lamp)
  arm1.rotation.z = -0.3
  const arm2 = add(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 10), trim, 0.38, 0.75, 0, lamp)
  arm2.rotation.z = 1.05
  const head = add(new THREE.ConeGeometry(0.11, 0.18, 32, 1, true), std('#141424', 0.5, 0.4, { side: THREE.DoubleSide }), 0.62, 0.78, 0, lamp)
  head.rotation.z = 0.5
  add(new THREE.SphereGeometry(0.035, 16, 12), std('#fff', 0.2, 0, { emissive: new THREE.Color('#e6ecff'), emissiveIntensity: 2 }), 0.6, 0.74, 0, lamp, false)
  const lampLight = new THREE.SpotLight('#e6ecff', 9, 3.5, 0.75, 0.8, 2)
  lampLight.position.set(0.6, 0.74, 0)
  lamp.add(lampLight)
  lampLight.target.position.set(1.0, -0.2, 0.2)
  lamp.add(lampLight.target)

  // router (home networking) with blinking LEDs
  const router = group(2.4, 0, 0.75, -0.4)
  add(rbox(0.42, 0.06, 0.26, 0.02), std('#101018', 0.5, 0.2), 0, 0.03, 0, router)
  for (const x of [-0.16, 0, 0.16]) {
    const a = add(new THREE.CylinderGeometry(0.008, 0.01, 0.28, 8), std('#101018', 0.5, 0.2), x, 0.2, -0.11, router)
    a.rotation.z = x * 1.2
  }
  const routerLeds = []
  for (let i = 0; i < 4; i++) {
    const m = std('#05050a', 0.3, 0, { emissive: new THREE.Color(i === 0 ? '#00ff88' : P.acc), emissiveIntensity: 1 })
    routerLeds.push(m)
    add(new THREE.BoxGeometry(0.018, 0.008, 0.004), m, -0.12 + i * 0.06, 0.035, 0.131, router, false)
  }

  // baseball on a stand
  const ball = group(-0.85, 0, -0.45)
  add(new THREE.CylinderGeometry(0.035, 0.045, 0.03, 20), trim, 0, 0.015, 0, ball)
  add(new THREE.SphereGeometry(0.045, 24, 16), std('#e9e6df', 0.7, 0, { map: seamTexture() }), 0, 0.075, 0, ball)

  // plant
  plant(2.45, 0, -0.45, 0.5)

  // ---------- chair ----------
  const chair = group(-0.75, ROOM.floor, 2.05, 0.35)
  const chairMat = std('#14142a', 0.8, 0.1)
  add(rbox(0.6, 0.09, 0.58, 0.04), chairMat, 0, 0.55, 0, chair)
  add(rbox(0.56, 0.62, 0.08, 0.04), chairMat, 0, 0.92, 0.28, chair)
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 12), trim, 0, 0.3, 0, chair)
  for (let i = 0; i < 5; i++) {
    const leg = add(new THREE.BoxGeometry(0.04, 0.03, 0.34), trim, 0, 0.06, 0, chair)
    leg.rotation.y = (i / 5) * Math.PI * 2
    leg.translateZ(0.17)
  }

  // ---------- walls: posters, prints, shelf, window ----------
  const posterTex = {
    gameDay: canvasTex(600, 840, drawGameDay),
    aperture: canvasTex(600, 840, drawAperture),
    law: canvasTex(600, 840, drawLaw),
    diamond: canvasTex(600, 840, drawDiamond),
    history: canvasTex(1200, 420, drawHistory),
  }
  framed(posterTex.gameDay, 0.78, 1.09, -2.05, 1.75, ROOM.back)
  framed(posterTex.aperture, 0.62, 0.87, 2.05, 2.0, ROOM.back)
  framed(posterTex.diamond, 0.62, 0.87, 2.9, 1.65, ROOM.back)
  const hist = framed(posterTex.history, 1.7, 0.6, ROOM.l, 2.25, 0.3, Math.PI / 2)
  const lawP = framed(posterTex.law, 0.7, 0.98, ROOM.l, 1.3, 2.1, Math.PI / 2)
  // two of the portfolio's own photos as framed prints
  loadTexture('photos/thumbs/photos_baseball_brody-bat-flip.jpg').then((t) => t && framed(t, 0.62, 0.44, 0.0, 2.55, ROOM.back, 0, true))
  loadTexture('photos/thumbs/photos_bts_notre-dame-golden-dome.jpg').then((t) => t && framed(t, 0.5, 0.36, ROOM.l, 1.25, 0.25, Math.PI / 2, true))

  // shelf with a football and books, LED strip underneath
  const shelf = group(-2.55, 0.85, ROOM.back + 0.14)
  add(new THREE.BoxGeometry(1.25, 0.04, 0.26), deskMat, 0, 0, 0, shelf)
  add(new THREE.BoxGeometry(1.15, 0.012, 0.012), std('#05050a', 0.3, 0, { emissive: ACC.clone(), emissiveIntensity: 2.2 }), 0, -0.026, 0.09, shelf, false)
  const fb = add(new THREE.SphereGeometry(1, 28, 18), std('#3b2418', 0.75, 0.05, { map: laceTexture() }), -0.3, 0.12, 0, shelf)
  fb.scale.set(0.17, 0.1, 0.1)
  fb.rotation.y = 0.4
  ;['#1b1b3a', '#2a2a50', '#16162c', '#222240'].forEach((c, i) => {
    const b = add(rbox(0.045, 0.24 - i * 0.015, 0.18, 0.006), std(c, 0.7, 0.05), 0.2 + i * 0.05, 0.14 - i * 0.0075, 0, shelf)
    if (i === 3) b.rotation.z = -0.22
  })
  const strip = new THREE.PointLight(ACC, 2.5, 2.2, 2)
  strip.position.set(-2.55, 0.7, ROOM.back + 0.35)
  scene.add(strip)

  // night window on the right wall
  const win = group(ROOM.r - 0.01, 1.55, 0.4, -Math.PI / 2)
  add(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(512, 410, drawNight), fog: false }), 0, 0, 0.005, win, false)
  for (const [w, h, x, y] of [[1.58, 0.05, 0, 0.62], [1.58, 0.05, 0, -0.62], [0.05, 1.28, 0.77, 0], [0.05, 1.28, -0.77, 0], [0.035, 1.2, 0, 0], [1.5, 0.035, 0, 0]]) {
    add(new THREE.BoxGeometry(w, h, 0.05), frameMat, x, y, 0.025, win, false)
  }
  add(new THREE.BoxGeometry(1.7, 0.04, 0.16), frameMat, 0, -0.66, 0.08, win)

  // tall plant in the corner
  plant(3.9, ROOM.floor, -1.15, 1.5)

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#2e3a6e', '#030305', 0.45))
  const key = new THREE.SpotLight('#b4c6ff', 70, 14, 0.6, 0.7, 2)
  key.position.set(-1.8, 3.4, 3.2)
  key.target.position.set(0.3, 0.6, -0.3)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0004
  scene.add(key, key.target)
  const wash = new THREE.SpotLight(P.acc, 30, 9, 0.9, 0.9, 2)       // soft wash over the back wall
  wash.position.set(0.5, 3.5, 1.2)
  wash.target.position.set(0.5, 1.4, ROOM.back)
  scene.add(wash, wash.target)
  const sideWash = new THREE.SpotLight('#9fb3ff', 18, 7, 0.8, 0.9, 2)
  sideWash.position.set(-1.5, 3.4, 1.4)
  sideWash.target.position.set(ROOM.l, 1.6, 1.2)
  scene.add(sideWash, sideWash.target)
  const moon = new THREE.DirectionalLight('#6B9FFF', 0.35)
  moon.position.set(6, 3, 0.6)
  scene.add(moon)
  const rim = new THREE.PointLight(ACC, 8, 8, 2)
  rim.position.set(2.8, 2.4, -1.2)
  scene.add(rim)
  const screenLight = new THREE.PointLight(ACC, 0, 5, 2)
  screenLight.position.set(0, 1.15, 0.7)
  scene.add(screenLight)

  // ---------- the live #screen on the glass ----------
  const holder = document.createElement('div')
  holder.className = 'screen3d'
  holder.appendChild(screenEl)
  const screenObj = new CSS3DObject(holder)
  screenObj.position.copy(SCREEN_POS)
  screenObj.scale.setScalar(SCREEN_W / SCREEN_PX.w)
  cssScene.add(screenObj)
  bootEl.classList.add('three-on')

  // ---------- camera rig: damped orbit + zoom ----------
  const T = new THREE.Vector3(0.3, 0.85, 0)
  const look = new THREE.Vector3()
  let baseR = 5.4
  const cur = { yaw: 0.22, pitch: 0.14, r: 5.4 }
  const tgt = { yaw: 0.22, pitch: 0.14, r: 5.4 }

  function resize() {
    const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight
    renderer.setSize(w, h)
    css.setSize(w, h)
    composer?.setSize(w, h)
    camera.aspect = w / h
    const narrow = camera.aspect < 0.85
    T.x = narrow ? 0.05 : 0.3
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
    baseR = Math.max(5.4, (narrow ? 1.25 : 2.5) / tanH)
    ZOOM.max = Math.max(7.6, baseR * 1.15)
    tgt.r = THREE.MathUtils.clamp(baseR, ZOOM.min, ZOOM.max)
    scene.fog.near = baseR + 3
    scene.fog.far = baseR + 14
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize)
  resize()
  cur.r = tgt.r

  // pointer: drag to orbit, pinch to zoom, click the computer to boot
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const pointers = new Map()
  let drag = null, pinch = 0, hover = false, on = false

  const hitsComputer = (x, y) => {
    const r = stage.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObject(computer, true).length > 0
  }
  stage.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    stage.setPointerCapture(e.pointerId)
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: tgt.yaw, pitch: tgt.pitch, moved: false }
    else { drag = null; pinch = pinchDist() }
  })
  stage.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2 && pinch) {
      const d = pinchDist()
      tgt.r = THREE.MathUtils.clamp(tgt.r * (pinch / d), ZOOM.min, ZOOM.max)
      pinch = d
      return
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (Math.hypot(dx, dy) > 5) { drag.moved = true; stage.classList.add('dragging') }
      tgt.yaw = THREE.MathUtils.clamp(drag.yaw - dx * 0.0045, ...YAW)
      tgt.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.0032, ...PITCH)
      return
    }
    hover = !on && hitsComputer(e.clientX, e.clientY)
    stage.classList.toggle('hot', hover)
  })
  const release = (e) => {
    const wasClick = drag && !drag.moved && pointers.size === 1
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinch = 0
    if (wasClick && !on && hitsComputer(e.clientX, e.clientY) && typeof window.boot === 'function') window.boot()
    drag = null
    stage.classList.remove('dragging')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  stage.addEventListener('pointerleave', () => { hover = false; stage.classList.remove('hot') })
  stage.addEventListener('wheel', (e) => {
    e.preventDefault()
    tgt.r = THREE.MathUtils.clamp(tgt.r * (1 + Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0012), ZOOM.min, ZOOM.max)
  }, { passive: false })
  function pinchDist() {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y) || 1
  }

  // power state mirrors the existing LED element
  let flickerUntil = 0
  const clock = new THREE.Clock()
  if (ledEl) new MutationObserver(() => {
    on = ledEl.classList.contains('on')
    if (on) { flickerUntil = clock.elapsedTime + 0.7; hover = false; stage.classList.remove('hot') }
  }).observe(ledEl, { attributes: true, attributeFilter: ['class'] })

  // zoom into the screen when boot finishes
  let zoom = null
  window.WOS3D = {
    zoom() { if (!REDUCE) zoom = { t0: clock.elapsedTime, from: camera.position.clone(), fromLook: look.clone() } },
  }

  // stop rendering once the desktop takes over
  let raf = 0
  new MutationObserver(() => {
    if (bootEl.classList.contains('hidden')) setTimeout(() => { cancelAnimationFrame(raf); raf = 0 }, 1400)
    else if (!raf) frame()
  }).observe(bootEl, { attributes: true, attributeFilter: ['class'] })

  // ---------- loop ----------
  let power = 0, cue = 0
  const zoomTo = new THREE.Vector3(SCREEN_POS.x, SCREEN_POS.y, 1.45)
  const ease = (k) => 1 - Math.pow(1 - k, 3)

  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime

    power += ((on ? 1 : 0) - power) * Math.min(1, dt * 2.2)
    cue += ((hover ? 1 : 0) - cue) * Math.min(1, dt * 8)
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.2)
    const flick = t < flickerUntil ? 0.55 + Math.random() * 0.45 : 1
    screenLight.intensity = power * 3.4 * flick + (on ? 0 : 0.35 + breathe * 0.35 + cue * 1.2)
    glass.emissiveIntensity = power * 0.25 * flick + (on ? 0 : 0.02 + breathe * 0.025 + cue * 0.06)
    ledMat.emissiveIntensity = on ? 2.2 : 0
    ringMat.emissiveIntensity = on ? 1.8 : 0.4 + breathe * 0.9 + cue * 1.6
    hddMat.emissiveIntensity = on ? (Math.random() > 0.55 ? 2.5 : 0.15) : 0
    routerLeds.forEach((m, i) => { m.emissiveIntensity = i === 0 ? 1.2 : Math.sin(t * (3 + i * 1.7) + i) > 0.2 ? 1.6 : 0.15 })

    if (zoom) {
      const k = ease(Math.min(1, (t - zoom.t0) / 1.1))
      camera.position.lerpVectors(zoom.from, zoomTo, k)
      look.lerpVectors(zoom.fromLook, SCREEN_POS, k)
    } else {
      const s = Math.min(1, dt * 5)
      cur.yaw += (tgt.yaw - cur.yaw) * s
      cur.pitch += (tgt.pitch - cur.pitch) * s
      cur.r += (tgt.r - cur.r) * s
      const drift = REDUCE ? 0 : Math.sin(t * 0.25) * 0.012
      const y = cur.yaw + drift, p = cur.pitch
      camera.position.set(
        T.x + cur.r * Math.sin(y) * Math.cos(p),
        T.y + cur.r * Math.sin(p),
        T.z + cur.r * Math.cos(y) * Math.cos(p),
      )
      look.copy(T)
    }
    camera.lookAt(look)

    if (composer) {
      bokeh.uniforms.focus.value = camera.position.distanceTo(SCREEN_POS)
      composer.render()
    } else renderer.render(scene, camera)
    css.render(cssScene, camera)
  }
  frame()

  // ---------- builders that need scope ----------
  function framed(tex, w, h, x, y, z, ry = 0, photo = false) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.rotation.y = ry
    // offset off the wall along the frame's own normal
    g.translateZ(0.02)
    scene.add(g)
    add(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.03), frameMat, 0, 0, 0, g)
    if (photo) add(new THREE.PlaneGeometry(w, h), std('#d9dcea', 0.9, 0), 0, 0, 0.016, g, false)
    const inset = photo ? 0.06 : 0
    add(new THREE.PlaneGeometry(w - inset * 2, h - inset * 2), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.85, metalness: 0,
      emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: photo ? 0.12 : 0.1,
    }), 0, 0, 0.017, g, false)
    return g
  }

  function plant(x, y, z, s) {
    const g = group(x, y, z)
    g.scale.setScalar(s)
    add(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 24), std('#1b1b2e', 0.7, 0.1), 0, 0.15, 0, g)
    const leaf = std('#1d3a32', 0.8, 0)
    for (let i = 0; i < 9; i++) {
      const l = add(new THREE.SphereGeometry(1, 10, 8), leaf, 0, 0, 0, g)
      const a = (i / 9) * Math.PI * 2
      l.scale.set(0.05, 0.22, 0.02)
      l.position.set(Math.cos(a) * 0.08, 0.48 + (i % 3) * 0.06, Math.sin(a) * 0.08)
      l.rotation.set(Math.sin(a) * 0.6, -a, Math.cos(a) * 0.6)
    }
  }
}

// ---------- textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function loadTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      resolve(tex)
    }, undefined, () => resolve(null))
  })
}

function labelMat(text, { color = P.dim, w = 1024, h = 128 } = {}) {
  const tex = canvasTex(w, h, (g) => {
    g.fillStyle = color
    g.font = `600 ${Math.round(h * 0.42)}px "JetBrains Mono", monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if ('letterSpacing' in g) g.letterSpacing = '6px'
    g.fillText(text, w / 2, h / 2)
  })
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, emissive: new THREE.Color('#fff'), emissiveMap: tex, emissiveIntensity: 0.15 })
}

function seamTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#b8373a'; g.lineWidth = 3
    for (const off of [0.3, 0.7]) {
      g.beginPath()
      for (let x = 0; x <= w; x += 4) g.lineTo(x, h * off + Math.sin((x / w) * Math.PI * 4) * h * 0.14)
      g.stroke()
    }
  })
}

function laceTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#3b2418'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#e8e4da'
    g.fillRect(w * 0.47, h * 0.12, w * 0.06, h * 0.34)
    for (let i = 0; i < 6; i++) g.fillRect(w * 0.44, h * (0.15 + i * 0.05), w * 0.12, h * 0.018)
    g.fillRect(w * 0.08, h * 0.1, w * 0.04, h * 0.8)
    g.fillRect(w * 0.88, h * 0.1, w * 0.04, h * 0.8)
  })
}

function posterBase(g, w, h) {
  g.fillStyle = P.surf
  g.fillRect(0, 0, w, h)
  const grd = g.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, h * 0.8)
  grd.addColorStop(0, 'rgba(107,159,255,0.10)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)
}
function posterTitle(g, w, h, title, sub) {
  g.textAlign = 'left'
  g.fillStyle = P.text
  g.font = '700 76px Inter, sans-serif'
  if ('letterSpacing' in g) g.letterSpacing = '-1px'
  g.fillText(title, 44, h - 92)
  g.fillStyle = P.muted
  g.font = '500 20px "JetBrains Mono", monospace'
  if ('letterSpacing' in g) g.letterSpacing = '4px'
  g.fillText(sub, 46, h - 50)
  g.strokeStyle = P.acc
  g.lineWidth = 3
  g.beginPath(); g.moveTo(46, h - 170); g.lineTo(150, h - 170); g.stroke()
}

function drawGameDay(g, w, h) {
  posterBase(g, w, h)
  const top = 50, bottom = h - 210
  g.strokeStyle = 'rgba(192,200,224,0.25)'; g.lineWidth = 2
  for (let i = 0; i <= 8; i++) { const y = top + ((bottom - top) / 8) * i; g.beginPath(); g.moveTo(40, y); g.lineTo(w - 40, y); g.stroke() }
  const los = top + (bottom - top) * 0.6
  g.strokeStyle = P.acc; g.lineWidth = 3; g.setLineDash([10, 8])
  g.beginPath(); g.moveTo(40, los); g.lineTo(w - 40, los); g.stroke(); g.setLineDash([])
  g.strokeStyle = P.text; g.lineWidth = 4
  for (let i = 0; i < 7; i++) { const x = 120 + i * 60; g.beginPath(); g.arc(x, los + 34, 16, 0, Math.PI * 2); g.stroke() }
  g.strokeStyle = P.muted
  for (let i = 0; i < 6; i++) { const x = 140 + i * 66, y = los - 60 - (i % 2) * 40; g.beginPath(); g.moveTo(x - 13, y - 13); g.lineTo(x + 13, y + 13); g.moveTo(x + 13, y - 13); g.lineTo(x - 13, y + 13); g.stroke() }
  g.strokeStyle = P.acc; g.lineWidth = 4
  const routes = [[120, 140, 60], [480, 400, 90], [300, 380, 220]]
  for (const [x0, x1, up] of routes) {
    g.beginPath(); g.moveTo(x0, los + 14); g.quadraticCurveTo(x0, los - up, x1, los - up - 120); g.stroke()
    g.beginPath(); g.arc(x1, los - up - 120, 7, 0, Math.PI * 2); g.fillStyle = P.acc; g.fill()
  }
  posterTitle(g, w, h, 'GAME DAY', 'SATURDAYS · STUDENT SECTION')
}

function drawAperture(g, w, h) {
  posterBase(g, w, h)
  const cx = w / 2, cy = h * 0.38
  for (let ring = 0; ring < 7; ring++) {
    const r = 230 - ring * 30
    g.strokeStyle = ring % 2 ? 'rgba(140,180,255,0.55)' : 'rgba(192,200,224,0.28)'
    g.lineWidth = 2.5
    g.beginPath()
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + ring * 0.18
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
      i ? g.lineTo(x, y) : g.moveTo(x, y)
    }
    g.stroke()
  }
  g.fillStyle = '#05050b'
  g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill()
  g.fillStyle = P.acc
  g.font = '700 30px "JetBrains Mono", monospace'
  g.textAlign = 'center'
  g.fillText('f/1.8', cx, cy + 290)
  posterTitle(g, w, h, 'EXPOSURE', 'PHOTOGRAPHY · DIGITAL MEDIA')
}

function drawLaw(g, w, h) {
  posterBase(g, w, h)
  const cx = w / 2, top = 110
  g.strokeStyle = P.dim; g.lineWidth = 5; g.lineCap = 'round'
  g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, top + 380); g.stroke()
  g.beginPath(); g.moveTo(cx - 130, top + 410); g.lineTo(cx + 130, top + 410); g.stroke()
  g.beginPath(); g.moveTo(cx - 190, top + 70); g.lineTo(cx + 190, top + 50); g.stroke()
  for (const [x, y] of [[cx - 190, top + 70], [cx + 190, top + 50]]) {
    g.strokeStyle = 'rgba(192,200,224,0.6)'; g.lineWidth = 2.5
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 70, y + 160); g.moveTo(x, y); g.lineTo(x + 70, y + 160); g.stroke()
    g.strokeStyle = P.acc; g.lineWidth = 5
    g.beginPath(); g.ellipse(x, y + 165, 76, 16, 0, 0, Math.PI); g.stroke()
  }
  g.fillStyle = P.acc
  g.beginPath(); g.arc(cx, top, 12, 0, Math.PI * 2); g.fill()
  posterTitle(g, w, h, 'STARE DECISIS', '1L · CON LAW · CIV PRO · TORTS')
}

function drawDiamond(g, w, h) {
  posterBase(g, w, h)
  const cx = w / 2, cy = h * 0.42, s = 150
  g.strokeStyle = 'rgba(192,200,224,0.3)'; g.lineWidth = 2.5
  g.beginPath(); g.arc(cx, cy + s, s * 2.25, Math.PI * 1.25, Math.PI * 1.75); g.stroke()
  g.beginPath(); g.moveTo(cx, cy + s); g.lineTo(cx - s * 1.9, cy - s * 0.9); g.moveTo(cx, cy + s); g.lineTo(cx + s * 1.9, cy - s * 0.9); g.stroke()
  g.strokeStyle = P.acc; g.lineWidth = 4
  g.beginPath(); g.moveTo(cx, cy + s); g.lineTo(cx + s, cy); g.lineTo(cx, cy - s); g.lineTo(cx - s, cy); g.closePath(); g.stroke()
  g.fillStyle = P.text
  for (const [x, y] of [[cx + s, cy], [cx, cy - s], [cx - s, cy]]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-11, -11, 22, 22); g.restore() }
  g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill()
  posterTitle(g, w, h, 'SUMMER BALL', 'COLLEGIATE BASEBALL · CREATIVE')
}

function drawHistory(g, w, h) {
  g.fillStyle = P.surf; g.fillRect(0, 0, w, h)
  g.fillStyle = P.text
  g.font = '700 64px Inter, sans-serif'
  g.textAlign = 'left'
  g.fillText('HISTORY', 56, 100)
  g.fillStyle = P.muted
  g.font = '500 20px "JetBrains Mono", monospace'
  g.fillText('B.A. · PURDUE ’26', 60, 138)
  const y = 260
  g.strokeStyle = 'rgba(192,200,224,0.35)'; g.lineWidth = 3
  g.beginPath(); g.moveTo(60, y); g.lineTo(w - 60, y); g.stroke()
  const marks = [['1607', 'Jamestown'], ['1776', 'Independence'], ['1865', 'Reconstruction'], ['1945', 'Postwar'], ['1969', 'Apollo'], ['2026', 'Today']]
  marks.forEach(([yr, lbl], i) => {
    const x = 100 + i * ((w - 200) / (marks.length - 1))
    g.fillStyle = i === marks.length - 1 ? P.acc : P.dim
    g.beginPath(); g.arc(x, y, i === marks.length - 1 ? 11 : 8, 0, Math.PI * 2); g.fill()
    g.textAlign = 'center'
    g.font = '700 26px "JetBrains Mono", monospace'
    g.fillText(yr, x, y - 28)
    g.fillStyle = P.muted
    g.font = '400 18px Inter, sans-serif'
    g.fillText(lbl, x, y + 44)
  })
}

function drawNight(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h)
  grd.addColorStop(0, '#0a1030')
  grd.addColorStop(1, '#151a3a')
  g.fillStyle = grd; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(240,244,255,${0.2 + Math.random() * 0.6})`
    g.fillRect(Math.random() * w, Math.random() * h * 0.7, 1.5, 1.5)
  }
  g.fillStyle = 'rgba(240,244,255,0.85)'
  g.beginPath(); g.arc(w * 0.72, h * 0.24, 22, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#07091c'
  for (let i = 0; i < 14; i++) { const bw = 24 + Math.random() * 30, bh = 40 + Math.random() * 120; g.fillRect(i * 38, h - bh, bw, bh) }
}
