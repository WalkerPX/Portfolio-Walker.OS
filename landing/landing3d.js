// Walker.OS — live 3D landing: only the desk and computer (assets/landing/landing.glb).
// The full room (boot3d.js) is not touched until "Explore the room" is chosen; entry.js then
// calls dispose() on this scene and loads the room in its place.
//
// The .glb can be edited in Blender and re-exported over the same path. This file finds what it
// needs by node name (see landing-scene.js for the list), so moving or resizing things is safe.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'

const GLB_URL = 'assets/landing/landing.glb'
const SCREEN_PX = { w: 800, h: 500 }
const ACC = new THREE.Color('#6B9FFF')
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches

async function loadScene() {
  try {
    const gltf = await new GLTFLoader().loadAsync(GLB_URL)
    return gltf.scene
  } catch (err) {
    // no .glb (or a broken export): build the same scene from code so the landing still works
    console.warn('[landing] could not load', GLB_URL, '- building the scene from code instead.', err)
    const [{ buildLandingScene }, { RoundedBoxGeometry }, { mergeGeometries }] = await Promise.all([
      import('./landing-scene.js'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/utils/BufferGeometryUtils.js'),
    ])
    return buildLandingScene(THREE, { RoundedBoxGeometry, mergeGeometries })
  }
}

// The screen mesh's flat face, whatever way it was modelled: centre, size, and an orthonormal
// basis (u = across, v = up, n = toward the viewer) in world space.
function screenFrame(mesh, viewFrom) {
  mesh.updateWorldMatrix(true, false)
  const geo = mesh.geometry
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  const size = bb.getSize(new THREE.Vector3())
  const centre = bb.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)
  const m3 = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld)
  // world-space extent along each local axis
  const axes = [0, 1, 2].map((i) => {
    const local = new THREE.Vector3().setComponent(i, size.getComponent(i))
    const w = local.applyMatrix3(m3)
    return { len: w.length(), dir: w.normalize() }
  })
  const byLen = [...axes].sort((a, b) => a.len - b.len)
  const n = byLen[0].dir.clone()
  if (n.dot(viewFrom.clone().sub(centre)) < 0) n.negate()
  // of the two long axes, the one closest to world up is the screen's height
  const [a, b] = [byLen[1], byLen[2]]
  const up = new THREE.Vector3(0, 1, 0)
  const vAx = Math.abs(a.dir.dot(up)) > Math.abs(b.dir.dot(up)) ? a : b
  const uAx = vAx === a ? b : a
  const v = vAx.dir.clone()
  if (v.dot(up) < 0) v.negate()
  const u = new THREE.Vector3().crossVectors(v, n).normalize()
  return { centre, width: uAx.len, height: vAx.len, u, v, n }
}

