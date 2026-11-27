// Walker.OS: animated 3D icons for the workspace picker.
//
// One transparent WebGL canvas covers the picker; each card's icon is drawn into its own scissored
// viewport over the card's .mp-tile, so the flat image underneath can hide once the 3D one is up.
// Each icon is a dark glass tile with the workspace badge set into it as a metal-rimmed coin,
// a soft coloured glow behind and a ground shadow below.
//   idle:   a slow float and sway (each card on its own phase)
//   hover:  the tile tilts toward the pointer, lifts and scales up, the glow brightens and the
//           whole icon turns once; keyboard focus counts as hover
//   chosen: a quick full turn and pop as the zoom into the workspace begins
//
// Rendering notes (these keep the spins clean):
//   - Turns rotate the tile and coin together as one rigid group. Spinning the coin on its own
//     swept it through the tile and the two cut into each other.
//   - Each icon's drawn region is large enough for everything it can reach: the glow at full
//     hover, the pop when chosen and any tilt. Anything past the scissor rectangle is cut off with
//     a hard straight edge.
//   - Regions are snapped to whole pixels, and each icon clears depth in its own region before it
//     draws, so neighbouring regions never test against each other's depth.
//   - Coplanar parts are separated (the badge face sits on the coin with a polygon offset, the rim
//     ring sits outside the face), and the camera's near and far planes hug the icon for depth
//     precision.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const ACCENT = { creative: '#d63a30', professional: '#e2b23a' }
const BADGE = { creative: 'assets/creative-logo.png', professional: 'assets/professional-logo.png' }
// drawn area around the tile, as a multiple of the tile size: the glow reaches GLOW/2 × the
// largest scale (hover 1.07 + pop 0.12) from the centre, plus the float and lift
const GLOW = 1.9
const REGION = 2.6
// where the ground shadow sits below the tile's centre, in tile sizes (entry.css places the
// label just under it)
export const SHADOW_Y = -0.68

