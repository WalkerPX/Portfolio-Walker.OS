// Exports the procedural landing scene (landing/landing-scene.js) to assets/landing/landing.glb.
//
//   cd tools && npm install && npm run export-landing
//
// Only needed to regenerate the .glb from code. If you edit the scene in Blender instead,
// export from Blender straight over assets/landing/landing.glb and skip this script.
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildLandingScene } from '../landing/landing-scene.js'

// GLTFExporter reads its binary output through FileReader, which Node doesn't have
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((buf) => { this.result = buf; this.onload?.({ target: this }); this.onloadend?.({ target: this }) }) }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`
        this.onload?.({ target: this }); this.onloadend?.({ target: this })
      })
    }
  }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, '../assets/landing/landing.glb')

const scene = new THREE.Scene()
scene.add(buildLandingScene(THREE, { RoundedBoxGeometry, mergeGeometries }))
scene.updateMatrixWorld(true)

const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true })
await mkdir(path.dirname(out), { recursive: true })
await writeFile(out, Buffer.from(glb))
console.log(`wrote ${path.relative(process.cwd(), out)} (${(glb.byteLength / 1024).toFixed(1)} KB)`)
