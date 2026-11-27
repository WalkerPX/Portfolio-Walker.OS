// Walker.OS: export the 3D room as a .glb for Blender (or any glTF editor).
//
// The room is built procedurally in boot3d.js, so the export walks the live scene and writes a
// clean copy of it:
//   WalkerOS_Room
//     Section_Room, Section_Ballpark, Section_Computer, Section_Desk, ...  (one per build section)
//       objects with stable, unique names (Monitor, Tower, Poster_Contracts, Light_Key, ...)
// Meshes keep their transforms, hierarchy and PBR materials (with their canvas-drawn textures);
// instanced meshes (keyboard keys, tower vents) are written as one mesh per instance so each can be
// moved; the animated sky shader is baked to a texture; point, spot and directional lights are
// kept (glTF has no hemisphere or ambient lights). Hidden effects (confetti, aim rings, the ball
// flash) and sprites are left out.
//
// Usage (in the browser, with the room loaded):
//   WOS3D.exportRoom()                 downloads walker-os-room.glb
//   WOS3D.exportRoom({ download: false })  resolves with the ArrayBuffer
// On a local server the room also shows an "Export room (.glb)" button (boot3d.js).
// Editing and re-importing: see assets/room/README.md and room-edits.js.
import * as THREE from 'three'

export const ROOT_NAME = 'WalkerOS_Room'
export const SECTION_PREFIX = 'Section_'
export const MAT_PREFIX = 'WOS_'
export const INSTANCE_SEP = '_i'
export const TARGET_SUFFIX = '_Target'

// ---------- names ----------
// Every object gets a unique name, assigned once right after the room is built, in scene order.
// The same code builds the same room, so the names come out the same on every load: that is what
// lets an edited copy be matched back onto the live room by name. Names stay under Blender's
// 63-character limit and use only letters, digits and underscores.
const clean = (s) => String(s).replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 52) || 'Object'

function autoName(o) {
  const kind = o.userData?.kind
  const prefix = o.parent && !o.parent.isScene && o.parent.name ? o.parent.name.split(/_\d+$/)[0] + '_'
    : typeof o.userData?.section === 'string' ? o.userData.section + '_' : ''
  if (o.isLight) return 'Light_' + o.type.replace(/Light$/, '')
  if (typeof kind === 'string') return prefix + kind[0].toUpperCase() + kind.slice(1)
  if (o.isMesh) {
    const g = (o.geometry?.type || 'Mesh').replace(/(Buffer)?Geometry$/, '') || 'Mesh'
    return prefix + g + (o.isInstancedMesh ? '_Instances' : '')
  }
  if (o.isSprite) return prefix + 'Sprite'
  return prefix + 'Group'
}

// ---------- rest state ----------
// The room animates (pins, the derby machine's wheels, glows, lights). The export and the re-import
// both work from the room as it stood when it was built, recorded here, so a mid-animation export
// doesn't read as an edit and only real edits are applied.
const REST = new WeakMap()
const REST_MAT = new WeakMap()
const MAT_KEYS = ['color', 'emissive']
const MAT_NUMS = ['emissiveIntensity', 'roughness', 'metalness', 'opacity']

function recordRest(o) {
  const r = { visible: o.visible, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone() }
  if (o.isInstancedMesh) r.instances = o.instanceMatrix.array.slice(0, o.count * 16)
  if (o.isLight) { r.intensity = o.intensity; r.color = o.color.clone() }
  REST.set(o, r)
  for (const m of [o.material].flat()) {
    if (!m || REST_MAT.has(m)) continue
    const s = {}
    for (const k of MAT_KEYS) if (m[k]?.isColor) s[k] = m[k].clone()
    for (const k of MAT_NUMS) if (typeof m[k] === 'number') s[k] = m[k]
    REST_MAT.set(m, s)
  }
}
export const restOf = (o) => REST.get(o) || { visible: o.visible, position: o.position, quaternion: o.quaternion, scale: o.scale }
export const restMat = (m) => REST_MAT.get(m) || {}

