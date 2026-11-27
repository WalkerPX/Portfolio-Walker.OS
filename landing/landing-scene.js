// Walker.OS — landing scene: the desk, the computer and a slice of the dark room around it.
//
// Used two ways:
//   1. tools/export-landing.mjs exports it to assets/landing/landing.glb. That .glb is what the site
//      loads, and it is the file to open, edit and re-export in Blender.
//   2. landing3d.js builds it directly from this file if the .glb can't be loaded.
//
// THREE and the two helpers are passed in, so the same file runs in the browser and in Node.
//
// Node names are the contract with landing3d.js. Keep them (and their parent/child links) when editing:
//   Computer      group; clicking anything inside it boots the site
//   Screen        flat mesh on the monitor glass; the live boot screen is laid over it
//                 (its size, position and facing come from this mesh, so it can be moved or resized)
//   Monitor_LED   small mesh that lights up when the computer powers on (optional)
//   CameraHome    empty: where the camera rests
//   CameraLook    empty: the point the camera looks at
//   LampLight     empty: where the desk-lamp light is placed at runtime (optional)
//   ScreenGlow    empty: where the screen's blue spill light is placed at runtime (optional)
// Lights are added at runtime (Blender and three.js measure light intensity differently).

export const SCREEN = { w: 1.76, h: 1.1, x: 0, y: 1.17, z: 0.075 }
export const ROOM = { l: -6.2, r: 7.4, back: -1.6, front: 9.0, floor: -1.15, ceil: 3.6 }

