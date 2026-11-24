// Walker.OS — 3D boot room.
// A dark room you can orbit all the way around. The desk computer boots the
// site; posters can be clicked for a close-up; a wall switch toggles the room
// lights; two windows look out on a late-night diner and a swirling night sky.
// The live #screen element (off-state + boot terminal) is mapped onto the
// monitor glass with CSS3DRenderer so index.html's boot()/typeBoot() drive it.
// Without WebGL the 2D monitor in index.html is used instead.
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

// Site palette
const P = { bg: '#141420', surf: '#1A1A2E', elev: '#222240', acc: '#8CB4FF', acc2: '#6B9FFF', text: '#F0F4FF', dim: '#C0C8E0', muted: '#8894B0', gold: '#d9b96a', crimson: '#c8463c', cream: '#f6edda' }

const SCREEN_PX = { w: 800, h: 500 }
const SCREEN_W = 1.76
const SCREEN_POS = new THREE.Vector3(0, 1.17, 0.075)

const ROOM = { l: -5.8, r: 6.2, back: -1.6, front: 7.6, floor: -1.15, ceil: 3.6 }
const ROOM_W = ROOM.r - ROOM.l, ROOM_D = ROOM.front - ROOM.back, ROOM_H = ROOM.ceil - ROOM.floor
const MID = { x: (ROOM.l + ROOM.r) / 2, z: (ROOM.back + ROOM.front) / 2, y: (ROOM.floor + ROOM.ceil) / 2 }
const C = new THREE.Vector3(0.2, 1.45, 2.2) // ceiling fixture
// first-person walker: eye height, speeds (units/s), body radius, start pose, look limits
const WALK = { eye: 1.7, speed: 2.0, run: 3.4, radius: 0.32, home: new THREE.Vector3(0.87, 1.7, 5.2), yaw0: 0.22, pitch0: 0.1, pitch: [-0.75, 0.95] }
// official logo files for the glowing wall marks (e.g. 'assets/logos/purdue.svg'); empty = built-in outlines
const TEAM_SVG = { purdue: '', iu: '' }
const HOOP_X = 1.45, RIM_R = 0.18, BALL_R = 0.09, GRAV = 12
const WIN = { z: 2.6, y: 1.35, w: 1.8, h: 1.5 }

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

  // ---------- renderers + overlay UI ----------
  const stage = document.createElement('div')
  stage.id = 'stage3d'
  stage.setAttribute('aria-label', 'Walker.OS room. Walk with W A S D or the arrow keys, drag to look, click the computer to boot.')
  bootEl.prepend(stage)

  const COARSE = matchMedia('(pointer: coarse)').matches
  const cueEl = document.createElement('div')
  cueEl.className = 'room-cue'
  cueEl.setAttribute('aria-live', 'polite')
  cueEl.innerHTML = '<span class="dot"></span><span class="t">Click the computer to enter</span>'
  const cueText = cueEl.querySelector('.t')
  const backEl = document.createElement('button')
  backEl.type = 'button'
  backEl.className = 'room-back'
  backEl.textContent = '← Back to room'
  const keysEl = document.createElement('div')
  keysEl.className = 'room-keys'
  keysEl.innerHTML = COARSE
    ? '<b>Pad</b> walk · <b>Drag</b> look · <b>Tap</b> ball to grab'
    : '<b>Click</b> to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · <b>Click</b> ball, <kbd>R</kbd> shoot · <kbd>Esc</kbd> free mouse'
  const crossEl = document.createElement('div')
  crossEl.className = 'room-cross'
  bootEl.append(crossEl)
  const padEl = document.createElement('div')
  padEl.className = 'room-pad'
  padEl.innerHTML = [['KeyW', '▲', 'u'], ['KeyA', '◀', 'l'], ['KeyS', '▼', 'd'], ['KeyD', '▶', 'r']]
    .map(([k, s, c]) => `<button type="button" class="${c}" data-k="${k}" aria-label="Walk ${{ u: 'forward', d: 'back', l: 'left', r: 'right' }[c]}">${s}</button>`).join('') +
    '<button type="button" class="shoot" data-k="shoot">Shoot</button>'
  bootEl.append(cueEl, backEl, keysEl, padEl)

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
  scene.background = new THREE.Color('#05050a')
  scene.fog = new THREE.Fog('#05050a', 12, 30)
  const cssScene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80)

  let composer = null, bokeh = null
  if (!REDUCE) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bokeh = new BokehPass(scene, camera, { focus: 5, aperture: 0.0014, maxblur: 0.005 })
    composer.addPass(bokeh)
    composer.addPass(new OutputPass())
  }

  // ---------- helpers ----------
  const std = (color, roughness = 0.6, metalness = 0.2, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...extra })
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
  // wall orientation: rotation that turns a +z-facing plane toward the room
  const FACE = { back: 0, front: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }
  const onWall = (wall, along, y) => {
    if (wall === 'back') return [along, y, ROOM.back]
    if (wall === 'front') return [along, y, ROOM.front]
    if (wall === 'left') return [ROOM.l, y, along]
    return [ROOM.r, y, along]
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

  // ---------- room shell ----------
  const floor = add(new THREE.PlaneGeometry(ROOM_W, ROOM_D), std('#0a0a12', 0.88, 0.05), MID.x, ROOM.floor, MID.z, scene, false)
  floor.rotation.x = -Math.PI / 2
  const ceil = add(new THREE.PlaneGeometry(ROOM_W, ROOM_D), std('#08080f', 1, 0), MID.x, ROOM.ceil, MID.z, scene, false)
  ceil.rotation.x = Math.PI / 2
  const holeY = WIN.y - MID.y
  const back = add(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat, MID.x, MID.y, ROOM.back, scene, false)
  const front = add(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat, MID.x, MID.y, ROOM.front, scene, false)
  front.rotation.y = Math.PI
  const lw = add(wallWithHole(ROOM_D, ROOM_H, -(WIN.z - MID.z), holeY, WIN.w, WIN.h), wallMat, ROOM.l, MID.y, MID.z, scene, false)
  lw.rotation.y = FACE.left
  const rw = add(wallWithHole(ROOM_D, ROOM_H, WIN.z - MID.z, holeY, WIN.w, WIN.h), wallMat, ROOM.r, MID.y, MID.z, scene, false)
  rw.rotation.y = FACE.right
  back.receiveShadow = front.receiveShadow = true
  // baseboards
  add(new THREE.BoxGeometry(ROOM_W, 0.12, 0.03), frameMat, MID.x, ROOM.floor + 0.06, ROOM.back + 0.015, scene, false)
  add(new THREE.BoxGeometry(ROOM_W, 0.12, 0.03), frameMat, MID.x, ROOM.floor + 0.06, ROOM.front - 0.015, scene, false)
  add(new THREE.BoxGeometry(0.03, 0.12, ROOM_D), frameMat, ROOM.l + 0.015, ROOM.floor + 0.06, MID.z, scene, false)
  add(new THREE.BoxGeometry(0.03, 0.12, ROOM_D), frameMat, ROOM.r - 0.015, ROOM.floor + 0.06, MID.z, scene, false)
  // rug + ceiling fixture
  const rug = add(new THREE.CircleGeometry(1.6, 64), std('#12122a', 1, 0), 0.1, ROOM.floor + 0.005, 2.7, scene, false)
  rug.rotation.x = -Math.PI / 2
  rug.scale.set(1.35, 1, 1)
  const ceilMat = std('#202030', 0.4, 0, { emissive: new THREE.Color('#e6ecff'), emissiveIntensity: 1.4 })
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 48), ceilMat, C.x, ROOM.ceil - 0.02, C.z, scene, false)
  add(new THREE.CylinderGeometry(0.47, 0.47, 0.02, 48), trim, C.x, ROOM.ceil - 0.005, C.z, scene, false)
  // door on the front wall
  // sized to the walker: eye 2.85 above the floor ≈ 1.65 m, so a 2.03 m × 0.9 m door is 3.5 × 1.55
  const DOOR = { w: 1.55, h: 3.5 }
  const door = group(4.4, ROOM.floor, ROOM.front, FACE.front)
  const doorMat = std('#17172a', 0.7, 0.1)
  add(rbox(DOOR.w - 0.06, DOOR.h, 0.05, 0.01), doorMat, 0, DOOR.h / 2, 0.03, door)
  for (const y of [DOOR.h * 0.72, DOOR.h * 0.3]) add(rbox(DOOR.w - 0.42, DOOR.h * (y > 2 ? 0.36 : 0.44), 0.02, 0.01), std('#141426', 0.75, 0.1), 0, y, 0.06, door, false)
  for (const [w, h, x, y] of [[DOOR.w + 0.16, 0.09, 0, DOOR.h + 0.045], [0.09, DOOR.h + 0.09, -(DOOR.w / 2 + 0.035), (DOOR.h + 0.09) / 2], [0.09, DOOR.h + 0.09, DOOR.w / 2 + 0.035, (DOOR.h + 0.09) / 2]])
    add(new THREE.BoxGeometry(w, h, 0.08), frameMat, x, y, 0.04, door)
  add(new THREE.SphereGeometry(0.045, 16, 12), trim, DOOR.w / 2 - 0.2, 1.75, 0.09, door) // handle at ~1 m

  // desk
  add(rbox(4.8, 0.08, 2.1, 0.02), deskMat, 0.25, -0.04, 0.3)
  for (const [x, z] of [[-2.0, -0.6], [2.5, -0.6], [-2.0, 1.2], [2.5, 1.2]]) add(new THREE.BoxGeometry(0.07, 1.1, 0.07), deskMat, x, -0.63, z)
  add(rbox(1.9, 0.006, 0.7, 0.003), std('#0b0b18', 0.95, 0), -0.05, 0.003, 0.95, scene, false)

  // ---------- computer (no branding) ----------
  const computer = new THREE.Group()
  computer.userData.kind = 'computer'
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
  const m4 = new THREE.Matrix4()
  const vents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.012, 0.006), std('#06060c', 0.8, 0), 12)
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
  add(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 40), std('#0a0a10', 0.35, 0.6), 0.03, 0.1, 0.13, cam).rotation.x = Math.PI / 2
  add(new THREE.CircleGeometry(0.06, 40), std('#0b1230', 0.05, 0.9, { emissive: ACC.clone(), emissiveIntensity: 0.15 }), 0.03, 0.1, 0.211, cam, false)
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), trim, 0.11, 0.22, 0.02, cam)

  // law books
  const books = group(-1.95, 0, -0.25, 0.25)
  ;[['CONTRACTS', '#1b1b3a'], ['CIV PRO', '#222240'], ['TORTS', '#16162c']].forEach(([title, color], i) => {
    const h = 0.085
    const b = group(0, h / 2 + i * h, 0, (i - 1) * 0.08, books)
    add(rbox(0.52, h, 0.36, 0.008), std(color, 0.75, 0.05), 0, 0, 0, b)
    add(new THREE.PlaneGeometry(0.5, h * 0.8), labelMat(title, { w: 512, h: 80 }), 0, 0, 0.181, b, false)
  })

  // legal pads + pen
  const pads = group(-1.0, 0, 1.12, 0.22)
  add(rbox(0.3, 0.012, 0.42, 0.004), std('#bfb46a', 0.85, 0), 0.03, 0.006, -0.02, pads, false).rotation.y = -0.12
  add(rbox(0.3, 0.014, 0.42, 0.004), std('#d6cc82', 0.85, 0), 0, 0.019, 0, pads, false)
  const sheet = add(new THREE.PlaneGeometry(0.28, 0.36), std('#ffffff', 0.9, 0, { map: canvasTex(280, 360, drawLegalSheet) }), 0, 0.0265, 0.02, pads, false)
  sheet.rotation.x = -Math.PI / 2
  add(new THREE.BoxGeometry(0.3, 0.012, 0.04), std('#7a2f28', 0.7, 0), 0, 0.026, -0.19, pads, false)
  const pen = add(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 10), trim, 0.2, 0.012, 0.02, pads)
  pen.rotation.set(Math.PI / 2, 0, 0.3)

  // scouting clipboard (sports management)
  const clip = group(-1.75, 0, 1.05, -0.3)
  add(rbox(0.3, 0.012, 0.4, 0.01), std('#2a2420', 0.7, 0), 0, 0.006, 0, clip, false)
  const rep = add(new THREE.PlaneGeometry(0.27, 0.35), std('#ffffff', 0.9, 0, { map: canvasTex(270, 350, drawScouting) }), 0, 0.0125, 0.015, clip, false)
  rep.rotation.x = -Math.PI / 2
  add(rbox(0.1, 0.02, 0.035, 0.006), trim, 0, 0.018, -0.18, clip, false)

  // mug
  const mug = group(0.95, 0, 0.55)
  add(new THREE.CylinderGeometry(0.065, 0.058, 0.15, 32), std('#1d1d34', 0.35, 0.1), 0, 0.075, 0, mug)
  add(new THREE.TorusGeometry(0.04, 0.012, 10, 24, Math.PI), std('#1d1d34', 0.35, 0.1), 0.065, 0.08, 0, mug).rotation.z = -Math.PI / 2

  // retro game controller
  const pad = group(1.72, 0, 1.08, -0.35)
  add(rbox(0.27, 0.035, 0.12, 0.03), std('#1c1c34', 0.5, 0.1), 0, 0.0175, 0, pad)
  add(new THREE.BoxGeometry(0.05, 0.008, 0.016), shellDark, -0.07, 0.038, 0, pad, false)
  add(new THREE.BoxGeometry(0.016, 0.008, 0.05), shellDark, -0.07, 0.038, 0, pad, false)
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.01, 16), std('#300', 0.4, 0, { emissive: new THREE.Color(P.crimson), emissiveIntensity: 0.4 }), 0.06, 0.038, 0.012, pad, false)
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.01, 16), std('#003', 0.4, 0, { emissive: ACC.clone(), emissiveIntensity: 0.4 }), 0.095, 0.038, -0.012, pad, false)

  // desk lamp
  const lamp = group(-2.05, 0, 0.35, 0.6)
  add(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 32), frameMat, 0, 0.015, 0, lamp)
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 10), trim, 0.1, 0.34, 0, lamp).rotation.z = -0.3
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 10), trim, 0.38, 0.75, 0, lamp).rotation.z = 1.05
  add(new THREE.ConeGeometry(0.11, 0.18, 32, 1, true), std('#141424', 0.5, 0.4, { side: THREE.DoubleSide }), 0.62, 0.78, 0, lamp).rotation.z = 0.5
  const bulbMat = std('#fff', 0.2, 0, { emissive: new THREE.Color('#e6ecff'), emissiveIntensity: 2 })
  add(new THREE.SphereGeometry(0.035, 16, 12), bulbMat, 0.6, 0.74, 0, lamp, false)
  const lampLight = new THREE.SpotLight('#e6ecff', 9, 3.5, 0.75, 0.8, 2)
  lampLight.position.set(0.6, 0.74, 0)
  lamp.add(lampLight)
  lampLight.target.position.set(1.0, -0.2, 0.2)
  lamp.add(lampLight.target)

  // router (home networking)
  const router = group(2.4, 0, 0.75, -0.4)
  add(rbox(0.42, 0.06, 0.26, 0.02), std('#101018', 0.5, 0.2), 0, 0.03, 0, router)
  for (const x of [-0.16, 0, 0.16]) add(new THREE.CylinderGeometry(0.008, 0.01, 0.28, 8), std('#101018', 0.5, 0.2), x, 0.2, -0.11, router).rotation.z = x * 1.2
  const routerLeds = []
  for (let i = 0; i < 4; i++) {
    const m = std('#05050a', 0.3, 0, { emissive: new THREE.Color(i === 0 ? '#00ff88' : P.acc), emissiveIntensity: 1 })
    routerLeds.push(m)
    add(new THREE.BoxGeometry(0.018, 0.008, 0.004), m, -0.12 + i * 0.06, 0.035, 0.131, router, false)
  }

  // baseball on a stand
  const baseball = group(-0.85, 0, -0.45)
  add(new THREE.CylinderGeometry(0.035, 0.045, 0.03, 20), trim, 0, 0.015, 0, baseball)
  add(new THREE.SphereGeometry(0.045, 24, 16), std('#e9e6df', 0.7, 0, { map: seamTexture() }), 0, 0.075, 0, baseball)

  plant(2.45, 0, -0.45, 0.5)
  plant(ROOM.r - 0.65, ROOM.floor, -1.15, 1.5)
  plant(ROOM.l + 0.75, ROOM.floor, 5.6, 1.3)

  // ---------- back wall: shelf, posters, light switch ----------
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

  const posters = []
  poster('back', -2.2, 1.85, 0.78, 1.09, canvasTex(600, 840, drawTripleOption), 'Triple Option')
  poster('back', 0, 2.64, 1.2, 0.55, canvasTex(1200, 550, drawFerrari), 'Scuderia Ferrari')
  poster('back', 2.2, 2.05, 1.0, 0.75, canvasTex(1000, 750, drawCamden), 'Camden Yards')
  poster('back', 3.6, 1.75, 0.62, 0.87, canvasTex(600, 840, drawContracts), 'Contracts')
  poster('left', 0.3, 2.3, 1.6, 0.56, canvasTex(1200, 420, drawHistory), 'History')
  poster('left', 4.7, 1.6, 0.7, 0.98, canvasTex(600, 840, drawAnalytics), 'Analytics')
  poster('front', -2.2, 1.7, 0.8, 1.12, canvasTex(600, 840, drawFinalFour), '2024 Purdue Boilermakers')
  poster('front', -1.05, 1.7, 0.8, 1.12, canvasTex(600, 840, drawIndiana), 'National Champions')
  poster('front', 0.2, 1.85, 0.62, 0.87, canvasTex(600, 840, drawAperture), 'Exposure')
  // same centre line and height as the Purdue and Indiana posters
  poster('front', -3.5, 1.7, 0.84, 1.12, canvasTex(900, 1200, (g, w, h) => drawBigTen(g, w, h)), 'Big Ten',
    { glowTex: canvasTex(900, 1200, (g, w, h) => drawBigTen(g, w, h, true)), glow: 0.75 })
  poster('right', 5.6, 1.75, 0.96, 1.28, canvasTex(900, 1200, drawSportsMgmt), 'Sports Management')

  // glowing team marks above the Purdue and Indiana posters
  const marks = [
    teamMark(purdueShapes(), -2.2, '#CEB888', '#d9b96a', 0.62, TEAM_SVG.purdue),
    teamMark(iuShapes(), -1.05, '#990000', '#e0303a', 0.95, TEAM_SVG.iu),
  ]

  // light switch (back wall, left of the shelf)
  const sw = group(-3.0, 1.3, ROOM.back + 0.008)
  sw.userData.kind = 'switch'
  add(rbox(0.1, 0.15, 0.014, 0.008), trim, 0, 0, 0, sw, false)
  const rocker = add(rbox(0.036, 0.07, 0.02, 0.006), std('#c0c8e0', 0.4, 0.1), 0, 0, 0.012, sw, false)
  const locator = std('#020', 0.4, 0, { emissive: new THREE.Color('#00ff88'), emissiveIntensity: 0 })
  add(new THREE.BoxGeometry(0.008, 0.008, 0.004), locator, 0, -0.055, 0.009, sw, false)

  // ---------- right wall: skate decks, cap ----------
  skateDeck(0.05, 1.65, 0.1, canvasTex(256, 1024, drawDeckA))
  skateDeck(0.95, 1.6, -0.08, canvasTex(256, 1024, drawDeckB))
  const capG = group(...onWall('right', 4.2, 1.7), FACE.right)
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), trim, 0, 0.12, 0.04, capG).rotation.x = Math.PI / 2
  const crown = add(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#1b1b3a', 0.85, 0), 0, 0.02, 0.1, capG)
  crown.rotation.x = -0.25
  const brim = add(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 24, 1, false, -Math.PI / 2, Math.PI), std(P.crimson, 0.8, 0), 0, 0.0, 0.2, capG)
  brim.rotation.x = -0.15

  // ---------- front wall: mini hoop + ball ----------
  const hoop = group(...onWall('front', HOOP_X, 1.95), FACE.front)
  add(rbox(0.9, 0.6, 0.03, 0.01), std('#1f1f38', 0.5, 0.1, { map: canvasTex(450, 300, drawBackboard) }), 0, 0, 0.05, hoop)
  add(new THREE.BoxGeometry(0.04, 0.04, 0.2), trim, 0, -0.22, 0.13, hoop)
  const rimMat = std('#c4622d', 0.5, 0.4, { emissive: new THREE.Color('#ff7a2e'), emissiveIntensity: 0 })
  add(new THREE.TorusGeometry(RIM_R, 0.011, 10, 48), rimMat, 0, -0.24, 0.36, hoop).rotation.x = Math.PI / 2
  const net = add(new THREE.CylinderGeometry(RIM_R, 0.12, 0.28, 14, 3, true), new THREE.MeshBasicMaterial({ color: '#c0c8e0', wireframe: true, transparent: true, opacity: 0.35 }), 0, -0.38, 0.36, hoop, false)
  const RIM = new THREE.Vector3(HOOP_X, 1.95 - 0.24, ROOM.front - 0.36)

  // seven-segment score ticker above the backboard (counts makes since the page loaded)
  const tickC = document.createElement('canvas')
  tickC.width = 384; tickC.height = 140
  const tickTex = new THREE.CanvasTexture(tickC)
  tickTex.colorSpace = THREE.SRGBColorSpace
  const SEG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
  function drawTicker(n) {
    const g = tickC.getContext('2d'), W = tickC.width, H = tickC.height
    g.fillStyle = '#07060a'; g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,181,71,0.55)'
    g.font = '600 15px "JetBrains Mono", monospace'; g.textAlign = 'left'
    if ('letterSpacing' in g) g.letterSpacing = '4px'
    g.fillText('BUCKETS', 18, 26)
    if ('letterSpacing' in g) g.letterSpacing = '0px'
    const digits = String(Math.min(n, 999)).padStart(3, '0')
    const dw = 62, dh = 92, t = 11, gap = 22, x0 = W - 18 - 3 * dw - 2 * gap, y = 36
    const rects = (x) => ({
      a: [x + t, y, dw - 2 * t, t], b: [x + dw - t, y + t, t, dh / 2 - 1.5 * t], c: [x + dw - t, y + dh / 2 + 0.5 * t, t, dh / 2 - 1.5 * t],
      d: [x + t, y + dh - t, dw - 2 * t, t], e: [x, y + dh / 2 + 0.5 * t, t, dh / 2 - 1.5 * t], f: [x, y + t, t, dh / 2 - 1.5 * t], g: [x + t, y + dh / 2 - t / 2, dw - 2 * t, t],
    })
    ;[...digits].forEach((d, i) => {
      const r = rects(x0 + i * (dw + gap))
      for (const k of 'abcdefg') {
        const lit = SEG[+d].includes(k)
        g.save()
        g.fillStyle = lit ? '#ffb547' : 'rgba(255,181,71,0.07)'
        if (lit) { g.shadowColor = '#ff8a1f'; g.shadowBlur = 16 }
        g.fillRect(...r[k])
        g.restore()
      }
    })
    tickTex.needsUpdate = true
  }
  drawTicker(0)
  const ticker = group(...onWall('front', HOOP_X, 2.6), FACE.front)
  add(rbox(0.7, 0.29, 0.07, 0.014), frameMat, 0, 0, 0.035, ticker)
  const tickMat = new THREE.MeshBasicMaterial({ map: tickTex, toneMapped: false })
  add(new THREE.PlaneGeometry(0.64, 0.233), tickMat, 0, 0, 0.0705, ticker, false)
  let tickBlink = 0

  // the ball: click to pick up, R (or tap) to shoot
  const ball = add(new THREE.SphereGeometry(BALL_R, 32, 20), std('#b85a26', 0.75, 0, { map: basketballTexture() }), HOOP_X - 0.35, ROOM.floor + BALL_R, ROOM.front - 1.0)
  ball.userData.kind = 'ball'
  const bv = new THREE.Vector3() // velocity
  let held = false, shot = null, makes = 0, shots = 0, swish = 0

  // confetti burst (one instanced mesh, recycled) + a soft flash at the rim
  const CONF_N = 220
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.034, 0.02), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF_N)
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  confetti.frustumCulled = false
  confetti.visible = false
  const confCols = [P.acc, P.gold, P.crimson, P.cream, '#00ff88', P.acc2].map((c) => new THREE.Color(c))
  const bits = Array.from({ length: CONF_N }, (_, i) => {
    confetti.setColorAt(i, confCols[i % confCols.length])
    return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, ph: Math.random() * 6.3 }
  })
  scene.add(confetti)
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, radialGlow('rgba(255,214,140,1)')), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }))
  flash.position.copy(RIM)
  scene.add(flash)
  let flashT = 9
  function burst() {
    for (const q of bits) {
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.7
      q.p.copy(RIM).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, -0.15 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2))
      q.v.set(Math.cos(a) * s, 2 + Math.random() * 2.8, Math.sin(a) * s - 1.1) // fan out toward the room
      q.r.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3)
      q.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(16)
      q.life = 2.4 + Math.random() * 1.6
    }
    confetti.visible = true
    flashT = 0
    swish = 1
  }

  // ---------- windows + the scenes outside ----------
  windowFrame('left')
  windowFrame('right')
  const outsideLeft = nighthawks()
  const sky = starryNight()

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#2e3a6e', '#030305', 0.5)
  scene.add(hemi)
  const key = new THREE.SpotLight('#b4c6ff', 70, 14, 0.6, 0.7, 2)
  key.position.set(-1.8, 3.4, 3.2)
  key.target.position.set(0.3, 0.6, -0.3)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0004
  scene.add(key, key.target)
  const wash = new THREE.SpotLight(P.acc, 30, 9, 0.9, 0.9, 2)
  wash.position.set(0.5, 3.5, 1.2)
  wash.target.position.set(0.5, 1.4, ROOM.back)
  scene.add(wash, wash.target)
  const fill = new THREE.PointLight('#a9bbff', 24, 11, 1.6) // ceiling fixture: lights all four walls
  fill.position.set(C.x, ROOM.ceil - 0.35, C.z)
  scene.add(fill)
  // second fixture over the front half of the room (hoop, team wall)
  const FRONT_LIGHT = new THREE.Vector3(0.2, ROOM.ceil - 0.35, 5.7)
  add(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 48), ceilMat, FRONT_LIGHT.x, ROOM.ceil - 0.02, FRONT_LIGHT.z, scene, false)
  add(new THREE.CylinderGeometry(0.37, 0.37, 0.02, 48), trim, FRONT_LIGHT.x, ROOM.ceil - 0.005, FRONT_LIGHT.z, scene, false)
  const fill2 = new THREE.PointLight('#a9bbff', 20, 8, 1.6)
  fill2.position.copy(FRONT_LIGHT)
  scene.add(fill2)
  const moon = new THREE.DirectionalLight('#6B9FFF', 0.35)
  moon.position.set(8, 3, 2.6)
  scene.add(moon)
  const dinerSpill = new THREE.SpotLight('#dfe6b0', 7, 8, 0.45, 0.9, 1.5)
  dinerSpill.position.set(ROOM.l - 1.2, WIN.y + 0.3, WIN.z)
  dinerSpill.target.position.set(-1.8, ROOM.floor, WIN.z + 0.3)
  scene.add(dinerSpill, dinerSpill.target)
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
  holder.style.pointerEvents = 'none' // CSS3DObject forces 'auto'; the stage handles all input
  screenObj.position.copy(SCREEN_POS)
  screenObj.scale.setScalar(SCREEN_W / SCREEN_PX.w)
  cssScene.add(screenObj)
  bootEl.classList.add('three-on')

  // ---------- camera rig ----------
  // yaw/pitch: forward = -(sin yaw · cos pitch, sin pitch, cos yaw · cos pitch)
  const cur = { yaw: WALK.yaw0, pitch: WALK.pitch0 }
  const tgt = { ...cur }
  const me = { p: WALK.home.clone(), v: new THREE.Vector3(), push: 0, bob: 0 }
  const pressed = new Set()
  // floor-plan obstacles the walker slides around: boxes [x0, z0, x1, z1] and posts [x, z, r]
  const SOLIDS = [[-2.15, -0.75, 2.65, 1.35], [HOOP_X - 0.5, ROOM.front - 0.62, HOOP_X + 0.5, ROOM.front]]
  const POSTS = [[ROOM.r - 0.65, -1.15, 0.45], [ROOM.l + 0.75, 5.6, 0.42]]
  function collide(p) {
    const R = WALK.radius
    for (const [x0, z0, x1, z1] of SOLIDS) {
      const cx = THREE.MathUtils.clamp(p.x, x0, x1), cz = THREE.MathUtils.clamp(p.z, z0, z1)
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz)
      if (d >= R) continue
      if (d > 1e-6) { p.x = cx + (dx / d) * R; p.z = cz + (dz / d) * R; continue }
      // centre inside the box: leave by the nearest side
      const opts = [[p.x - x0, -1, 0], [x1 - p.x, 1, 0], [p.z - z0, 0, -1], [z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0]
      if (opts[1]) p.x = opts[1] < 0 ? x0 - R : x1 + R
      else p.z = opts[2] < 0 ? z0 - R : z1 + R
    }
    for (const [x, z, r] of POSTS) {
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 1e-6
      if (d < r + R) { p.x = x + (dx / d) * (r + R); p.z = z + (dz / d) * (r + R) }
    }
    p.x = THREE.MathUtils.clamp(p.x, ROOM.l + R, ROOM.r - R)
    p.z = THREE.MathUtils.clamp(p.z, ROOM.back + R, ROOM.front - R)
  }

  const zoomPos = new THREE.Vector3(SCREEN_POS.x, SCREEN_POS.y, 1.45) // end of the boot dolly (z set by resize)
  function resize() {
    const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight
    renderer.setSize(w, h)
    css.setSize(w, h)
    composer?.setSize(w, h)
    camera.aspect = w / h
    // fixed, comfortable field of view for walking (no zoom); the boot dolly keeps the screen framing it had
    const tall = camera.aspect < 0.85
    camera.fov = tall ? 64 : 50
    camera.updateProjectionMatrix()
    const deg = THREE.MathUtils.degToRad
    zoomPos.z = SCREEN_POS.z + 1.375 * Math.tan(deg((tall ? 55 : 35) / 2)) / Math.tan(deg(camera.fov / 2))
  }
  addEventListener('resize', resize)
  resize()

  // ---------- input ----------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const pointers = new Map()
  const pickables = [computer, sw, ball, ...posters]
  let drag = null, hoverKind = null, hoverPoster = null
  let on = false, booting = false, lightsOn = true
  let focusOn = false, focused = null, walked = false
  let msg = '', msgUntil = 0
  const say = (text, sec = 2.2) => { msg = text; msgUntil = clock.elapsedTime + sec }
  // the room only takes keys while it is on screen and the visitor hasn't booted yet
  const roomLive = () => !!raf && !booting && !on && !bootEl.classList.contains('hidden')

  const pick = (x, y) => {
    const r = stage.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(pickables, true)[0]
    let o = hit?.object
    while (o && !o.userData.kind) o = o.parent
    return o || null
  }
  const setHover = (o) => {
    hoverKind = o?.userData.kind || null
    hoverPoster = hoverKind === 'poster' ? o : null
    stage.classList.toggle('hot', !!hoverKind && !(hoverKind === 'computer' && on))
  }

  // mouse: one click captures the pointer, then moving the mouse looks around (Esc releases it).
  // While captured, clicks act on whatever sits under the centre crosshair. Touch keeps drag-to-look.
  const LOCKABLE = !COARSE && 'requestPointerLock' in stage
  const SENS = 0.0019 // radians per pixel of mouse travel
  const locked = () => document.pointerLockElement === stage
  const lockLook = () => {
    if (!LOCKABLE || aiming() || !roomLive()) return
    try { stage.requestPointerLock()?.catch?.(() => {}) } catch { /* not allowed right now */ }
  }
  // fallback where capture is refused (some embedded browsers): the view still follows mouse
  // movement over the room, and the cursor is hidden behind the crosshair
  let freeLook = false
  const aiming = () => locked() || freeLook
  const setAimUI = () => {
    const a = aiming()
    stage.classList.toggle('locked', a)
    crossEl.classList.toggle('show', a)
    if (!a) { setHover(null); crossEl.classList.remove('hot'); if (focusOn) unfocus() }
  }
  const unlockLook = () => { freeLook = false; if (locked()) document.exitPointerLock(); else setAimUI() }
  document.addEventListener('pointerlockchange', setAimUI)
  document.addEventListener('pointerlockerror', () => { if (roomLive()) { freeLook = true; setAimUI() } })
  const pickCenter = () => {
    ray.setFromCamera(ndc.set(0, 0), camera)
    let o = ray.intersectObjects(pickables, true)[0]?.object
    while (o && !o.userData.kind) o = o.parent
    return o || null
  }
  const act = (o, touch) => {
    const kind = o?.userData.kind
    if (held && touch && kind !== 'poster' && kind !== 'switch') return shoot()
    if (kind === 'poster' && !focusOn) { if (held) drop(); return focusPoster(o) }
    if (kind === 'switch') { lightsOn = !lightsOn; return }
    if (focusOn) return unfocus()
    if (kind === 'ball' && !held) return grab()
    if (kind === 'computer' && !on && typeof window.boot === 'function') { unlockLook(); window.boot() }
  }

  stage.addEventListener('pointerdown', (e) => {
    if (booting) return
    if (e.pointerType === 'mouse' && LOCKABLE) {
      if (e.button !== 0) return
      if (aiming()) return act(pickCenter(), false)
      if (focusOn) return act(pick(e.clientX, e.clientY), false) // cursor is free while reading a poster
      return lockLook() // first click only captures the mouse
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    stage.setPointerCapture(e.pointerId)
    drag = pointers.size === 1 ? { x: e.clientX, y: e.clientY, yaw: tgt.yaw, pitch: tgt.pitch, moved: false } : null
  })
  stage.addEventListener('pointermove', (e) => {
    if (aiming() && e.pointerType === 'mouse') {
      if (focusOn || booting) return
      // clamp spikes some browsers report when the pointer is captured
      const mx = THREE.MathUtils.clamp(e.movementX, -60, 60), my = THREE.MathUtils.clamp(e.movementY, -60, 60)
      tgt.yaw -= mx * SENS
      tgt.pitch = THREE.MathUtils.clamp(tgt.pitch + my * SENS, ...WALK.pitch)
      return
    }
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (Math.hypot(dx, dy) > 6) { drag.moved = true; stage.classList.add('dragging') }
      if (drag.moved && !focusOn) {
        // touch: grab-and-turn, drag right to turn left
        tgt.yaw = drag.yaw + dx * 0.0036
        tgt.pitch = THREE.MathUtils.clamp(drag.pitch - dy * 0.003, ...WALK.pitch)
      }
      return
    }
    if (!LOCKABLE) setHover(booting ? null : pick(e.clientX, e.clientY))
  })
  const release = (e) => {
    if (!pointers.has(e.pointerId)) return
    const wasClick = drag && !drag.moved && pointers.size === 1
    pointers.delete(e.pointerId)
    drag = null
    stage.classList.remove('dragging')
    if (wasClick && !booting) act(pick(e.clientX, e.clientY), e.pointerType !== 'mouse')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; stage.classList.remove('dragging') })
  stage.addEventListener('pointerleave', () => { if (!drag && !aiming()) setHover(null) })
  // the view's zoom is fixed: the wheel does nothing in the room
  stage.addEventListener('wheel', (e) => e.preventDefault(), { passive: false })
  backEl.addEventListener('click', () => unfocus())

  // keyboard walking (layout-independent codes) + R to shoot
  const MOVE = { KeyW: 'KeyW', ArrowUp: 'KeyW', KeyS: 'KeyS', ArrowDown: 'KeyS', KeyA: 'KeyA', ArrowLeft: 'KeyA', KeyD: 'KeyD', ArrowRight: 'KeyD' }
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && freeLook) return unlockLook()
    if (e.key === 'Escape' && focusOn) return unfocus()
    if (!roomLive() || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]')) return
    if (MOVE[e.code]) {
      e.preventDefault()
      pressed.add(MOVE[e.code])
      if (focusOn) unfocus()
    } else if (e.key === 'Shift') pressed.add('run')
    else if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); if (held) shoot(); else say(ballNear() ? 'Click the ball to pick it up' : 'Find the ball by the hoop') }
  })
  addEventListener('keyup', (e) => { if (MOVE[e.code]) pressed.delete(MOVE[e.code]); if (e.key === 'Shift') pressed.delete('run') })
  addEventListener('blur', () => pressed.clear())

  // touch pad: hold an arrow to walk; Shoot appears while holding the ball
  padEl.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('button')?.dataset.k
    if (!k) return
    e.preventDefault()
    if (k === 'shoot') return shoot()
    pressed.add(k)
    e.target.setPointerCapture?.(e.pointerId)
    if (focusOn) unfocus()
  })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) padEl.addEventListener(ev, (e) => {
    const k = e.target.closest?.('button')?.dataset.k
    if (k && k !== 'shoot') pressed.delete(k)
  })
  padEl.addEventListener('contextmenu', (e) => e.preventDefault())

  // ---------- ball: grab, drop, shoot ----------
  const ballNear = () => Math.hypot(ball.position.x - me.p.x, ball.position.z - me.p.z) < 2.6 // reach, measured on the floor
  function grab() {
    if (!ballNear()) return say('Walk closer to grab the ball')
    held = true
    shot = null
    bv.set(0, 0, 0)
    say(COARSE ? 'Tap anywhere to shoot' : 'Aim at the hoop · press R to shoot', 2.6)
  }
  function drop() {
    held = false
    bv.set(0, -0.5, 0)
    shot = null
  }
  const fwd3 = new THREE.Vector3(), toRim = new THREE.Vector3()
  function shoot() {
    if (!held) return
    held = false
    shots++
    camera.getWorldDirection(fwd3)
    toRim.copy(RIM).sub(ball.position)
    const dh = Math.hypot(toRim.x, toRim.z)
    const aim = dh > 1e-3 ? (fwd3.x * toRim.x + fwd3.z * toRim.z) / (Math.hypot(fwd3.x, fwd3.z) * dh || 1) : 0
    if (aim > 0.92 && dh > 0.5 && dh < 9.5) {
      // aimed at the hoop: a proper arc, with error that grows with distance and sloppy aim
      const off = 0.035 + dh * 0.014 + (1 - aim) * 1.6
      const tx = RIM.x + (Math.random() * 2 - 1) * off, tz = RIM.z + (Math.random() * 2 - 1) * off
      const dy = RIM.y - ball.position.y
      let T = 0.55 + dh * 0.11
      let vy = (dy + 0.5 * GRAV * T * T) / T
      const vyMax = Math.sqrt(2 * GRAV * Math.max(0.3, ROOM.ceil - 0.3 - ball.position.y)) // stay under the ceiling
      if (vy > vyMax) { vy = vyMax; T = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * GRAV * dy))) / GRAV }
      bv.set((tx - ball.position.x) / T, vy, (tz - ball.position.z) / T)
    } else {
      bv.copy(fwd3).multiplyScalar(5.4)
      bv.y += 1.8
    }
    shot = { scored: false, t: 0 }
  }

  // ---------- poster focus ----------
  const focusPos = new THREE.Vector3(), focusLook = new THREE.Vector3()
  const focusPosTgt = new THREE.Vector3(), focusLookTgt = new THREE.Vector3()
  let focusAmt = 0
  function focusPoster(g) {
    const { w, h } = g.userData.size
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()))
    const p = g.getWorldPosition(new THREE.Vector3())
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const d = Math.max((h * 0.62) / tanV, (w * 0.62) / (tanV * camera.aspect))
    focusLookTgt.copy(p)
    focusPosTgt.copy(p).addScaledVector(n, d)
    if (!focusOn) { focusPos.copy(focusPosTgt); focusLook.copy(focusLookTgt) }
    focusOn = true
    focused = g
    backEl.classList.add('show')
    backEl.setAttribute('aria-label', `Back to room from ${g.userData.title}`)
  }
  function unfocus() {
    focusOn = false
    focused = null
    backEl.classList.remove('show')
  }

  // ---------- power state, mirrored from the existing LED ----------
  let flickerUntil = 0
  const clock = new THREE.Clock()
  if (ledEl) new MutationObserver(() => {
    on = ledEl.classList.contains('on')
    if (!on) return
    flickerUntil = clock.elapsedTime + 0.7
    booting = true
    unfocus()
    setHover(null)
    pressed.clear()
    if (held) drop()
    // walk back to the desk view, turning the shortest way round
    const turns = Math.round((cur.yaw - WALK.yaw0) / (Math.PI * 2))
    Object.assign(tgt, { yaw: WALK.yaw0 + turns * Math.PI * 2, pitch: WALK.pitch0 })
  }).observe(ledEl, { attributes: true, attributeFilter: ['class'] })

  let zoomT0 = -1
  window.WOS3D = { zoom() { if (!REDUCE) zoomT0 = clock.elapsedTime } }

  // ---------- once the desktop takes over: stop, and get out of the way ----------
  let raf = 0
  new MutationObserver(() => {
    if (bootEl.classList.contains('hidden')) {
      pressed.clear()
      unlockLook()
      for (const el of [cueEl, backEl, keysEl, padEl, crossEl]) el.classList.remove('show')
      setTimeout(() => {
        cancelAnimationFrame(raf)
        raf = 0
        stage.style.visibility = 'hidden'
      }, 1400)
    } else if (!raf) { stage.style.visibility = ''; frame() }
  }).observe(bootEl, { attributes: true, attributeFilter: ['class'] })

  // ---------- loop ----------
  let power = 0, cueAmt = 0, lightAmt = 1, focusDist = 5
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), dir = new THREE.Vector3()
  const walkPos = new THREE.Vector3(), walkLook = new THREE.Vector3()
  const fwd = new THREE.Vector3(), toMon = new THREE.Vector3()
  const wish = new THREE.Vector3(), tmp = new THREE.Vector3(), axis = new THREE.Vector3()
  const HOLD = new THREE.Vector3(0.24, -0.23, -0.68) // where the held ball sits, in camera space
  const dummy = new THREE.Object3D()
  const smooth = (k) => k * k * (3 - 2 * k)
  let shownText = null, glowAmt = 0, frameN = 0

  // solid boxes the ball bounces off: [minX, minY, minZ, maxX, maxY, maxZ]
  const BALL_BOXES = [
    [-2.15, ROOM.floor, -0.75, 2.65, 0, 1.35], // desk
    [-1.03, 0, -0.7, 1.03, 1.85, 0.08], // monitor
    [1.27, 0, -0.85, 2.17, 1.45, 0.55], // tower
    [HOOP_X - 0.45, 1.65, ROOM.front - 0.065, HOOP_X + 0.45, 2.25, ROOM.front], // backboard
    [HOOP_X - 0.35, 2.45, ROOM.front - 0.075, HOOP_X + 0.35, 2.75, ROOM.front], // ticker
  ]
  function ballStep(h) {
    const p = ball.position, r = BALL_R
    const prevY = p.y
    bv.y -= GRAV * h
    p.addScaledVector(bv, h)
    // the room
    const bounce = (ax, lim, sgn, e = 0.58) => {
      if ((lim - p[ax]) * sgn >= r) return false // distance from the inside of that surface
      p[ax] = lim - sgn * r
      if (bv[ax] * sgn > 0) bv[ax] *= -e
      return true
    }
    if (bounce('y', ROOM.floor, -1, 0.62)) {
      const f = Math.max(0, 1 - 2.2 * h)
      bv.x *= f; bv.z *= f
      if (Math.abs(bv.y) < 0.35) bv.y = 0
    }
    bounce('y', ROOM.ceil, 1); bounce('x', ROOM.l, -1); bounce('x', ROOM.r, 1); bounce('z', ROOM.back, -1); bounce('z', ROOM.front, 1)
    // furniture
    for (const [x0, y0, z0, x1, y1, z1] of BALL_BOXES) {
      tmp.set(THREE.MathUtils.clamp(p.x, x0, x1), THREE.MathUtils.clamp(p.y, y0, y1), THREE.MathUtils.clamp(p.z, z0, z1))
      tmp.subVectors(p, tmp)
      const d = tmp.length()
      if (d >= r) continue
      if (d < 1e-6) tmp.set(0, 1, 0); else tmp.divideScalar(d)
      p.addScaledVector(tmp, r - d)
      const vn = bv.dot(tmp)
      if (vn < 0) { bv.addScaledVector(tmp, -1.55 * vn); bv.multiplyScalar(0.9) }
    }
    // rim: a ring of radius RIM_R in the horizontal plane
    tmp.set(p.x - RIM.x, 0, p.z - RIM.z)
    const hd = tmp.length() || 1e-6
    tmp.multiplyScalar(RIM_R / hd).add(RIM) // nearest point on the ring
    tmp.subVectors(p, tmp)
    const rd = tmp.length(), reach = r + 0.011
    if (rd < reach && rd > 1e-6) {
      tmp.divideScalar(rd)
      p.addScaledVector(tmp, reach - rd)
      const vn = bv.dot(tmp)
      if (vn < 0) bv.addScaledVector(tmp, -1.5 * vn)
      if (shot) shot.rim = true
    }
    // through the hoop: crossed the rim plane going down, inside the ring
    if (shot && !shot.scored && bv.y < 0 && prevY >= RIM.y && p.y < RIM.y && hd < RIM_R - 0.02) {
      shot.scored = true
      makes++
      drawTicker(makes)
      tickBlink = 1.2
      bv.x *= 0.35; bv.z *= 0.35; bv.y *= 0.6 // the net catches it
      burst()
      say(`${shot.rim ? 'Bucket!' : 'Swish!'}  ${makes} / ${shots}`, 2.6)
    }
    // roll: spin about the axis perpendicular to travel
    const sp = Math.hypot(bv.x, bv.z)
    if (sp > 1e-3) { axis.set(bv.z, 0, -bv.x).divideScalar(sp); ball.rotateOnWorldAxis(axis, (sp * h) / r) }
  }

  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime

    // lights
    lightAmt += ((lightsOn ? 1 : 0) - lightAmt) * Math.min(1, dt * 7)
    const L = lightAmt
    hemi.intensity = 0.1 + 0.4 * L
    key.intensity = 70 * L
    wash.intensity = 30 * L
    fill.intensity = 32 * L
    fill2.intensity = 20 * L
    lampLight.intensity = 9 * L
    bulbMat.emissiveIntensity = 2 * L
    ceilMat.emissiveIntensity = 1.4 * L
    rim.intensity = 2 + 6 * L
    rocker.rotation.x = lightsOn ? -0.28 : 0.28
    locator.emissiveIntensity = (1 - L) * 1.6

    // power + guidance cue
    power += ((on ? 1 : 0) - power) * Math.min(1, dt * 2.2)
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.2)
    const flick = t < flickerUntil ? 0.55 + Math.random() * 0.45 : 1
    const invite = on ? 0 : glowAmt
    screenLight.intensity = power * 3.4 * flick + (on ? 0 : 0.3 + breathe * 0.3 + invite * 1.6)
    glass.emissiveIntensity = power * 0.25 * flick + (on ? 0 : 0.02 + breathe * 0.02 + invite * (0.05 + breathe * 0.05))
    ledMat.emissiveIntensity = on ? 2.2 : 0
    ringMat.emissiveIntensity = on ? 1.8 : 0.35 + breathe * 0.8 + invite * 1.8
    hddMat.emissiveIntensity = on ? (Math.random() > 0.55 ? 2.5 : 0.15) : 0
    routerLeds.forEach((m, i) => { m.emissiveIntensity = i === 0 ? 1.2 : Math.sin(t * (3 + i * 1.7) + i) > 0.2 ? 1.6 : 0.15 })
    for (const g of posters) {
      const base = g.userData.glow ?? 0.15
      const pulse = g.userData.glow ? 0.08 * Math.sin(t * 1.4) : 0
      const want = base + pulse + (g === hoverPoster && !focusOn ? 0.13 : 0) + (1 - L) * (g.userData.glow ? 0.25 : 0.05)
      g.userData.mat.emissiveIntensity += (want - g.userData.mat.emissiveIntensity) * Math.min(1, dt * 10)
    }
    for (const m of marks) m.tick(t, L)
    sky.tick(t)
    outsideLeft.tick(t)

    // look
    // light smoothing: removes mouse jitter without feeling laggy
    const s = 1 - Math.exp(-dt * (aiming() ? 22 : 12))
    cur.yaw += (tgt.yaw - cur.yaw) * s
    cur.pitch += (tgt.pitch - cur.pitch) * s
    const y = cur.yaw, p = cur.pitch
    dir.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p))

    // walk: keys / pad / wheel → velocity in the floor plane, then slide along walls and furniture
    const sy = Math.sin(cur.yaw), cy = Math.cos(cur.yaw)
    const ix = (pressed.has('KeyD') ? 1 : 0) - (pressed.has('KeyA') ? 1 : 0)
    const iz = (pressed.has('KeyW') ? 1 : 0) - (pressed.has('KeyS') ? 1 : 0)
    if (booting) {
      wish.subVectors(WALK.home, me.p).setY(0)
      if (wish.length() > 0.02) wish.multiplyScalar(Math.min(4, wish.length() * 3) / wish.length())
      else wish.set(0, 0, 0)
    } else {
      wish.set(-sy * iz + cy * ix, 0, -cy * iz - sy * ix)
      if (wish.lengthSq() > 0) {
        wish.normalize().multiplyScalar(pressed.has('run') ? WALK.run : WALK.speed)
        if (!walked) { walked = true; keysEl.classList.add('dim') }
      }
    }
    // gentle ease in / ease out (no head bob, no sudden starts or stops)
    me.v.lerp(wish, 1 - Math.exp(-dt * 6))
    if (me.v.lengthSq() < 1e-8) me.v.set(0, 0, 0)
    me.p.addScaledVector(me.v, dt)
    collide(me.p)
    walkPos.set(me.p.x, WALK.eye, me.p.z)
    walkLook.copy(walkPos).addScaledVector(dir, -4)

    // poster focus blend
    focusAmt = THREE.MathUtils.clamp(focusAmt + (focusOn ? dt : -dt) / 0.85, 0, 1)
    const fs = 1 - Math.exp(-dt * 6)
    focusPos.lerp(focusPosTgt, fs)
    focusLook.lerp(focusLookTgt, fs)
    const fk = smooth(focusAmt)
    pos.lerpVectors(walkPos, focusPos, fk)
    look.lerpVectors(walkLook, focusLook, fk)

    // dolly into the screen at the end of the boot
    if (zoomT0 >= 0) {
      const k = 1 - Math.pow(1 - Math.min(1, (t - zoomT0) / 1.1), 3)
      pos.lerp(zoomPos, k)
      look.lerp(SCREEN_POS, k)
    }
    camera.position.copy(pos)
    camera.lookAt(look)
    camera.updateMatrixWorld()

    // ball: carried in view, or flying / rolling under simple physics
    if (held) {
      ball.position.copy(HOLD).applyMatrix4(camera.matrixWorld)
      ball.rotation.y += dt * 0.6
    } else {
      const n = 4
      for (let i = 0; i < n; i++) ballStep(dt / n)
      if (shot && (shot.t += dt) > 5) shot = null
    }

    // confetti + rim flash + net swish
    if (confetti.visible) {
      let alive = 0
      bits.forEach((q, i) => {
        if (q.life <= 0) { dummy.scale.setScalar(0) } else {
          alive++
          q.life -= dt
          q.v.y -= 4.2 * dt
          q.v.multiplyScalar(Math.max(0, 1 - 1.5 * dt))
          q.v.x += Math.sin(t * 6 + q.ph) * 0.9 * dt // flutter
          q.p.addScaledVector(q.v, dt)
          if (q.p.y < ROOM.floor + 0.012) { q.p.y = ROOM.floor + 0.012; q.v.set(0, 0, 0); q.w.multiplyScalar(0.8) }
          q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt
          dummy.scale.setScalar(Math.min(1, q.life / 0.6))
        }
        dummy.position.copy(q.p)
        dummy.rotation.copy(q.r)
        dummy.updateMatrix()
        confetti.setMatrixAt(i, dummy.matrix)
      })
      confetti.instanceMatrix.needsUpdate = true
      if (!alive) confetti.visible = false
    }
    flashT += dt
    const fl = Math.max(0, 1 - flashT / 0.7)
    flash.material.opacity = fl * 0.9
    flash.scale.setScalar(0.3 + (1 - fl) * 1.4)
    rimMat.emissiveIntensity = fl * 2.4
    swish = Math.max(0, swish - dt * 1.6)
    tickBlink = Math.max(0, tickBlink - dt)
    tickMat.color.setScalar(tickBlink > 0 && Math.sin(tickBlink * 26) < 0 ? 0.35 : 1)
    net.scale.set(1 - swish * 0.12 * Math.sin(t * 30), 1 + swish * 0.3, 1 - swish * 0.12 * Math.sin(t * 30))

    // computer: soft glow as you walk up to the desk, cue when looking at it
    fwd.copy(look).sub(pos).normalize()
    toMon.copy(SCREEN_POS).sub(pos)
    const monDist = toMon.length()
    const aim = fwd.dot(toMon.normalize())
    const idle = !on && !booting && focusAmt < 0.05
    const prox = idle ? THREE.MathUtils.clamp((4.6 - monDist) / 2.4, 0, 1) : 0
    const aimed = idle && aim > 0.94 && monDist < 7.5
    glowAmt += (Math.max(prox * 0.75, aimed ? 1 : 0, hoverKind === 'computer' ? 1 : 0) - glowAmt) * Math.min(1, dt * 4)
    cueAmt += (((aimed || hoverKind === 'computer' || (prox > 0.55 && aim > 0.55)) && !on ? 1 : 0) - cueAmt) * Math.min(1, dt * 4)

    // one line of guidance at a time: event > carrying the ball > computer
    // crosshair target while the mouse is captured; release the mouse once the boot starts
    if (aiming()) {
      if (booting || on) unlockLook()
      else if (!focusOn && (frameN++ & 3) === 0) setHover(pickCenter())
      crossEl.classList.toggle('hot', !!hoverKind && !focusOn)
    }
    const text = on ? null : t < msgUntil ? msg : held ? (COARSE ? 'Tap anywhere to shoot' : 'Press R to shoot')
      : cueAmt > 0.5 ? 'Click the computer to enter' : LOCKABLE && !aiming() && !focusOn && !booting ? 'Click to look around' : null
    if (text && text !== shownText) cueText.textContent = text
    shownText = text
    cueEl.classList.toggle('show', !!text)
    keysEl.classList.toggle('show', !booting && !on && focusAmt < 0.5)
    padEl.classList.toggle('show', COARSE && !booting && !on && focusAmt < 0.5)
    padEl.classList.toggle('holding', held)

    if (composer) {
      let fd = focusAmt > 0.5 ? pos.distanceTo(focusLook) : aim > 0.9 ? monDist : wallHit(pos, fwd)
      focusDist += (fd - focusDist) * Math.min(1, dt * 4)
      bokeh.uniforms.focus.value = focusDist
      composer.render()
    } else renderer.render(scene, camera)
    css.render(cssScene, camera)
  }
  frame()

  // ---------- builders ----------
  // glowTex: an emissive-only layer (black = no glow); glow: its resting intensity
  function poster(wall, along, y, w, h, tex, title, { glowTex = null, glow = null } = {}) {
    const g = group(...onWall(wall, along, y), FACE[wall])
    g.translateZ(0.02)
    add(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.03), frameMat, 0, 0, 0, g)
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveMap: glowTex || tex, emissiveIntensity: glow ?? 0.1 })
    add(new THREE.PlaneGeometry(w, h), mat, 0, 0, 0.017, g, false)
    Object.assign(g.userData, { kind: 'poster', size: { w, h }, mat, title, glow })
    posters.push(g)
    return g
  }

  // extruded, emissive wall mark with a brand-coloured halo on the wall behind it
  // layers: [[shapes, depth], ...] — a deeper layer sits in front where layers overlap
  // extruded, emissive wall mark with a brand-coloured halo on the wall behind it.
  // layers: [[shapes, depth, colour?, glows?], ...] — a deeper layer sits in front where layers overlap.
  // svgUrl: an official logo SVG; when set, its paths (and their colours) replace the built-in outline.
  function teamMark(layers, along, color, glowColor, base, svgUrl = '') {
    const g = group(...onWall('front', along, 2.78), FACE.front)
    g.translateZ(0.012)
    const lit = [] // materials that glow
    const body = group(0, 0, 0, 0, g)
    for (const [shapes, depth, c = color, glows = true] of layers) {
      const mat = std(c, 0.35, 0.35, glows ? { emissive: new THREE.Color(glowColor), emissiveIntensity: base } : {})
      if (glows) lit.push(mat)
      const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 })
      add(geo, mat, 0, 0, 0.03, body).scale.setScalar(0.42)
    }
    if (svgUrl) {
      Promise.all([import('three/addons/loaders/SVGLoader.js'), fetch(svgUrl).then((r) => (r.ok ? r.text() : Promise.reject(r.status)))])
        .then(([{ SVGLoader }, text]) => {
          const svg = new THREE.Group()
          const box = new THREE.Box3(), tmpBox = new THREE.Box3()
          for (const path of new SVGLoader().parse(text).paths) {
            const shapes = SVGLoader.createShapes(path)
            if (!shapes.length) continue
            const c = path.color.clone()
            const glows = c.r + c.g + c.b > 0.25 // dark outline parts stay matte
            const mat = std(c, 0.35, 0.35, glows ? { emissive: c.clone(), emissiveIntensity: base } : {})
            if (glows) lit.push(mat)
            const geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 18 })
            geo.computeBoundingBox()
            box.union(tmpBox.copy(geo.boundingBox))
            svg.add(new THREE.Mesh(geo, mat))
          }
          if (!svg.children.length) return
          const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
          const k = 0.48 / Math.max(size.y, size.x * 0.8)
          svg.children.forEach((m) => { m.geometry.translate(-mid.x, -mid.y, 0); m.castShadow = true })
          svg.scale.set(k, -k, 0.06) // SVG y runs down
          svg.position.z = 0.03
          g.remove(body)
          g.add(svg)
        })
        .catch(() => {}) // keep the built-in outline
    }
    const haloMat = new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, radialGlow(glowColor)), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 })
    add(new THREE.PlaneGeometry(1.05, 0.9), haloMat, 0, 0, 0.004, g, false)
    return {
      tick(t, L) {
        const k = 0.9 + 0.1 * Math.sin(t * 1.3 + along)
        for (const m of lit) m.emissiveIntensity = (base + (1 - L) * 0.5) * k
        haloMat.opacity = (0.28 + (1 - L) * 0.3) * k
      },
    }
  }

  function skateDeck(along, y, tilt, tex) {
    const g = group(...onWall('right', along, y), FACE.right)
    g.translateZ(0.04)
    g.rotation.z = tilt
    const w = 0.36, h = 1.4, r = w / 2 // full-size deck (8.25" × 32") at room scale
    const shape = new THREE.Shape()
    shape.moveTo(-r, -h / 2 + r)
    shape.absarc(0, -h / 2 + r, r, Math.PI, 0, false)
    shape.lineTo(r, h / 2 - r)
    shape.absarc(0, h / 2 - r, r, 0, Math.PI, false)
    shape.closePath()
    add(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }), std('#0c0c14', 0.6, 0), 0, 0, -0.012, g)
    tex.repeat.set(1 / w, 1 / h)
    tex.offset.set(0.5, 0.5)
    add(new THREE.ShapeGeometry(shape, 24), std('#ffffff', 0.7, 0, { map: tex, emissive: new THREE.Color('#fff'), emissiveMap: tex, emissiveIntensity: 0.08 }), 0, 0, 0.001, g, false)
    for (const yy of [-0.42, 0.42]) add(new THREE.BoxGeometry(0.24, 0.06, 0.06), trim, 0, yy, -0.04, g)
  }

  function windowFrame(side) {
    const g = group(...onWall(side, WIN.z, WIN.y), FACE[side])
    const { w, h } = WIN
    const bars = [[w + 0.1, 0.06, 0, h / 2 + 0.03], [w + 0.1, 0.06, 0, -h / 2 - 0.03], [0.06, h + 0.12, w / 2 + 0.03, 0], [0.06, h + 0.12, -w / 2 - 0.03, 0], [0.035, h, 0, 0], [w, 0.035, 0, 0.15]]
    for (const [bw, bh, x, y] of bars) add(new THREE.BoxGeometry(bw, bh, 0.06), frameMat, x, y, 0.02, g, false)
    for (const [bw, bh, x, y] of [[w, 0.02, 0, h / 2], [w, 0.02, 0, -h / 2], [0.02, h, w / 2, 0], [0.02, h, -w / 2, 0]]) {
      add(new THREE.BoxGeometry(bw, bh, 0.3), wallMat, x, y, -0.15, g, false) // reveal
    }
    add(new THREE.BoxGeometry(w + 0.2, 0.04, 0.18), frameMat, 0, -h / 2 - 0.05, 0.08, g)
    add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#8fb0ff', transparent: true, opacity: 0.05, depthWrite: false }), 0, 0, -0.02, g, false)
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

  // Across the street, out the left window: an all-night diner on a dark corner.
  function nighthawks() {
    const g = new THREE.Group()
    scene.add(g)
    const put = (geo, mat, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); g.add(m); return m }
    const GY = -1.45, DX = -10.8, Z0 = 2.4
    put(new THREE.PlaneGeometry(60, 30), flat('#04060b'), -26, 6, Z0, 0, Math.PI / 2)
    put(new THREE.PlaneGeometry(24, 40), flat('#0a0b0e'), -16, GY, Z0, -Math.PI / 2)
    put(new THREE.BoxGeometry(1.4, 0.1, 18), flat('#1e1c17'), DX + 0.7, GY + 0.05, Z0)
    put(new THREE.BoxGeometry(1.6, 0.1, 40), flat('#121211'), ROOM.l - 0.8, GY + 0.05, Z0)
    put(new THREE.PlaneGeometry(5.5, 8), new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, radialGlow('rgba(214,228,160,0.6)')), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), DX + 2.2, GY + 0.11, Z0 + 0.3, -Math.PI / 2)
    // interior
    put(new THREE.PlaneGeometry(5.4, 2.2), flat('#c4c58a'), DX - 2.6, GY + 1.1, Z0, 0, Math.PI / 2)
    put(new THREE.PlaneGeometry(2.6, 5.4), flat('#e4ebc2'), DX - 1.3, GY + 2.2, Z0, Math.PI / 2)
    put(new THREE.PlaneGeometry(2.6, 5.4), flat('#6a5a40'), DX - 1.3, GY + 0.01, Z0, -Math.PI / 2)
    put(new THREE.PlaneGeometry(2.6, 2.2), flat('#a9ab72'), DX - 1.3, GY + 1.1, Z0 - 2.7)
    put(new THREE.BoxGeometry(0.5, 0.9, 3.6), flat('#6b3f22'), DX - 1.15, GY + 0.45, Z0)
    put(new THREE.BoxGeometry(0.62, 0.05, 3.7), flat('#b9a57c'), DX - 1.15, GY + 0.92, Z0)
    for (const dz of [-1.4, -0.7, 0, 0.7, 1.4]) {
      put(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), flat('#7a2a22'), DX - 0.6, GY + 0.62, Z0 + dz)
      put(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), flat('#8a8a80'), DX - 0.6, GY + 0.3, Z0 + dz)
    }
    const figure = (x, z, coat, hat) => {
      put(new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), flat(coat), x, GY + 0.95, z)
      put(new THREE.SphereGeometry(0.1, 16, 12), flat('#d6b08a'), x, GY + 1.36, z)
      if (hat) {
        put(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 20), flat('#1a1c22'), x, GY + 1.43, z)
        put(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 20), flat('#1a1c22'), x, GY + 1.49, z)
      }
    }
    figure(DX - 0.65, Z0 + 1.4, '#1d2230', true)
    figure(DX - 0.65, Z0 + 0.85, '#9b2b24', false)
    figure(DX - 0.5, Z0 - 1.2, '#23262e', true)
    put(new THREE.CapsuleGeometry(0.14, 0.4, 4, 10), flat('#e8e6dc'), DX - 1.75, GY + 1.0, Z0 + 0.2)
    put(new THREE.SphereGeometry(0.095, 16, 12), flat('#e0bc96'), DX - 1.7, GY + 1.45, Z0 + 0.2)
    put(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), flat('#f4f2ea'), DX - 1.7, GY + 1.54, Z0 + 0.2)
    for (const dz of [1.9, 2.25]) put(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 20), flat('#b5b3a2'), DX - 2.2, GY + 1.25, Z0 + dz)
    // glass front + curved corner
    const glassM = flat('#d6ebcf', { transparent: true, opacity: 0.1, depthWrite: false })
    put(new THREE.PlaneGeometry(4.6, 2.1), glassM, DX, GY + 1.15, Z0 - 0.3, 0, Math.PI / 2)
    const corner = put(new THREE.CylinderGeometry(0.8, 0.8, 2.1, 24, 1, true, 0, Math.PI / 2), glassM, DX - 0.8, GY + 1.15, Z0 + 2.0)
    corner.material.side = THREE.DoubleSide
    put(new THREE.BoxGeometry(0.15, 0.3, 4.7), flat('#5b2a1c'), DX, GY + 0.15, Z0 - 0.3)
    put(new THREE.BoxGeometry(0.4, 0.42, 6.0), flat('#22362a'), DX - 0.2, GY + 2.41, Z0 + 0.1)
    put(new THREE.PlaneGeometry(3.4, 0.55), flat('#ffffff', { map: canvasTex(1024, 166, drawDinerSign) }), DX - 0.15, GY + 2.95, Z0 - 0.2, 0, Math.PI / 2)
    // the building above and around
    put(new THREE.BoxGeometry(4.6, 5.0, 9.5), flat('#2c1f19'), DX - 2.5, GY + 5.1, Z0 - 0.6)
    const winM = [flat('#120d0b'), flat('#120d0b'), flat('#3b5642'), flat('#a88c55')]
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      put(new THREE.PlaneGeometry(0.7, 0.95), winM[(r * 7 + c * 3) % winM.length], DX - 0.19, GY + 3.4 + r * 1.35, Z0 - 4.2 + c * 1.45, 0, Math.PI / 2)
    }
    put(new THREE.BoxGeometry(5, 6.5, 8), flat('#16130f'), DX - 2.5, GY + 3.25, Z0 + 8.5)
    put(new THREE.PlaneGeometry(2.2, 1.6), flat('#22302a'), DX - 0.01, GY + 1.0, Z0 + 6.4, 0, Math.PI / 2)
    put(new THREE.BoxGeometry(5, 7, 8), flat('#1a1612'), DX - 2.5, GY + 3.5, Z0 - 10)
    return { tick() {} }
  }

  // Out the right window: a swirling night sky over a village, cypress in front.
  function starryNight() {
    const g = new THREE.Group()
    scene.add(g)
    const RX = ROOM.r
    const skyMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, fog: false })
    const skyM = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), skyMat)
    skyM.position.set(RX + 15, 1.8, WIN.z)
    skyM.rotation.y = -Math.PI / 2
    g.add(skyM)
    const hills = (x, color, base, amp, seed) => {
      const s = new THREE.Shape()
      s.moveTo(-14, -6)
      for (let i = 0; i <= 60; i++) {
        const u = -14 + (28 * i) / 60
        s.lineTo(u, base + Math.sin(u * 0.45 + seed) * amp + Math.sin(u * 1.3 + seed * 2) * amp * 0.35)
      }
      s.lineTo(14, -6)
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), flat(color))
      m.position.set(x, 0, WIN.z)
      m.rotation.y = -Math.PI / 2
      g.add(m)
    }
    hills(RX + 13, '#1a2c46', 0.4, 0.45, 1.3)
    hills(RX + 10.5, '#132239', -0.4, 0.3, 4.1)
    // village
    const houseM = flat('#1c2b3e'), roofM = flat('#243651'), lit = flat('#f2c94c')
    const houses = [[-2.6, 0.5], [-1.7, 0.4], [-0.8, 0.55], [0.4, 0.45], [1.3, 0.5], [2.2, 0.4], [3.1, 0.55], [-3.5, 0.4]]
    houses.forEach(([dz, hh], i) => {
      const x = RX + 9.4 + (i % 3) * 0.35
      const yb = -0.75
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, hh, 0.6), houseM)
      hb.position.set(x, yb + hh / 2, WIN.z + dz)
      g.add(hb)
      const rf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 4), roofM)
      rf.position.set(x, yb + hh + 0.15, WIN.z + dz)
      rf.rotation.y = Math.PI / 4
      g.add(rf)
      const wdw = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), lit)
      wdw.position.set(x - 0.26, yb + hh * 0.5, WIN.z + dz + (i % 2 ? 0.12 : -0.1))
      wdw.rotation.y = -Math.PI / 2
      g.add(wdw)
    })
    const church = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.45), houseM)
    church.position.set(RX + 9.8, -0.4, WIN.z + 0.9)
    g.add(church)
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.5, 8), roofM)
    spire.position.set(RX + 9.8, 0.7, WIN.z + 0.9)
    g.add(spire)
    // cypress: stacked flame-shaped lathes that sway
    const cypress = new THREE.Group()
    cypress.position.set(RX + 3.4, -2.8, WIN.z - 1.05)
    g.add(cypress)
    const cyM = flat('#0b1912')
    for (let k = 0; k < 3; k++) {
      const pts = []
      for (let i = 0; i <= 24; i++) {
        const v = i / 24
        pts.push(new THREE.Vector2(Math.max(0.001, (0.55 - k * 0.12) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.75) * (1 - v * 0.55) + Math.sin(v * 22 + k) * 0.03), v * (6.4 - k * 0.5)))
      }
      const lathe = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), cyM)
      lathe.position.set(k * 0.12, 0, (k - 1) * 0.18)
      cypress.add(lathe)
    }
    return {
      tick(t) {
        skyMat.uniforms.uTime.value = t
        cypress.rotation.z = Math.sin(t * 0.6) * 0.02
        cypress.rotation.x = Math.sin(t * 0.45) * 0.015
      },
    }
  }
}