export async function startLanding({ bootEl, screenEl, ledEl, onComputer }) {
  const root = await loadScene()
  const find = (name) => root.getObjectByName(name)
  const screenNode = find('Screen')
  let screenMesh = null
  screenNode?.traverse((o) => { if (!screenMesh && o.isMesh) screenMesh = o })
  const computer = find('Computer')
  if (!screenMesh || !computer) throw new Error('landing.glb needs a "Screen" mesh and a "Computer" node')

  const home = find('CameraHome')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0.75, 1.7, 6.1)
  const look = find('CameraLook')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0.2, 0.92, 0)

  // ---------- renderers ----------
  const stage = document.createElement('div')
  stage.id = 'stage3d'
  stage.className = 'land'
  stage.setAttribute('aria-label', 'Walker.OS desk. Click the computer to boot.')
  bootEl.prepend(stage)
  const cue = document.createElement('div')
  cue.className = 'room-cue'
  cue.setAttribute('aria-live', 'polite')
  cue.innerHTML = '<span class="dot"></span><span class="t">Click the computer to boot</span>'
  bootEl.append(cue)

  const lowPower = (navigator.hardwareConcurrency || 4) < 4 || (navigator.deviceMemory || 8) < 4
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor('#05050a', 1)
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.shadowMap.enabled = !lowPower
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  stage.appendChild(renderer.domElement)
  const css = new CSS3DRenderer()
  css.domElement.className = 'css3d'
  stage.insertBefore(css.domElement, renderer.domElement) // live DOM screen below, WebGL on top

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#05050a', 9, 22)
  scene.add(root)
  const cssScene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60)

  root.traverse((o) => {
    if (o.isMesh && o !== screenMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  // ---------- lights (positions from the anchors in the .glb) ----------
  scene.add(new THREE.HemisphereLight('#2e3a6e', '#030305', 0.9))
  const lampAt = find('LampLight')?.getWorldPosition(new THREE.Vector3()) ?? find('Lamp_Bulb')?.getWorldPosition(new THREE.Vector3())
  if (lampAt) {
    const lamp = new THREE.SpotLight('#ffe2b0', 11, 7, 1.0, 0.85, 1.6)
    lamp.position.copy(lampAt)
    lamp.target.position.set(lampAt.x + 0.6, 0, lampAt.z + 0.6)
    lamp.castShadow = !lowPower
    lamp.shadow.mapSize.set(1024, 1024)
    lamp.shadow.bias = -0.0004
    scene.add(lamp, lamp.target)
  }
  const glowAt = find('ScreenGlow')?.getWorldPosition(new THREE.Vector3())
  const screenLight = new THREE.PointLight(ACC, 1.2, 5, 2)
  if (glowAt) screenLight.position.copy(glowAt)
  scene.add(screenLight)
  const key = new THREE.DirectionalLight('#8fa6ff', 0.55)
  key.position.set(3, 5, 6)
  scene.add(key)
  const rim = new THREE.PointLight('#7fd8ff', 6, 9, 1.6)
  rim.position.set(-3.5, 2.6, -0.8)
  scene.add(rim)

  // ---------- the live #screen laid over the Screen mesh ----------
  const frame = screenFrame(screenMesh, home)
  const holder = document.createElement('div')
  holder.className = 'screen3d'
  const screenHome = { parent: screenEl.parentNode, next: screenEl.nextSibling }
  holder.appendChild(screenEl)
  const screenObj = new CSS3DObject(holder)
  holder.style.pointerEvents = 'none' // the stage handles input
  screenObj.position.copy(frame.centre).addScaledVector(frame.n, 0.0005)
  screenObj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.u, frame.v, frame.n))
  screenObj.scale.set(frame.width / SCREEN_PX.w, frame.height / SCREEN_PX.h, 1)
  cssScene.add(screenObj)
  // the mesh becomes a see-through cut-out so the DOM screen shows through the WebGL canvas
  const glassMat = screenMesh.material
  screenMesh.material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.NoBlending, toneMapped: false, fog: false, side: THREE.DoubleSide })

  const ledMesh = find('Monitor_LED')
  const ledMat = ledMesh?.isMesh ? ledMesh.material : null

  // ---------- camera: resting pose, pointer parallax, and the dolly into the screen ----------
  const right = new THREE.Vector3().subVectors(look, home).cross(new THREE.Vector3(0, 1, 0)).normalize()
  const par = { x: 0, y: 0, tx: 0, ty: 0 }
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const zoomDist = () => Math.max(frame.height / 2 / tanV, frame.width / 2 / (tanV * camera.aspect)) * 1.02
  let powerT = -1, zoomT = -1
  const clock = new THREE.Clock()

  function resize() {
    const w = bootEl.clientWidth || innerWidth, h = bootEl.clientHeight || innerHeight
    renderer.setSize(w, h)
    css.setSize(w, h)
    camera.aspect = w / h
    // keep the desk in frame on narrow screens
    camera.fov = camera.aspect < 1 ? 35 + (1 - camera.aspect) * 30 : 35
    camera.updateProjectionMatrix()
  }
  resize()
  addEventListener('resize', resize)

  // ---------- input: hover + click on the computer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let hot = false, down = null
  const hitsComputer = (e) => {
    const r = stage.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObject(root, true)[0]
    if (!hit) return false
    let o = hit.object
    while (o && o !== computer) o = o.parent
    return o === computer
  }
  const onMove = (e) => {
    par.tx = (e.clientX / innerWidth - 0.5) * 2
    par.ty = (e.clientY / innerHeight - 0.5) * 2
    hot = hitsComputer(e)
    stage.classList.toggle('hot', hot)
  }
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY } }
  const onUp = (e) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    down = null
    if (moved < 8 && hitsComputer(e)) onComputer()
  }
  stage.addEventListener('pointermove', onMove)
  stage.addEventListener('pointerdown', onDown)
  stage.addEventListener('pointerup', onUp)
  const onLeave = () => { par.tx = par.ty = 0; hot = false; stage.classList.remove('hot') }
  stage.addEventListener('pointerleave', onLeave)

  // index.html's boot() calls WOS3D.zoom() when the boot text finishes
  const api = { zoom() { zoomT = REDUCE ? -1 : clock.elapsedTime }, busy: () => false }
  window.WOS3D = api

  // power on: lights the LED and eases the camera a little toward the screen while it types
  const ledObs = new MutationObserver(() => {
    const on = ledEl.classList.contains('on')
    if (on && powerT < 0) powerT = clock.elapsedTime
    if (ledMat) ledMat.emissiveIntensity = on ? 2.4 : 0
    cue.classList.toggle('show', !on)
  })
  ledObs.observe(ledEl, { attributes: true, attributeFilter: ['class'] })
  // once the desktop takes over, stop rendering
  let stopTimer = 0
  const bootObs = new MutationObserver(() => {
    clearTimeout(stopTimer)
    if (bootEl.classList.contains('hidden')) stopTimer = setTimeout(() => renderer.setAnimationLoop(null), 1400)
    else renderer.setAnimationLoop(frameLoop)
  })
  bootObs.observe(bootEl, { attributes: true, attributeFilter: ['class'] })

  const smooth = (k) => k * k * (3 - 2 * k)
  const pos = new THREE.Vector3(), at = new THREE.Vector3(), zoomPos = new THREE.Vector3()
  let lastT = 0
  function frameLoop() {
    const t = clock.getElapsedTime()
    const dt = Math.min(0.05, t - lastT)
    lastT = t
    const k = 1 - Math.exp(-dt * 3.5)
    par.x += (par.tx - par.x) * k
    par.y += (par.ty - par.y) * k
    // resting pose with a slow breathing drift and pointer parallax
    const drift = REDUCE ? 0 : 1
    pos.copy(home)
      .addScaledVector(right, (par.x * 0.28 + Math.sin(t * 0.21) * 0.05) * drift)
      .addScaledVector(new THREE.Vector3(0, 1, 0), (-par.y * 0.12 + Math.sin(t * 0.17) * 0.025) * drift)
    at.copy(look)
    // powered on: drift a quarter of the way toward the screen
    if (powerT >= 0) {
      const p = smooth(Math.min(1, (t - powerT) / 2.4)) * 0.25
      zoomPos.copy(frame.centre).addScaledVector(frame.n, zoomDist())
      pos.lerp(zoomPos, p)
      at.lerp(frame.centre, p)
    }
    // boot finished: dolly the rest of the way so the screen fills the view
    if (zoomT >= 0) {
      const z = smooth(Math.min(1, (t - zoomT) / 1.1))
      zoomPos.copy(frame.centre).addScaledVector(frame.n, zoomDist())
      pos.lerp(zoomPos, z)
      at.lerp(frame.centre, z)
    }
    camera.position.copy(pos)
    camera.lookAt(at)
    screenLight.intensity = (powerT >= 0 ? 3.2 : 1.2) + Math.sin(t * 2.1) * 0.08
    renderer.render(scene, camera)
    css.render(cssScene, camera)
  }
  renderer.setAnimationLoop(frameLoop)
  requestAnimationFrame(() => cue.classList.add('show'))

  return {
    dispose() {
      renderer.setAnimationLoop(null)
      clearTimeout(stopTimer)
      ledObs.disconnect()
      bootObs.disconnect()
      removeEventListener('resize', resize)
      // put the live screen back where index.html had it, for the room (or the 2D monitor) to use
      screenHome.parent.insertBefore(screenEl, screenHome.next)
      screenMesh.material.dispose()
      screenMesh.material = glassMat
      root.traverse((o) => {
        if (!o.isMesh) return
        o.geometry.dispose()
        for (const m of [].concat(o.material)) m.dispose()
      })
      renderer.dispose()
      stage.remove()
      cue.remove()
      if (window.WOS3D === api) delete window.WOS3D
    },
  }
}