export function buildLandingScene(THREE, { RoundedBoxGeometry, mergeGeometries }) {
  const root = new THREE.Group()
  root.name = 'WalkerOS_Landing'

  // ---------- materials (names carry over into Blender) ----------
  const mats = {}
  const mat = (name, color, roughness = 0.6, metalness = 0.2, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
    m.name = name
    mats[name] = m
    return m
  }
  const ACC = '#6B9FFF', ICE = '#7fd8ff'
  const shell = mat('Shell', '#1d1d34', 0.42, 0.35)
  const shellDark = mat('Shell_Dark', '#121224', 0.55, 0.3)
  const trim = mat('Trim', '#2a2a50', 0.3, 0.75)
  const glass = mat('Screen_Glass', '#04040a', 0.15, 0.1, { emissive: new THREE.Color(ACC), emissiveIntensity: 0.05 })
  const ring = mat('Power_Ring', '#0c0c18', 0.4, 0.2, { emissive: new THREE.Color(ACC), emissiveIntensity: 0.6 })
  const led = mat('LED', '#0b140f', 0.4, 0, { emissive: new THREE.Color('#00ff88'), emissiveIntensity: 0 })
  const keyM = mat('Keycaps', '#191930', 0.6, 0.15)
  const wall = mat('Wall', '#0f0f1a', 0.94, 0)
  const floor = mat('Floor', '#0b0b13', 0.85, 0.05)
  const desk = mat('Desk', '#15131d', 0.7, 0.08)
  const deskMat = mat('Desk_Mat', '#0b0b18', 0.95, 0)
  const metal = mat('Metal', '#2b2d40', 0.35, 0.8)
  const bulb = mat('Lamp_Bulb', '#fff6e0', 0.3, 0, { emissive: new THREE.Color('#ffe7b8'), emissiveIntensity: 2.2 })
  const accent = mat('Accent_Strip', '#0a1822', 0.4, 0, { emissive: new THREE.Color(ICE), emissiveIntensity: 1.3 })
  const art = mat('Art_Panel', '#0b1230', 0.6, 0.1, { emissive: new THREE.Color(ACC), emissiveIntensity: 0.035 })
  const artLine = mat('Art_Line', '#0b1230', 0.5, 0, { emissive: new THREE.Color('#8CB4FF'), emissiveIntensity: 0.7 })
  const frame = mat('Frame', '#0d0d16', 0.5, 0.4)
  const ceramic = mat('Mug', '#1a2a44', 0.4, 0.05)
  const pot = mat('Pot', '#1b1b2e', 0.7, 0.1)
  const leaf = mat('Leaf', '#1d3a32', 0.8, 0)
  const bookMats = ['#1b1b3a', '#222240', '#16162c', '#1e2a44'].map((c, i) => mat(`Book_${i + 1}`, c, 0.8, 0))

  // ---------- helpers ----------
  const node = (name, x = 0, y = 0, z = 0, ry = 0, parent = root) => {
    const g = new THREE.Group()
    g.name = name
    g.position.set(x, y, z)
    g.rotation.y = ry
    parent.add(g)
    return g
  }
  const empty = (name, x, y, z, parent = root) => {
    const o = new THREE.Object3D()
    o.name = name
    o.position.set(x, y, z)
    parent.add(o)
    return o
  }
  const mesh = (name, geo, material, x = 0, y = 0, z = 0, parent = root) => {
    const m = new THREE.Mesh(geo, material)
    m.name = name
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, r)
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
  // many small identical parts become one mesh (keeps the Blender outliner readable)
  const merged = (geo, offsets) => mergeGeometries(offsets.map(([x, y, z]) => geo.clone().translate(x, y, z)))

  // ---------- room shell ----------
  const env = node('Environment')
  const W = ROOM.r - ROOM.l, H = ROOM.ceil - ROOM.floor, MIDX = (ROOM.l + ROOM.r) / 2
  const D = 9 // the landing only needs the front part of the room
  const fl = mesh('Floor', new THREE.PlaneGeometry(W, D), floor, MIDX, ROOM.floor, ROOM.back + D / 2, env)
  fl.rotation.x = -Math.PI / 2
  const ce = mesh('Ceiling', new THREE.PlaneGeometry(W, D), wall, MIDX, ROOM.ceil, ROOM.back + D / 2, env)
  ce.rotation.x = Math.PI / 2
  mesh('Wall_Back', new THREE.PlaneGeometry(W, H), wall, MIDX, ROOM.floor + H / 2, ROOM.back, env)
  const wl = mesh('Wall_Left', new THREE.PlaneGeometry(D, H), wall, ROOM.l, ROOM.floor + H / 2, ROOM.back + D / 2, env)
  wl.rotation.y = Math.PI / 2
  const wr = mesh('Wall_Right', new THREE.PlaneGeometry(D, H), wall, ROOM.r, ROOM.floor + H / 2, ROOM.back + D / 2, env)
  wr.rotation.y = -Math.PI / 2
  // a thin ice-blue light line along the base of the back wall
  mesh('Accent_Baseboard', box(W - 0.4, 0.025, 0.02), accent, MIDX, ROOM.floor + 0.08, ROOM.back + 0.02, env)

  // ---------- desk ----------
  const deskG = node('Desk', 0, 0, 0, 0, env)
  mesh('Desk_Top', rbox(4.8, 0.08, 2.1, 0.02), desk, 0.25, -0.04, 0.3, deskG)
  ;[[-2.0, -0.6], [2.5, -0.6], [-2.0, 1.2], [2.5, 1.2]].forEach(([x, z], i) =>
    mesh(`Desk_Leg_${i + 1}`, box(0.07, 1.1, 0.07), desk, x, -0.63, z, deskG))
  mesh('Desk_Mat', rbox(1.9, 0.006, 0.7, 0.003), deskMat, -0.05, 0.003, 0.95, deskG)

  // ---------- computer (the click target) ----------
  const computer = node('Computer')
  const monitor = node('Monitor', 0, 0, 0, 0, computer)
  mesh('Monitor_Shell', rbox(2.05, 1.45, 0.14, 0.05), shell, 0, 1.12, 0, monitor)
  mesh('Monitor_Back', rbox(1.7, 1.2, 0.6, 0.12), shellDark, 0, 1.12, -0.36, monitor)
  mesh('Screen', new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), glass, SCREEN.x, SCREEN.y, SCREEN.z, monitor)
  mesh('Monitor_Neck', box(0.3, 0.42, 0.16), shellDark, 0, 0.25, -0.3, monitor)
  mesh('Monitor_Base', rbox(0.9, 0.05, 0.55, 0.02), trim, 0, 0.025, -0.2, monitor)
  mesh('Monitor_LED', box(0.03, 0.03, 0.01), led, 0.88, 0.5, 0.072, monitor)

  const tower = node('Tower', 1.72, 0.725, -0.15, -0.28, computer)
  mesh('Tower_Case', rbox(0.6, 1.45, 1.3, 0.04), shell, 0, 0, 0, tower)
  mesh('Tower_Front', new THREE.PlaneGeometry(0.5, 1.35), shellDark, 0, 0, 0.651, tower)
  mesh('Tower_Button', new THREE.CylinderGeometry(0.06, 0.06, 0.02, 32).rotateX(Math.PI / 2), trim, 0, 0.45, 0.66, tower)
  mesh('Tower_Ring', new THREE.TorusGeometry(0.07, 0.007, 10, 48), ring, 0, 0.45, 0.662, tower)
  mesh('Tower_Vents', merged(box(0.36, 0.012, 0.006), Array.from({ length: 12 }, (_, i) => [0, -0.18 - i * 0.042, 0.655])), shellDark, 0, 0, 0, tower)

  const kb = node('Keyboard', -0.05, 0.022, 0.9, 0.04, computer)
  mesh('Keyboard_Base', rbox(1.5, 0.045, 0.5, 0.015), shellDark, 0, 0, 0, kb)
  const keyPos = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) keyPos.push([(c - 7) * 0.094, 0.035, (r - 2) * 0.092])
  mesh('Keyboard_Keys', merged(box(0.08, 0.03, 0.08), keyPos), keyM, 0, 0, 0, kb)
  const mouse = mesh('Mouse', new THREE.SphereGeometry(1, 20, 12), shellDark, 1.08, 0.03, 0.92, computer)
  mouse.scale.set(0.075, 0.035, 0.115)

  // ---------- desk props ----------
  const props = node('Props')
  const lamp = node('Lamp', -1.6, 0, 0.05, 0.5, props)
  mesh('Lamp_Base', new THREE.CylinderGeometry(0.16, 0.18, 0.04, 32), metal, 0, 0.02, 0, lamp)
  const arm1 = mesh('Lamp_Arm_Lower', box(0.03, 0.7, 0.03), metal, 0, 0.36, 0, lamp)
  arm1.rotation.z = 0.25
  const arm2 = mesh('Lamp_Arm_Upper', box(0.03, 0.55, 0.03), metal, 0.24, 0.85, 0, lamp)
  arm2.rotation.z = -1.0
  const head = mesh('Lamp_Head', new THREE.ConeGeometry(0.13, 0.2, 24, 1, true), metal, 0.48, 0.92, 0, lamp)
  head.rotation.z = 0.6
  mesh('Lamp_Bulb', new THREE.SphereGeometry(0.045, 16, 10), bulb, 0.5, 0.87, 0, lamp)

  const mug = node('Mug', 0.95, 0, 0.45, 0, props)
  mesh('Mug_Body', new THREE.CylinderGeometry(0.075, 0.068, 0.17, 24), ceramic, 0, 0.085, 0, mug)
  mesh('Mug_Handle', new THREE.TorusGeometry(0.045, 0.012, 8, 20), ceramic, 0.08, 0.09, 0, mug)

  const books = node('Books', -2.0, 0, -0.35, 0.25, props)
  ;[[0.42, 0.075, 0], [0.4, 0.07, 0.075], [0.44, 0.08, 0.148]].forEach(([w, h, y], i) =>
    mesh(`Book_${i + 1}`, rbox(w, h, 0.3, 0.01), bookMats[i], 0, y + h / 2, 0, books))

  const plant = node('Plant', 2.25, 0, 0.75, 0, props)
  mesh('Plant_Pot', new THREE.CylinderGeometry(0.11, 0.085, 0.2, 20), pot, 0, 0.1, 0, plant)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const l = mesh(`Plant_Leaf_${i + 1}`, new THREE.SphereGeometry(1, 8, 6), leaf, Math.cos(a) * 0.05, 0.32 + (i % 3) * 0.04, Math.sin(a) * 0.05, plant)
    l.scale.set(0.035, 0.15, 0.014)
    l.rotation.set(Math.sin(a) * 0.6, -a, Math.cos(a) * 0.6)
  }

  // ---------- back wall: shelf and two lit blueprint panels ----------
  const wallG = node('Wall_Decor', 0, 0, 0, 0, env)
  mesh('Shelf', rbox(1.5, 0.05, 0.32, 0.01), frame, -2.3, 1.55, ROOM.back + 0.17, wallG)
  ;[[-2.75, 0.34, 1], [-2.55, 0.3, 2], [-2.37, 0.36, 3], [-2.2, 0.28, 4]].forEach(([x, h, i]) =>
    mesh(`Shelf_Book_${i}`, box(0.12, h, 0.24), bookMats[(i - 1) % bookMats.length], x, 1.575 + h / 2, ROOM.back + 0.17, wallG))
  const panel = (name, x, y, w, h, lines) => {
    const g = node(name, x, y, ROOM.back + 0.03, 0, wallG)
    mesh(`${name}_Frame`, box(w + 0.08, h + 0.08, 0.04), frame, 0, 0, 0, g)
    mesh(`${name}_Panel`, new THREE.PlaneGeometry(w, h), art, 0, 0, 0.021, g)
    lines.forEach(([lx, ly, lw, lh], i) => mesh(`${name}_Line_${i + 1}`, new THREE.PlaneGeometry(lw, lh), artLine, lx, ly, 0.023, g))
  }
  panel('Panel_Left', -1.75, 2.5, 0.8, 1.0, [[0, 0.38, 0.6, 0.012], [0, -0.42, 0.6, 0.012], [-0.15, 0, 0.012, 0.5], [0.12, 0.05, 0.3, 0.012]])
  panel('Panel_Right', 2.25, 2.45, 1.1, 0.75, [[0, 0.26, 1.0, 0.012], [-0.3, -0.1, 0.012, 0.42], [0.2, -0.12, 0.5, 0.012], [0.35, 0.05, 0.012, 0.3]])

  // ---------- anchors ----------
  const anchors = node('Anchors')
  empty('CameraHome', 0.75, 1.7, 6.1, anchors)
  empty('CameraLook', 0.2, 0.92, 0, anchors)
  empty('LampLight', -1.16, 0.8, -0.15, anchors)
  empty('ScreenGlow', 0, 1.15, 0.7, anchors)

  root.updateMatrixWorld(true)
  return root
}
