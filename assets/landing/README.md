# Landing scene (`landing.glb`)

The site's first screen is a live 3D view of the desk and computer, loaded from `landing.glb` by
`landing/landing3d.js`. The full room (`boot3d.js`) only loads when the visitor clicks
**Explore the room**.

## Editing in Blender

1. **File → Import → glTF 2.0** and pick `assets/landing/landing.glb`.
2. Edit freely: move, reshape, recolour, add props, add textures.
3. **File → Export → glTF 2.0**, then:
   - Format: **glTF Binary (.glb)**
   - Include: tick **Custom Properties** if you add any; leave **Selected Objects** off
   - Transform: keep **+Y Up** ticked (the default)
   - Data → Mesh: keep **Apply Modifiers** on
   - Save over `assets/landing/landing.glb`.
4. Reload the site. Nothing else needs to change.

## Names the site depends on

Keep these object names (Blender's object name becomes the glTF node name):

| Name | What it does |
| --- | --- |
| `Computer` | Parent of everything clickable. Clicking any mesh under it boots the site. |
| `Screen` | A flat mesh on the monitor glass. The live boot screen is drawn over it, using its size, position and facing (keep it about 16:10). |
| `CameraHome` | Empty: where the camera rests. |
| `CameraLook` | Empty: the point the camera looks at. |
| `Monitor_LED` | Optional. Lights up green when the computer powers on. |
| `LampLight` | Optional empty: where the warm desk-lamp light goes. |
| `ScreenGlow` | Optional empty: where the screen's blue spill light goes. |

Lights are added in code (`landing/landing3d.js`), not read from the file, because Blender and
three.js use different light units. To move a light, move its empty.

## Regenerating from code

The original scene is built in `landing/landing-scene.js`. To rebuild the .glb from that file
(this overwrites Blender edits):

```bash
cd tools && npm install && npm run export-landing
```

If `landing.glb` is missing or broken, the site builds the scene from `landing-scene.js` instead,
so the landing never breaks.