// ---------- geometry + textures ----------
function wallWithHole(w, h, hx, hy, hw, hh) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath()
  const hole = new THREE.Path()
  hole.moveTo(hx - hw / 2, hy - hh / 2); hole.lineTo(hx - hw / 2, hy + hh / 2); hole.lineTo(hx + hw / 2, hy + hh / 2); hole.lineTo(hx + hw / 2, hy - hh / 2); hole.closePath()
  s.holes.push(hole)
  return new THREE.ShapeGeometry(s)
}

function wallHit(p, d) {
  let best = 12
  for (const [ax, v] of [['x', ROOM.l], ['x', ROOM.r], ['z', ROOM.back], ['z', ROOM.front], ['y', ROOM.floor], ['y', ROOM.ceil]]) {
    if (Math.abs(d[ax]) < 1e-4) continue
    const t = (v - p[ax]) / d[ax]
    if (t > 0.05 && t < best) best = t
  }
  return best
}

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

function radialGlow(color) {
  return (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    grd.addColorStop(0, color)
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
  }
}

// ---------- team marks (stylised, built from simple outlines) ----------
const arcPts = (cx, cy, r, a0, a1, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] })
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const toShape = (pts, Cls = THREE.Shape) => new Cls(pts.map(([x, y]) => new THREE.Vector2(x, y)))