export function assignNames(scene) {
  const used = new Set()
  const visit = (o) => {
    const base = clean(o.name || autoName(o))
    let n = base, k = 1
    while (used.has(n)) n = `${base}_${++k}`
    used.add(n)
    o.name = n
    recordRest(o)
    o.children.forEach(visit)
  }
  scene.children.forEach(visit)
}

// what the export writes (the re-import only hides deleted objects of these kinds)
export const exportable = (o) => !o.isSprite && !o.isPoints && !o.isLine && !o.isCSS3DObject
  && (!o.isLight || o.isPointLight || o.isSpotLight || o.isDirectionalLight)

// ---------- export ----------
export async function exportRoom({ scene, renderer, download = true, filename = 'walker-os-room.glb' } = {}) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  scene.updateMatrixWorld(true)

  const root = new THREE.Group()
  root.name = ROOT_NAME
  root.userData = { wos: { exported: new Date().toISOString(), units: 'room units (1 = about 0.58 m)' } }
  const sections = new Map()
  const sectionGroup = (name) => {
    if (!sections.has(name)) {
      const g = new THREE.Group()
      g.name = SECTION_PREFIX + clean(name)
      sections.set(name, g)
      root.add(g)
    }
    return sections.get(name)
  }

  const mats = makeMaterialMapper(renderer)
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4()

  function convertLight(o) {
    const r = restOf(o)
    const color = r.color || o.color, intensity = r.intensity ?? o.intensity
    let L
    if (o.isSpotLight) L = new THREE.SpotLight(color, intensity, o.distance, o.angle, o.penumbra, o.decay)
    else if (o.isPointLight) L = new THREE.PointLight(color, intensity, o.distance, o.decay)
    else if (o.isDirectionalLight) L = new THREE.DirectionalLight(color, intensity)
    else return null
    L.position.copy(r.position)
    if (o.target) {
      // glTF lights shine down their own -z: aim the node at the live target, in the parent's frame
      o.getWorldPosition(v1)
      o.target.getWorldPosition(v2)
      const qWorld = new THREE.Quaternion().setFromRotationMatrix(m4.lookAt(v1, v2, THREE.Object3D.DEFAULT_UP))
      L.quaternion.copy(o.parent.getWorldQuaternion(q).invert().multiply(qWorld))
      L.target.name = o.name + TARGET_SUFFIX
      L.target.position.set(0, 0, -1)
      L.add(L.target)
    }
    return L
  }

  function convert(o) {
    const rest = restOf(o)
    if (!rest.visible || !exportable(o)) return null
    let out
    if (o.isLight) {
      out = convertLight(o)
      if (!out) return null
    } else if (o.isInstancedMesh) {
      out = new THREE.Group()
      const mat = mats.map(o.material, o)
      for (let i = 0; i < o.count; i++) {
        const c = new THREE.Mesh(o.geometry, mat)
        if (rest.instances) m4.fromArray(rest.instances, i * 16)
        else o.getMatrixAt(i, m4)
        m4.decompose(c.position, c.quaternion, c.scale)
        c.name = o.name + INSTANCE_SEP + i
        out.add(c)
      }
    } else if (o.isMesh) {
      out = new THREE.Mesh(o.geometry, mats.map(o.material, o))
    } else {
      out = new THREE.Group()
    }
    out.name = o.name
    if (!o.isLight) {
      out.position.copy(rest.position)
      out.quaternion.copy(rest.quaternion)
      out.scale.copy(rest.scale)
    }
    const ud = {}
    if (typeof o.userData.kind === 'string') ud.kind = o.userData.kind
    if (typeof o.userData.title === 'string') ud.title = o.userData.title
    if (Object.keys(ud).length) out.userData = { wos: ud }
    for (const c of o.children) {
      const cc = convert(c)
      if (cc) out.add(cc)
    }
    return out
  }

  for (const o of scene.children) {
    const out = convert(o)
    if (out) sectionGroup(o.userData.section || 'Misc').add(out)
  }
  mats.finish()

  const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 4096 })
  mats.dispose()
  if (download) downloadGLB(glb, filename)
  return glb
}

