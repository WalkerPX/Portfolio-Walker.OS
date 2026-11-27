// Walker.OS: lay an edited copy of the exported room (room-export.js) back over the live room.
//
// The room stays procedural, so everything that moves or reacts (the computer's screen, posters,
// the ball, the derby and bowling games, the light switch) keeps working. The edited file is
// matched onto it node by node, by name, while the room builds:
//   moved / rotated / scaled   the object takes the file's transform
//   reshaped                   a mesh whose shape changed (vertex count or bounds) takes the file's geometry
//   recoloured                 a material renamed or newly assigned in the editor replaces the live one;
//                              an untouched WOS_ material keeps its live textures and takes only the
//                              file's colour, roughness, metalness and emissive colour if they changed
//   deleted                    an object missing from the file is hidden
//   added                      a node the room doesn't have is added, under the matching parent
// Instanced meshes (keyboard keys, tower vents) are matched per instance (Keyboard_Keys_i0, ...).
// Lights take the file's position only; their aim, and everything the code positions every frame
// (the ball, pins, avatars, the bat), stay as the code sets them.
import * as THREE from 'three'
import { ROOT_NAME, SECTION_PREFIX, MAT_PREFIX, INSTANCE_SEP, TARGET_SUFFIX, exportable } from './room-export.js'

const EPS = 1e-4

export async function applyRoomEdits({ scene, url }) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
  const file = (await new GLTFLoader().loadAsync(url)).scene

  const live = new Map()
  scene.traverse((o) => { if (o !== scene) live.set(o.name, o) })
  const wasVisible = new Map([...live].map(([n, o]) => [n, o.visible]))
  const seen = new Set()
  const stats = { moved: 0, reshaped: 0, recoloured: 0, added: 0, deleted: 0 }
  const changed = { moved: [], reshaped: [], recoloured: [], added: [], deleted: [] }
  const count = (k, name) => { stats[k]++; changed[k].push(name) }
  const b1 = new THREE.Box3(), b2 = new THREE.Box3(), m4 = new THREE.Matrix4()

  const differs = (a, b) => a.distanceToSquared(b) > EPS * EPS
  function applyTransform(o, node) {
    if (o.isLight) {
      if (differs(o.position, node.position)) { o.position.copy(node.position); count('moved', o.name) }
      return
    }
    const moved = differs(o.position, node.position) || differs(o.scale, node.scale) || 1 - Math.abs(o.quaternion.dot(node.quaternion)) > EPS
    if (!moved) return
    o.position.copy(node.position)
    o.quaternion.copy(node.quaternion)
    o.scale.copy(node.scale)
    count('moved', o.name)
  }

  function applyGeometry(o, g) {
    if (!o.geometry || !g) return
    const n0 = o.geometry.attributes.position?.count, n1 = g.attributes.position?.count
    o.geometry.computeBoundingBox()
    g.computeBoundingBox()
    b1.copy(o.geometry.boundingBox)
    b2.copy(g.boundingBox)
    const sameBox = b1.min.distanceTo(b2.min) < 1e-3 && b1.max.distanceTo(b2.max) < 1e-3
    // an untouched mesh re-saved by Blender may split vertices differently: only a change in the
    // bounds, or a different vertex count on a mesh that was not merely re-split, counts as a reshape
    if (sameBox && (n0 === n1 || Math.abs(n0 - n1) < n0 * 0.5)) return
    o.geometry = g
    count('reshaped', o.name)
  }

  function applyMaterial(o, fm) {
    if (!fm || Array.isArray(o.material)) return
    if (!String(fm.name).startsWith(MAT_PREFIX)) {
      o.material = fm
      count('recoloured', o.name)
      return
    }
    const lm = o.material
    // Blender re-saves some unlit materials (fully transparent ones) as lit ones: compare values only
    // when the material kind survived the trip
    const kind = (m) => (m.isMeshBasicMaterial ? 'unlit' : 'pbr')
    if (kind(lm) !== kind(fm)) return
    let dirty = false
    const near = (a, b) => Math.abs(a - b) < 0.02
    if (lm.color && fm.color && !(near(lm.color.r, fm.color.r) && near(lm.color.g, fm.color.g) && near(lm.color.b, fm.color.b))) {
      lm.color.copy(fm.color)
      dirty = true
    }
    for (const k of ['roughness', 'metalness']) {
      if (typeof lm[k] === 'number' && typeof fm[k] === 'number' && !near(lm[k], fm[k])) { lm[k] = fm[k]; dirty = true }
    }
    // glTF stores glow as colour × strength; compare (and apply) it that way, keeping the live
    // strength the code animates
    if (lm.emissive && fm.emissive && !lm.emissiveMap) {
      const li = lm.emissiveIntensity ?? 1
      const le = lm.emissive.clone().multiplyScalar(li), fe = fm.emissive.clone().multiplyScalar(fm.emissiveIntensity ?? 1)
      if (!(near(le.r, fe.r) && near(le.g, fe.g) && near(le.b, fe.b))) {
        if (li > 0) lm.emissive.copy(fe).multiplyScalar(1 / li)
        else { lm.emissive.copy(fe); lm.emissiveIntensity = 1 }
        dirty = true
      }
    }
    if (dirty) count('recoloured', o.name)
  }

  function applyInstances(o, node) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const byName = new Map(node.children.map((c) => [c.name, c]))
    let touched = false
    for (let i = 0; i < o.count; i++) {
      const c = byName.get(o.name + INSTANCE_SEP + i)
      if (c) m4.compose(c.position, c.quaternion, c.scale)
      else m4.copy(zero) // deleted in the editor
      o.setMatrixAt(i, m4)
      touched = true
    }
    if (touched) o.instanceMatrix.needsUpdate = true
  }

  function addNew(node, parent) {
    node.removeFromParent()
    node.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    parent.add(node)
    count('added', node.name)
  }

  function visit(node, liveParent) {
    if (node === file || node.name === ROOT_NAME || node.name.startsWith(SECTION_PREFIX)) {
      for (const c of node.children.slice()) visit(c, scene)
      return
    }
    // light aim targets: ours (…_Target) and the unnamed one the glTF loader adds to each spot/directional light
    if (node.name.endsWith(TARGET_SUFFIX) || (node.parent?.isLight && node.parent.target === node)) return
    const o = live.get(node.name)
    if (!o) return addNew(node, liveParent)
    seen.add(o.name)
    applyTransform(o, node)
    if (o.isInstancedMesh) return applyInstances(o, node)
    if (o.isMesh && node.isMesh) {
      applyGeometry(o, node.geometry)
      applyMaterial(o, node.material)
    }
    // a mesh with several materials loads as a group of unnamed part meshes: they are this object
    const parts = o.isMesh && !node.isMesh
    for (const c of node.children.slice()) {
      if (parts && c.isMesh && !live.has(c.name)) continue
      visit(c, o)
    }
  }
  visit(file, scene)

  // objects the file no longer has were deleted in the editor (only kinds the export writes, and only
  // the top of a deleted branch: hiding it hides what is under it)
  for (const [name, o] of live) {
    if (seen.has(name) || !wasVisible.get(name) || !exportable(o)) continue
    if (o.parent && o.parent !== scene && !seen.has(o.parent.name)) continue
    o.visible = false
    count('deleted', name)
  }
  console.info('[room-edits] applied', url, stats, changed)
  return { ...stats, changed }
}