// italic, heavy-stem P: old-gold face on a black outline layer
function purdueShapes() {
  const P_OUT = [[-0.34, -0.5], [-0.06, -0.5], [-0.06, -0.04], ...arcPts(0.11, 0.23, 0.27, -Math.PI / 2, Math.PI / 2), [-0.34, 0.5]]
  const P_IN = [[-0.06, 0.11], ...arcPts(0.09, 0.23, 0.12, -Math.PI / 2, Math.PI / 2), [-0.06, 0.35]]
  const make = (grow, holeK) => {
    const sk = (pts) => pts.map(([x, y]) => [(x + 0.22 * y) * grow + 0.04, y * grow])
    const shape = toShape(sk(P_OUT))
    const hole = P_IN.map(([x, y]) => [0.03 + (x - 0.03) * holeK, 0.23 + (y - 0.23) * holeK])
    shape.holes.push(toShape(sk(hole).reverse(), THREE.Path))
    return shape
  }
  return [[[make(1.1, 0.72)], 0.12, '#0b0b0b', false], [[make(1, 1)], 0.17]]
}

// interlocking I and U: squared U bowl with serifed arms, taller serifed I through the middle
function iuShapes() {
  const u = toShape([
    [-0.42, 0.4], [-0.42, -0.18], ...arcPts(-0.22, -0.18, 0.2, Math.PI, Math.PI * 1.5, 10), ...arcPts(0.22, -0.18, 0.2, Math.PI * 1.5, Math.PI * 2, 10),
    [0.42, 0.4], [0.27, 0.4], [0.27, -0.13], ...arcPts(0.17, -0.13, 0.1, 0, -Math.PI / 2, 8), ...arcPts(-0.17, -0.13, 0.1, -Math.PI / 2, -Math.PI, 8), [-0.27, 0.4],
  ])
  const uSerifs = [rectPts(-0.5, 0.38, -0.19, 0.46), rectPts(0.19, 0.38, 0.5, 0.46)].map((p) => toShape(p))
  const i = [rectPts(-0.075, -0.58, 0.075, 0.56), rectPts(-0.18, 0.48, 0.18, 0.56), rectPts(-0.18, -0.58, 0.18, -0.5)].map((p) => toShape(p))
  return [[[u, ...uSerifs], 0.14], [i, 0.17]]
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

function basketballTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#b85a26'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#1a0f0a'; g.lineWidth = 5
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke()
    for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
    for (const x of [0, w / 2, w]) { g.beginPath(); g.ellipse(x, h / 2, w * 0.12, h * 0.5, 0, 0, Math.PI * 2); g.stroke() }
  })
}