export async function mountPickerIcons(picker) {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches
  const cards = [...picker.querySelectorAll('.mp-card')]
  if (!cards.length) throw new Error('no cards')

  const canvas = document.createElement('canvas')
  canvas.className = 'mp-gl'
  canvas.setAttribute('aria-hidden', 'true')
  picker.appendChild(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  const dpr = () => Math.min(devicePixelRatio || 1, 2)
  renderer.setPixelRatio(dpr())
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture
  pmrem.dispose()

  const loader = new THREE.TextureLoader()
  const loadTex = (url) => new Promise((res) => loader.load(url, (t) => res(t), undefined, () => res(null)))
  const glowTex = radialTexture()

  // shared geometry
  const tileGeo = new RoundedBoxGeometry(1, 1, 0.2, 5, 0.2)
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 72, 1)
  coinGeo.rotateX(Math.PI / 2) // caps face the camera
  const faceGeo = new THREE.CircleGeometry(0.33, 72)
  const lipGeo = new THREE.TorusGeometry(0.352, 0.016, 12, 72)
  const planeGeo = new THREE.PlaneGeometry(1, 1)

  // camera: the tile fills 1 / REGION of the view; near and far wrap the icon closely
  const FOV = 26
  const CAM_Z = REGION / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))

  const icons = await Promise.all(cards.map(async (card, i) => {
    const mode = card.dataset.mode
    const accent = new THREE.Color(ACCENT[mode] || '#7cc4ff')
    const scene = new THREE.Scene()
    scene.environment = envTex

    const camera = new THREE.PerspectiveCamera(FOV, 1, CAM_Z - 2, CAM_Z + 2)
    camera.position.set(0, 0, CAM_Z)

    scene.add(new THREE.AmbientLight('#cfe4ff', 0.3))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(-1.6, 2.2, 3)
    const rim = new THREE.DirectionalLight('#7fd4ff', 1.4)
    rim.position.set(2.2, -0.6, -1.5)
    scene.add(key, rim)

    const root = new THREE.Group() // float + hover lift + scale
    const spinG = new THREE.Group() // hover turn and chosen turn: tile and coin together
    const tiltG = new THREE.Group() // sway + pointer tilt
    root.add(spinG)
    spinG.add(tiltG)
    scene.add(root)

    // dark frosted glass tile with a cool sheen on its edges
    const tileMat = new THREE.MeshPhysicalMaterial({
      color: '#1b2636', roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1,
      sheen: 1, sheenColor: new THREE.Color('#7fc8ff'), sheenRoughness: 0.4, envMapIntensity: 1.2,
    })
    tiltG.add(new THREE.Mesh(tileGeo, tileMat))

    // badge coin: metal rim in the workspace colour, the logo on the face
    const tex = await loadTex(BADGE[mode])
    if (tex) {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    }
    const rimMat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.3 })
    // the badge keeps its true colours (no tone mapping); a disc has plain upright UVs, and the
    // polygon offset keeps it in front of the coin's own cap at every angle
    const faceMat = new THREE.MeshBasicMaterial({
      map: tex, color: '#ffffff', toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
    const backMat = new THREE.MeshStandardMaterial({ color: '#0b0d12', roughness: 0.6 })
    const coinG = new THREE.Group()
    coinG.position.z = 0.145 // the coin's back (0.11) clears the tile's face (0.10)
    const face = new THREE.Mesh(faceGeo, faceMat)
    face.position.z = 0.0355
    const lip = new THREE.Mesh(lipGeo, rimMat)
    lip.position.z = 0.03
    coinG.add(new THREE.Mesh(coinGeo, [rimMat, backMat, backMat]), face, lip)
    tiltG.add(coinG)

    // glow behind the icon and a shadow on the ground below it (both face the camera, so they
    // read the same from every angle the icon turns through)
    const glow = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
      map: glowTex, color: accent, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }))
    glow.scale.setScalar(GLOW)
    glow.position.z = -0.6
    glow.renderOrder = -1
    root.add(glow)
    const shadow = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
      map: glowTex, color: '#000000', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false,
    }))
    shadow.position.set(0, SHADOW_Y, -0.2)
    shadow.renderOrder = -1
    scene.add(shadow)

    const st = { card, tileEl: card.querySelector('.mp-tile'), scene, camera, root, spinG, tiltG, glow, shadow, faceMat,
      phase: i * 1.7, hover: 0, hoverOn: false, px: 0, py: 0, flip: 0, chosen: 0 }

    const armed = () => picker.classList.contains('mp-armed')
    card.addEventListener('pointerenter', () => { if (armed()) setHover(st, true) })
    card.addEventListener('pointermove', (e) => {
      if (!armed()) return
      if (!st.hoverOn) setHover(st, true)
      const r = card.getBoundingClientRect()
      st.px = (e.clientX - r.left) / r.width - 0.5
      st.py = (e.clientY - r.top) / r.height - 0.5
    })
    card.addEventListener('pointerleave', () => { setHover(st, false); st.px = st.py = 0 })
    card.addEventListener('focus', () => setHover(st, true))
    card.addEventListener('blur', () => setHover(st, false))
    card.addEventListener('click', () => { st.chosen = 1; st.flip = 0 }, true)
    return st
  }))

  function setHover(st, v) {
    if (v && !st.hoverOn && !REDUCE && st.flip <= 0) st.flip = 1 // the icon turns once on the way in
    st.hoverOn = v
  }

  const clock = new THREE.Clock()
  const size = new THREE.Vector2()
  const ease = (k) => 1 - Math.pow(1 - k, 3)
  let raf = 0
  let shown = false

  function frame() {
    raf = requestAnimationFrame(frame)
    // clamped so a stalled tab or a slow frame never jumps an animation
    const dt = Math.min(clock.getDelta(), 1 / 30), t = clock.elapsedTime

    // match the canvas to the window and to the current screen's pixel ratio
    if (renderer.getPixelRatio() !== dpr()) renderer.setPixelRatio(dpr())
    const W = innerWidth, H = innerHeight
    renderer.getSize(size)
    if (size.x !== W || size.y !== H) renderer.setSize(W, H, false)

    renderer.setScissorTest(false)
    renderer.clear()
    renderer.setScissorTest(true)

    for (const ic of icons) {
      const r = ic.tileEl.getBoundingClientRect()
      if (!r.width) continue
      // whole pixels, so the viewport and scissor line up exactly
      const side = Math.round(Math.max(r.width, r.height) * REGION)
      const x = Math.round(r.left + r.width / 2 - side / 2)
      const y = Math.round(H - (r.top + r.height / 2 + side / 2))

      const m = REDUCE ? 0 : 1
      ic.hover += ((ic.hoverOn ? 1 : 0) - ic.hover) * Math.min(1, dt * 7)
      const h = ic.hover
      if (ic.flip > 0) ic.flip = Math.max(0, ic.flip - dt / 0.9)
      if (ic.chosen > 0) ic.chosen = Math.max(0, ic.chosen - dt / 0.7)

      // float, lift, pop
      ic.root.position.y = Math.sin(t * 1.3 + ic.phase) * 0.035 * m + h * 0.06
      ic.root.scale.setScalar(1 + h * 0.07 + Math.sin(Math.PI * ic.chosen) * 0.12)
      // one rigid turn: hover in, or chosen
      ic.spinG.rotation.y = (ic.flip > 0 ? ease(1 - ic.flip) * Math.PI * 2 : 0)
        + (ic.chosen > 0 ? ease(1 - ic.chosen) * Math.PI * 2 : 0)
      // sway at rest, follow the pointer on hover
      const tiltY = Math.sin(t * 0.55 + ic.phase) * 0.2 * m * (1 - h) + ic.px * 0.9 * h
      const tiltX = Math.sin(t * 0.8 + ic.phase) * 0.06 * m * (1 - h) + ic.py * 0.7 * h
      const k = 1 - Math.exp(-dt * 10)
      ic.tiltG.rotation.y += (tiltY - ic.tiltG.rotation.y) * k
      ic.tiltG.rotation.x += (tiltX - ic.tiltG.rotation.x) * k
      // glow and shadow
      ic.glow.material.opacity = 0.22 + h * 0.5 + Math.sin(t * 2 + ic.phase) * 0.03 * m
      ic.faceMat.color.setScalar(0.94 + h * 0.06)
      const lift = ic.root.position.y
      ic.shadow.material.opacity = 0.6 - lift * 2
      ic.shadow.scale.set(1.25 - lift * 1.6, 0.2 - lift * 0.3, 1)

      renderer.setViewport(x, y, side, side)
      renderer.setScissor(x, y, side, side)
      renderer.clearDepth()
      renderer.render(ic.scene, ic.camera)
    }

    if (!shown) { shown = true; picker.classList.add('mp-3d') }
  }

  return {
    start() { if (!raf) { clock.getDelta(); frame() } },
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
      for (const ic of icons) { ic.hoverOn = false; ic.hover = 0; ic.chosen = 0; ic.flip = 0 }
    },
  }
}

function radialTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