export function downloadGLB(buf, filename = 'walker-os-room.glb') {
  const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ---------- materials ----------
// Each live material maps to one exported copy (shared where the room shares it), named WOS_...
// so the re-import can tell an untouched material from one assigned in Blender.
function makeMaterialMapper(renderer) {
  const cache = new Map()
  const opaqueTex = new Set(), alphaTex = new Set()
  const disposables = []
  let n = 0

  const hex = (c) => (c?.isColor ? c.getHexString() : 'ffffff')
  const label = (m) => MAT_PREFIX + clean(m.name || `${m.type.replace(/^Mesh|Material$/g, '')}_${hex(m.color)}`) + '_' + (++n)

  function note(m) {
    for (const k of ['map', 'emissiveMap']) {
      const t = m[k]
      if (!t?.isTexture) continue
      ;(m.transparent || m.alphaTest > 0 ? alphaTex : opaqueTex).add(t)
    }
  }

  function bakeSky(m) {
    // render the shader once onto a texture (its uniforms as they are now)
    const W = 2048, H = 1024
    const rt = new THREE.WebGLRenderTarget(W, H)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)
    const s = new THREE.Scene()
    s.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2)
    cam.position.z = 1
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(rt)
    renderer.clear()
    renderer.render(s, cam)
    const px = new Uint8Array(W * H * 4)
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px)
    renderer.setRenderTarget(prev)
    rt.dispose()
    quad.geometry.dispose()
    // GL rows run bottom-up, canvas rows top-down
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const img = c.getContext('2d').createImageData(W, H)
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
    c.getContext('2d').putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.userData.mimeType = 'image/jpeg'
    disposables.push(tex)
    const out = new THREE.MeshBasicMaterial({ map: tex, side: m.side })
    out.name = MAT_PREFIX + 'StarrySky_Baked'
    return out
  }

  function one(m, o) {
    if (!m) return null
    const key = o?.name === 'Screen' ? 'screen' : m
    if (cache.has(key)) return cache.get(key)
    let out
    if (o?.name === 'Screen') {
      // the live screen is HTML (CSS3D); in the file it is a dark glass panel
      out = new THREE.MeshStandardMaterial({ color: '#05060c', emissive: '#0b0b1c', roughness: 0.2, metalness: 0.1 })
      out.name = MAT_PREFIX + 'Screen'
    } else if (m.isShaderMaterial) {
      out = m.uniforms?.uScale ? bakeSky(m) : new THREE.MeshStandardMaterial({ color: '#808080' })
      if (!out.name) out.name = MAT_PREFIX + 'Shader_Unsupported'
    } else if (m.isMeshStandardMaterial || m.isMeshBasicMaterial) {
      out = m.clone() // shares the textures
      // as built, not mid-glow
      const r = restMat(m)
      for (const k of MAT_KEYS) if (r[k]) out[k].copy(r[k])
      for (const k of MAT_NUMS) if (k in r) out[k] = r[k]
      out.name = label(m)
      note(out)
    } else {
      out = new THREE.MeshStandardMaterial({
        color: m.color || '#ffffff', map: m.map || null, emissive: m.emissive || '#000000', emissiveMap: m.emissiveMap || null,
        transparent: m.transparent, opacity: m.opacity, side: m.side,
      })
      out.name = label(m)
      note(out)
    }
    disposables.push(out)
    cache.set(key, out)
    return out
  }

  return {
    map: (m, o) => (Array.isArray(m) ? m.map((x) => one(x, o)) : one(m, o)),
    // large opaque canvas textures go out as JPEG (much smaller); anything with alpha stays PNG
    finish() {
      for (const t of opaqueTex) {
        const img = t.image
        if (!alphaTex.has(t) && img && (img.width || 0) * (img.height || 0) >= 256 * 256 && !t.userData.mimeType) t.userData.mimeType = 'image/jpeg'
      }
    },
    dispose() {
      for (const d of disposables) d.dispose?.()
      for (const t of opaqueTex) if (t.userData.mimeType === 'image/jpeg') delete t.userData.mimeType
    },
  }
}