function drawLegalSheet(g, w, h) {
  g.fillStyle = '#e8dc8c'; g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(70,110,170,0.55)'; g.lineWidth = 1.2
  for (let y = 40; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
  g.strokeStyle = 'rgba(180,60,60,0.7)'
  g.beginPath(); g.moveTo(38, 0); g.lineTo(38, h); g.stroke(); g.beginPath(); g.moveTo(42, 0); g.lineTo(42, h); g.stroke()
  g.fillStyle = 'rgba(30,30,60,0.75)'
  g.font = 'italic 13px Georgia, serif'
  ;['Offer — objective test', 'Mailbox rule?', 'Consideration: bargain', 'Promissory estoppel §90', 'Parol evidence'].forEach((s, i) => g.fillText(s, 48, 51 + i * 28))
}

function drawScouting(g, w, h) {
  g.fillStyle = '#e9ebf2'; g.fillRect(0, 0, w, h)
  g.fillStyle = '#1A1A2E'
  g.font = '700 15px Inter, sans-serif'
  g.fillText('SCOUTING REPORT', 14, 26)
  g.strokeStyle = 'rgba(26,26,46,0.35)'; g.lineWidth = 1
  for (let r = 0; r < 10; r++) { const y = 44 + r * 28; g.strokeRect(12, y, w - 24, 28) }
  g.beginPath(); g.moveTo(110, 44); g.lineTo(110, 324); g.moveTo(180, 44); g.lineTo(180, 324); g.stroke()
  g.font = '600 10px "JetBrains Mono", monospace'
  ;['POS', 'GRADE', 'NOTES'].forEach((s, i) => g.fillText(s, [18, 116, 186][i], 62))
  g.fillStyle = 'rgba(26,26,46,0.55)'
  for (let r = 1; r < 10; r++) {
    g.fillRect(18, 52 + r * 28, 40 + ((r * 13) % 30), 4)
    g.fillRect(118, 52 + r * 28, 20 + ((r * 7) % 25), 4)
    g.fillRect(188, 52 + r * 28, 50 + ((r * 11) % 20), 4)
  }
}

function posterBase(g, w, h, bg = P.surf, glow = 'rgba(107,159,255,0.10)') {
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  const grd = g.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, h * 0.8)
  grd.addColorStop(0, glow)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)
}
function posterTitle(g, w, h, title, sub, { color = P.text, accent = P.acc, size = 70 } = {}) {
  g.textAlign = 'left'
  g.fillStyle = color
  g.font = `700 ${size}px Inter, sans-serif`
  if ('letterSpacing' in g) g.letterSpacing = '-1px'
  // shrink long titles so they stay on one line
  while (size > 24 && g.measureText(title).width > w - 88) g.font = `700 ${(size -= 2)}px Inter, sans-serif`
  g.fillText(title, 44, h - 92)
  g.fillStyle = P.muted
  g.font = '500 19px "JetBrains Mono", monospace'
  if ('letterSpacing' in g) g.letterSpacing = '3px'
  g.fillText(sub, 46, h - 50)
  if ('letterSpacing' in g) g.letterSpacing = '0px'
  g.strokeStyle = accent
  g.lineWidth = 3
  g.beginPath(); g.moveTo(46, h - 165); g.lineTo(150, h - 165); g.stroke()
}
const mono = (g, size, color, text, x, y, align = 'center') => {
  g.fillStyle = color
  g.font = `600 ${size}px "JetBrains Mono", monospace`
  g.textAlign = align
  g.fillText(text, x, y)
}
function arrowHead(g, x, y, ang, size = 12) {
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x - Math.cos(ang - 0.45) * size, y - Math.sin(ang - 0.45) * size)
  g.lineTo(x - Math.cos(ang + 0.45) * size, y - Math.sin(ang + 0.45) * size)
  g.closePath()
  g.fill()
}

function drawTripleOption(g, w, h) {
  posterBase(g, w, h)
  const cx = w / 2, los = 380
  g.strokeStyle = 'rgba(192,200,224,0.16)'; g.lineWidth = 2
  for (let y = 60; y < 600; y += 60) { g.beginPath(); g.moveTo(36, y); g.lineTo(w - 36, y); g.stroke() }
  g.strokeStyle = 'rgba(140,180,255,0.6)'; g.setLineDash([10, 8])
  g.beginPath(); g.moveTo(36, los); g.lineTo(w - 36, los); g.stroke(); g.setLineDash([])
  // offense: line, QB, fullback, two wingbacks (flexbone)
  g.strokeStyle = P.text; g.lineWidth = 4
  const ring = (x, y, r = 15) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke() }
  for (let i = -2; i <= 2; i++) ring(cx + i * 50, los + 26)
  ring(cx, los + 72); ring(cx, los + 150); ring(cx - 150, los + 60); ring(cx + 150, los + 60)
  // defense
  g.strokeStyle = P.muted; g.lineWidth = 4
  const xMark = (x, y) => { g.beginPath(); g.moveTo(x - 12, y - 12); g.lineTo(x + 12, y + 12); g.moveTo(x + 12, y - 12); g.lineTo(x - 12, y + 12); g.stroke() }
  ;[[-75, -36], [-25, -36], [75, -36], [-160, -60], [0, -120], [-90, -130], [100, -130]].forEach(([dx, dy]) => xMark(cx + dx, los + dy))
  g.strokeStyle = P.acc; g.lineWidth = 4
  xMark(cx + 75, los - 36) // read 1: dive key
  xMark(cx + 165, los - 50) // read 2: pitch key
  mono(g, 15, P.acc, 'READ 1', cx + 75, los - 64)
  mono(g, 15, P.acc, 'READ 2', cx + 165, los - 78)
  g.fillStyle = P.acc; g.strokeStyle = P.acc; g.lineWidth = 4
  // dive: fullback through the B gap
  g.beginPath(); g.moveTo(cx, los + 132); g.lineTo(cx + 74, los - 150); g.stroke(); arrowHead(g, cx + 74, los - 150, Math.atan2(-282, 74))
  // keep: QB down the line
  g.beginPath(); g.moveTo(cx + 14, los + 72); g.quadraticCurveTo(cx + 120, los + 70, cx + 190, los - 160); g.stroke(); arrowHead(g, cx + 190, los - 160, Math.atan2(-230, 70))
  // pitch: back-side wingback in motion, then outside
  g.setLineDash([8, 7])
  g.beginPath(); g.moveTo(cx - 150, los + 76); g.quadraticCurveTo(cx - 40, los + 130, cx + 120, los + 120); g.stroke()
  g.setLineDash([])
  g.beginPath(); g.moveTo(cx + 120, los + 120); g.quadraticCurveTo(cx + 250, los + 100, cx + 255, los - 120); g.stroke(); arrowHead(g, cx + 255, los - 120, -Math.PI / 2)
  mono(g, 14, P.dim, 'DIVE', cx + 40, los - 190)
  mono(g, 14, P.dim, 'KEEP', cx + 205, los - 190)
  mono(g, 14, P.dim, 'PITCH', cx + 250, los - 150)
  posterTitle(g, w, h, 'TRIPLE OPTION', 'FLEXBONE · RIDE · READ · PITCH', { size: 62 })
}

function drawCamden(g, w, h) {
  g.fillStyle = '#0f1a3a'; g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(140,180,255,0.10)'; g.lineWidth = 1
  for (let x = 0; x < w; x += 25) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
  for (let y = 0; y < h; y += 25) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
  const H = { x: w * 0.36, y: h * 0.9 }
  const u = { x: Math.SQRT1_2, y: -Math.SQRT1_2 } // right-field line
  const v = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 } // left-field line
  const at = (d, dir) => ({ x: H.x + dir.x * d, y: H.y + dir.y * d })
  const LF = at(h * 0.5, v), RF = at(h * 0.46, u), CF = { x: H.x + 10, y: H.y - h * 0.7 }
  g.strokeStyle = 'rgba(240,244,255,0.85)'; g.lineWidth = 2.5
  g.beginPath(); g.moveTo(H.x, H.y); g.lineTo(LF.x, LF.y); g.moveTo(H.x, H.y); g.lineTo(RF.x, RF.y); g.stroke()
  // outfield wall: deep left-center, short and angled in right
  g.beginPath(); g.moveTo(LF.x, LF.y)
  g.bezierCurveTo(LF.x + 20, LF.y - 120, CF.x - 120, CF.y, CF.x, CF.y)
  g.lineTo(CF.x + 70, CF.y + 18); g.lineTo(RF.x - 40, RF.y - 60); g.lineTo(RF.x, RF.y); g.stroke()
  // infield
  const s = h * 0.12
  g.beginPath(); g.moveTo(H.x, H.y); g.lineTo(H.x + u.x * s, H.y + u.y * s); g.lineTo(H.x, H.y - s * 1.414); g.lineTo(H.x + v.x * s, H.y + v.y * s); g.closePath(); g.stroke()
  g.beginPath(); g.arc(H.x, H.y - s * 0.75, h * 0.11, Math.PI * 1.02, Math.PI * 1.98); g.stroke()
  g.beginPath(); g.arc(H.x, H.y - s * 0.7, 9, 0, Math.PI * 2); g.stroke()
  // Eutaw Street + the warehouse, parallel to the right-field line
  const n = { x: Math.SQRT1_2, y: Math.SQRT1_2 }
  const off = (p, k) => ({ x: p.x + n.x * k, y: p.y + n.y * k })
  const a = at(h * 0.34, u), b = at(h * 1.1, u)
  g.setLineDash([10, 8]); g.strokeStyle = 'rgba(140,180,255,0.7)'; g.lineWidth = 2
  const e1 = off(a, 26), e2 = off(b, 26)
  g.beginPath(); g.moveTo(e1.x, e1.y); g.lineTo(e2.x, e2.y); g.stroke(); g.setLineDash([])
  const c1 = off(a, 44), c2 = off(b, 44), c3 = off(b, 84), c4 = off(a, 84)
  g.fillStyle = 'rgba(140,180,255,0.14)'; g.strokeStyle = 'rgba(240,244,255,0.85)'; g.lineWidth = 2.5
  g.beginPath(); g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.lineTo(c4.x, c4.y); g.closePath(); g.fill(); g.stroke()
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(240,244,255,0.35)'
  for (let k = 0.05; k < 1; k += 0.05) { const p = { x: c1.x + (c2.x - c1.x) * k, y: c1.y + (c2.y - c1.y) * k }; const q = off(p, 40); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke() }
  const lbl = off(at(h * 0.62, u), 104)
  g.save(); g.translate(lbl.x, lbl.y); g.rotate(-Math.PI / 4); mono(g, 17, P.text, 'B&O WAREHOUSE', 0, 6); g.restore()
  const st = off(at(h * 0.62, u), 12)
  g.save(); g.translate(st.x, st.y); g.rotate(-Math.PI / 4); mono(g, 13, P.acc, 'EUTAW ST', 0, 0); g.restore()
  mono(g, 30, P.text, 'ORIOLE PARK', 40, 62, 'left')
  mono(g, 30, P.text, 'AT CAMDEN YARDS', 40, 98, 'left')
  mono(g, 15, P.acc, 'BALTIMORE, MD · OPENED 1992', 40, 128, 'left')
  mono(g, 12, P.muted, 'SHEET A-1 · SITE PLAN', w - 40, h - 30, 'right')
}

function drawContracts(g, w, h) {
  posterBase(g, w, h)
  const steps = ['OFFER', 'ACCEPTANCE', 'CONSIDERATION', 'ENFORCEABLE']
  const notes = ['manifestation of willingness', 'mirror image · mailbox rule', 'bargained-for exchange', 'absent a valid defense']
  steps.forEach((s, i) => {
    const y = 70 + i * 120
    const last = i === steps.length - 1
    g.strokeStyle = last ? P.acc : 'rgba(192,200,224,0.5)'; g.lineWidth = last ? 3 : 2
    g.strokeRect(60, y, w - 120, 70)
    mono(g, 22, last ? P.acc : P.text, s, w / 2, y + 34)
    g.fillStyle = P.muted; g.font = 'italic 15px Georgia, serif'; g.textAlign = 'center'
    g.fillText(notes[i], w / 2, y + 57)
    if (!last) {
      g.strokeStyle = P.acc; g.lineWidth = 2.5
      g.beginPath(); g.moveTo(w / 2, y + 74); g.lineTo(w / 2, y + 114); g.stroke()
      g.fillStyle = P.acc; arrowHead(g, w / 2, y + 116, Math.PI / 2, 10)
    }
  })
  mono(g, 12, P.muted, 'DEFENSES: STATUTE OF FRAUDS · CAPACITY · DURESS · MISTAKE', w / 2, 560)
  posterTitle(g, w, h, 'CONTRACTS', '1L · RESTATEMENT (SECOND) §17', { size: 66 })
}

function drawFinalFour(g, w, h) {
  posterBase(g, w, h, '#14141f', 'rgba(217,185,106,0.12)')
  mono(g, 30, P.gold, '2024 PURDUE', w / 2, 112)
  mono(g, 30, P.gold, 'BOILERMAKERS', w / 2, 154)
  g.strokeStyle = 'rgba(217,185,106,0.5)'; g.lineWidth = 2
  g.beginPath(); g.moveTo(w / 2 - 60, 190); g.lineTo(w / 2 + 60, 190); g.stroke()
  const run = [['R64', 'GRAMBLING ST', 'W 78–50'], ['R32', 'UTAH ST', 'W 106–67'], ['S16', 'GONZAGA', 'W 80–68'], ['E8', 'TENNESSEE', 'W 72–66'], ['F4', 'NC STATE', 'W 63–50']]
  run.forEach(([rd, opp, res], i) => {
    const y = 270 + i * 66
    mono(g, 16, P.muted, rd, 60, y, 'left')
    mono(g, 21, P.text, opp, 128, y, 'left')
    mono(g, 21, P.gold, res, w - 60, y, 'right')
    g.strokeStyle = 'rgba(217,185,106,0.15)'; g.lineWidth = 1
    g.beginPath(); g.moveTo(60, y + 24); g.lineTo(w - 60, y + 24); g.stroke()
  })
  posterTitle(g, w, h, 'FINAL FOUR', 'COLLEGE BASKETBALL', { accent: P.gold, size: 72 })
}

function drawIndiana(g, w, h) {
  posterBase(g, w, h, '#141012', 'rgba(200,70,60,0.14)')
  // crimson end-zone band
  g.fillStyle = 'rgba(200,70,60,0.85)'
  g.fillRect(40, 40, w - 80, 104)
  g.fillStyle = P.cream
  g.font = '800 58px Inter, sans-serif'; g.textAlign = 'center'
  if ('letterSpacing' in g) g.letterSpacing = '6px'
  g.fillText('HOOSIERS', w / 2, 114)
  if ('letterSpacing' in g) g.letterSpacing = '0px'
  mono(g, 17, P.cream, 'INDIANA FOOTBALL · 2025 · 16–0', w / 2, 184)
  // the undefeated run, game by game (regular season left, Nov–postseason right)
  const games = [
    ['AUG 30', 'OLD DOMINION', '27–14'], ['SEP 6', 'KENNESAW ST', '56–9'], ['SEP 12', 'INDIANA ST', '73–0'], ['SEP 20', 'ILLINOIS', '63–10'],
    ['SEP 27', '@ IOWA', '20–15'], ['OCT 11', '@ OREGON', '30–20'], ['OCT 18', 'MICHIGAN ST', '38–13'], ['OCT 25', 'UCLA', '56–6'],
    ['NOV 1', '@ MARYLAND', '55–10'], ['NOV 8', '@ PENN ST', '27–24'], ['NOV 15', 'WISCONSIN', '31–7'], ['NOV 28', '@ PURDUE', '56–3'],
    ['BIG TEN CG', 'OHIO ST', '13–10'], ['ROSE BOWL', 'ALABAMA', '38–3'], ['PEACH BOWL', 'OREGON', '56–22'], ['NATL TITLE', 'MIAMI', '27–21'],
  ]
  const colW = (w - 100) / 2
  games.forEach(([when, opp, score], i) => {
    const x = 40 + Math.floor(i / 8) * (colW + 20), y = 222 + (i % 8) * 54
    const post = i >= 12
    mono(g, 11, post ? P.crimson : P.muted, when, x, y, 'left')
    mono(g, 15, P.cream, opp, x, y + 22, 'left')
    mono(g, 15, post ? P.gold : P.crimson, `W ${score}`, x + colW, y + 22, 'right')
    g.strokeStyle = 'rgba(246,237,218,0.1)'; g.lineWidth = 1
    g.beginPath(); g.moveTo(x, y + 33); g.lineTo(x + colW, y + 33); g.stroke()
  })
  posterTitle(g, w, h, 'NATIONAL CHAMPIONS', 'COLLEGE FOOTBALL · UNDEFEATED', { color: P.cream, accent: P.crimson, size: 72 })
}
function star(g, x, y, r) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath(); g.fill()
}

// Formula 1 side profile in Ferrari red, with a pit-board stripe and chequered corner
function drawFerrari(g, w, h) {
  posterBase(g, w, h, '#100a0c', 'rgba(220,0,0,0.12)')
  const RED = '#DC0000', DARK = '#8f0000', G = 340
  // speed streaks behind the car
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(220,0,0,${0.06 + (i % 3) * 0.04})`
    g.fillRect(40 + (i % 4) * 30, 170 + i * 18, 150 + (i * 37) % 120, 3)
  }
  // chequered corner
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 0) { g.fillStyle = 'rgba(246,237,218,0.75)'; g.fillRect(w - 44 - (c + 1) * 16, 40 + r * 16, 16, 16) }
  g.fillStyle = '#FFF200'; g.fillRect(44, 40, 130, 8)
  // floor + body
  g.fillStyle = '#1a1a1a'
  g.fillRect(250, G - 40, 760, 16)
  g.fillStyle = RED
  g.beginPath()
  g.moveTo(255, G - 40); g.lineTo(300, G - 78); g.lineTo(420, G - 108); g.lineTo(520, G - 152); g.lineTo(585, G - 152)
  g.lineTo(600, G - 112); g.lineTo(700, G - 108); g.lineTo(760, G - 92); g.lineTo(930, G - 64); g.lineTo(1040, G - 50)
  g.lineTo(1050, G - 40); g.closePath(); g.fill()
  // sidepod shading + engine cover line
  g.fillStyle = DARK
  g.beginPath(); g.ellipse(560, G - 62, 150, 22, 0, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2
  g.beginPath(); g.moveTo(320, G - 80); g.lineTo(520, G - 140); g.stroke()
  // airbox intake + halo + driver helmet
  g.fillStyle = '#111'; g.fillRect(560, G - 150, 22, 18)
  g.fillStyle = '#FFF200'; g.beginPath(); g.arc(640, G - 116, 16, Math.PI, 0); g.fill()
  g.strokeStyle = '#151515'; g.lineWidth = 9; g.lineCap = 'round'
  g.beginPath(); g.moveTo(600, G - 112); g.quadraticCurveTo(640, G - 150, 700, G - 110); g.stroke()
  // rear wing + front wing
  g.fillStyle = RED; g.fillRect(205, G - 175, 70, 14); g.fillStyle = '#151515'; g.fillRect(222, G - 165, 12, 100)
  g.fillStyle = '#151515'; g.fillRect(990, G - 34, 95, 10); g.fillStyle = RED; g.fillRect(1060, G - 52, 26, 26)
  // tyres
  for (const x of [330, 925]) {
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(x, G - 56, 58, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#FFF200'; g.lineWidth = 3; g.beginPath(); g.arc(x, G - 56, 44, 0.3, 1.6); g.stroke()
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(x, G - 56, 22, 0, Math.PI * 2); g.fill()
  }
  // ground shadow
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(250, G + 2, 800, 6)
  posterTitle(g, w, h, 'SCUDERIA FERRARI', 'FORMULA 1 · MARANELLO · ROSSO CORSA', { color: P.text, accent: RED, size: 72 })
}

function drawAnalytics(g, w, h) {
  posterBase(g, w, h)
  mono(g, 16, P.muted, 'EXPECTED POINTS ADDED · BY DOWN', 44, 64, 'left')
  const vals = [0.62, 0.41, 0.83, 0.27]
  vals.forEach((v, i) => {
    const x = 60 + i * 125, bh = v * 210
    g.fillStyle = i === 2 ? P.acc : 'rgba(192,200,224,0.35)'
    g.fillRect(x, 300 - bh, 80, bh)
    mono(g, 15, P.dim, ['1ST', '2ND', '3RD', '4TH'][i], x + 40, 326)
  })
  g.strokeStyle = 'rgba(192,200,224,0.3)'; g.lineWidth = 1.5
  g.beginPath(); g.moveTo(44, 300); g.lineTo(w - 44, 300); g.stroke()
  mono(g, 16, P.muted, 'WIN % VS POINT DIFFERENTIAL', 44, 380, 'left')
  g.strokeRect(44, 395, w - 88, 200)
  let seed = 7
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  g.fillStyle = 'rgba(140,180,255,0.75)'
  for (let i = 0; i < 40; i++) {
    const t = rnd(), x = 54 + t * (w - 108), y = 585 - t * 170 + (rnd() - 0.5) * 50
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill()
  }
  g.strokeStyle = P.acc; g.lineWidth = 2.5
  g.beginPath(); g.moveTo(54, 585); g.lineTo(w - 54, 415); g.stroke()
  posterTitle(g, w, h, 'ANALYTICS', 'SPORTS DATA · DECISIONS', { size: 66 })
}

// full depth chart laid out the way an NFL club publishes it:
// 11-personnel offense, 4-3 base defense with a nickel, specialists, and the 53-man roster mix
function drawSportsMgmt(g, w, h) {
  posterBase(g, w, h)
  const cw = 84, ch = 62
  const chip = (pos, cx, y) => {
    const x = cx - cw / 2
    g.fillStyle = 'rgba(26,26,46,0.92)'
    g.strokeStyle = 'rgba(140,180,255,0.35)'; g.lineWidth = 1.5
    g.beginPath(); g.roundRect ? g.roundRect(x, y, cw, ch, 8) : g.rect(x, y, cw, ch); g.fill(); g.stroke()
    mono(g, 15, P.text, pos, cx, y + 21)
    // 1st / 2nd / 3rd string
    ;[[1, 'rgba(140,180,255,0.85)'], [0.72, 'rgba(192,200,224,0.38)'], [0.48, 'rgba(192,200,224,0.2)']].forEach(([k, c], i) => {
      g.fillStyle = c
      g.fillRect(x + 10, y + 31 + i * 9, (cw - 20) * k, 5)
    })
  }
  const label = (t, y) => {
    mono(g, 15, P.acc, t, 44, y, 'left')
    g.strokeStyle = 'rgba(140,180,255,0.18)'; g.lineWidth = 1
    g.beginPath(); g.moveTo(44 + g.measureText(t).width + 14, y - 5); g.lineTo(w - 44, y - 5); g.stroke()
  }
  mono(g, 16, P.muted, 'DEPTH CHART', 44, 62, 'left')
  mono(g, 13, P.muted, '1ST · 2ND · 3RD', w - 44, 62, 'right')

  label('OFFENSE · 11 PERSONNEL', 108)
  ;[['WR-X', 62], ['LT', 250], ['LG', 350], ['C', 450], ['RG', 550], ['RT', 650], ['TE', 750], ['WR-Z', 838]].forEach(([p, x]) => chip(p, x, 126))
  chip('SLOT', 156, 206); chip('QB', 450, 206); chip('RB', 450, 286)

  label('DEFENSE · 4-3 BASE / NICKEL', 400)
  ;[['DE', 285], ['DT', 395], ['DT', 505], ['DE', 615]].forEach(([p, x]) => chip(p, x, 418))
  ;[['WLB', 330], ['MLB', 450], ['SLB', 570]].forEach(([p, x]) => chip(p, x, 498))
  ;[['LCB', 62], ['NB', 186], ['SS', 360], ['FS', 540], ['RCB', 838]].forEach(([p, x]) => chip(p, x, 578))

  label('SPECIAL TEAMS', 692)
  ;['K', 'P', 'LS', 'H', 'KR', 'PR'].forEach((p, i) => chip(p, 88 + i * 145, 710))

  // 53-man roster by position group
  label('53-MAN ROSTER', 840)
  const groups = [['QB', 3], ['RB', 4], ['WR', 6], ['TE', 3], ['OL', 9], ['DL', 9], ['LB', 6], ['CB', 6], ['S', 4], ['ST', 3]]
  let x = 44
  const span = w - 88
  groups.forEach(([p, n], i) => {
    const bw = (span * n) / 53
    const off = i < 5, st = i === 9
    g.fillStyle = st ? 'rgba(217,185,106,0.6)' : off ? `rgba(140,180,255,${0.75 - i * 0.09})` : `rgba(192,200,224,${0.5 - (i - 5) * 0.08})`
    g.fillRect(x + 1, 862, bw - 2, 34)
    mono(g, 13, P.dim, p, x + bw / 2, 922)
    mono(g, 12, P.muted, String(n), x + bw / 2, 942)
    x += bw
  })
  mono(g, 13, P.muted, 'OFFENSE 25 · DEFENSE 25 · SPECIALISTS 3 · PRACTICE SQUAD 16', w / 2, 990)
  posterTitle(g, w, h, 'SPORTS MANAGEMENT', 'ROSTER CONSTRUCTION · DEPTH CHART', { size: 60 })
}

// conference wall chart: each member's full name glowing in its primary colour
// (darker brand colours use a lighter tint of the same hue so they read on a dark wall).
// glowOnly draws just the lit text on black, used as the poster's emissive layer.
const BIG_TEN = [
  ['University of Illinois Urbana-Champaign', '#E84A27'], ['Indiana University', '#D6142B'], ['University of Iowa', '#FFCD00'],
  ['University of Maryland', '#E03A3E'], ['University of Michigan', '#FFCB05'], ['Michigan State University', '#2F8A62'],
  ['University of Minnesota', '#B0223A'], ['University of Nebraska–Lincoln', '#E41C38'], ['Northwestern University', '#7D55C7'],
  ['The Ohio State University', '#D11A1A'], ['University of Oregon', '#2E9B5A'], ['The Pennsylvania State University', '#3B6FD6'],
  ['Purdue University', '#CEB888'], ['Rutgers, The State University of New Jersey', '#CC0033'], ['University of California, Los Angeles', '#2D68C4'],
  ['University of Southern California', '#C41E3A'], ['University of Washington', '#7A5CC7'], ['University of Wisconsin–Madison', '#C5050C'],
]
function drawBigTen(g, w, h, glowOnly = false) {
  if (glowOnly) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h) } else posterBase(g, w, h, '#12121c', 'rgba(140,180,255,0.08)')
  g.textAlign = 'center'
  BIG_TEN.forEach(([name, col], i) => {
    const y = 92 + i * 52
    let size = 31
    g.font = `700 ${size}px Inter, sans-serif`
    while (g.measureText(name).width > w - 110) g.font = `700 ${(size -= 1)}px Inter, sans-serif`
    g.save()
    g.shadowColor = col
    g.shadowBlur = glowOnly ? 26 : 14
    g.fillStyle = col
    g.fillText(name, w / 2, y)
    g.restore()
  })
  if (!glowOnly) posterTitle(g, w, h, 'BIG TEN', 'CONFERENCE · 18 MEMBERS', { size: 72 })
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
  mono(g, 30, P.acc, 'f/1.8', cx, cy + 290)
  posterTitle(g, w, h, 'EXPOSURE', 'PHOTOGRAPHY · DIGITAL MEDIA')
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

function drawBackboard(g, w, h) {
  g.fillStyle = '#1f1f38'; g.fillRect(0, 0, w, h)
  g.strokeStyle = P.dim; g.lineWidth = 8
  g.strokeRect(8, 8, w - 16, h - 16)
  g.strokeStyle = P.gold; g.lineWidth = 7
  g.strokeRect(w / 2 - 70, h - 150, 140, 105)
}

function drawDeckA(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h)
  grd.addColorStop(0, P.elev); grd.addColorStop(1, P.surf)
  g.fillStyle = grd; g.fillRect(0, 0, w, h)
  g.fillStyle = 'rgba(140,180,255,0.75)'
  for (let i = 0; i < 9; i++) g.fillRect(0, 140 + i * 26, w, 9)
  g.save(); g.translate(w / 2, h * 0.68); g.rotate(-Math.PI / 2)
  g.fillStyle = P.text; g.font = '800 64px Inter, sans-serif'; g.textAlign = 'center'
  g.fillText('NIGHT SHIFT', 0, 22); g.restore()
}

function drawDeckB(g, w, h) {
  g.fillStyle = P.surf; g.fillRect(0, 0, w, h)
  const s = 32
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) if (((x + y) / s) % 2 === 0) { g.fillStyle = 'rgba(240,244,255,0.85)'; g.fillRect(x, y, s, s) }
  g.fillStyle = P.crimson
  g.beginPath(); g.arc(w / 2, h / 2, 80, 0, Math.PI * 2); g.fill()
  g.fillStyle = P.cream; g.font = '800 40px Inter, sans-serif'; g.textAlign = 'center'
  g.fillText('SKATE', w / 2, h / 2 + 14)
}

function drawDinerSign(g, w, h) {
  g.fillStyle = '#e9e4d2'; g.fillRect(0, 0, w, h)
  g.strokeStyle = '#7a2a22'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12)
  g.fillStyle = '#7a2a22'
  g.font = '800 92px Georgia, serif'; g.textAlign = 'center'
  g.fillText('ALL NIGHT', w * 0.42, h * 0.7)
  g.font = '700 38px Georgia, serif'
  g.fillText('COFFEE 5¢', w * 0.84, h * 0.64)
}

const SKY_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const SKY_FRAG = /* glsl */`
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
vec2 swirl(vec2 p, vec2 c, float s, float r){
  vec2 d = p - c; float l = length(d);
  float a = s * exp(-(l * l) / (r * r));
  float cs = cos(a), sn = sin(a);
  return c + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
}
vec3 star(vec2 uv, vec2 c, float s, float t){
  float d = length((uv - c) * vec2(2.0, 1.0));
  float core = smoothstep(0.02 * s, 0.0, d);
  float halo = smoothstep(0.1 * s, 0.0, d) * (0.75 + 0.25 * sin(t));
  float ring = smoothstep(0.01, 0.0, abs(d - 0.065 * s)) * 0.35;
  return vec3(1.0, 0.86, 0.42) * (core * 1.4 + halo * 0.45 + ring);
}
void main(){
  vec2 uv = vUv;
  vec2 p = uv * vec2(2.0, 1.0);
  float t = uTime;
  p = swirl(p, vec2(0.96, 0.60), 3.2 + 0.35 * sin(t * 0.35), 0.22);
  p = swirl(p, vec2(1.22, 0.52), -2.4 + 0.2 * sin(t * 0.27), 0.15);
  p = swirl(p, vec2(0.70, 0.66), 1.8, 0.13);
  float n = fbm(p * 3.0 + vec2(t * 0.04, 0.0));
  float strokes = 0.5 + 0.5 * sin(p.x * 16.0 + p.y * 7.0 + n * 7.0 + t * 0.5);
  vec3 deep = vec3(0.03, 0.07, 0.22), mid = vec3(0.10, 0.22, 0.52), pale = vec3(0.42, 0.58, 0.80);
  vec3 col = mix(deep, mid, smoothstep(0.15, 0.95, uv.y + (n - 0.5) * 0.35));
  col = mix(col, pale, smoothstep(0.7, 1.0, strokes) * 0.42 * smoothstep(0.25, 0.6, uv.y));
  col = mix(col, vec3(0.55, 0.62, 0.45), smoothstep(0.85, 1.0, strokes) * 0.12 * smoothstep(0.4, 0.8, uv.y));
  col += star(uv, vec2(0.33, 0.70), 1.0, t * 2.1);
  col += star(uv, vec2(0.40, 0.55), 0.8, t * 1.7 + 1.0);
  col += star(uv, vec2(0.45, 0.76), 0.9, t * 1.9 + 2.0);
  col += star(uv, vec2(0.53, 0.64), 1.1, t * 2.3 + 3.0);
  col += star(uv, vec2(0.58, 0.48), 0.7, t * 1.5 + 4.0);
  col += star(uv, vec2(0.61, 0.78), 0.8, t * 2.0 + 5.0);
  col += star(uv, vec2(0.27, 0.58), 0.9, t * 1.8 + 6.0);
  col += star(uv, vec2(0.74, 0.56), 0.8, t * 1.6 + 7.0);
  col += star(uv, vec2(0.20, 0.74), 0.7, t * 2.2 + 8.0);
  vec2 mq = (uv - vec2(0.67, 0.70)) * vec2(2.0, 1.0);
  float m = length(mq), m2 = length(mq - vec2(0.028, 0.012));
  float crescent = smoothstep(0.055, 0.048, m) * smoothstep(0.04, 0.048, m2);
  col += vec3(1.0, 0.8, 0.3) * (crescent * 1.6 + smoothstep(0.2, 0.0, m) * 0.35);
  gl_FragColor = vec4(col * 0.85, 1.0);
}
`
