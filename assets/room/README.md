# The 3D room as a .glb

`walker-os-room.glb` is the whole Walker.OS room (`boot3d.js`) exported as one binary glTF file, ready
to open in Blender or any glTF editor.

## What's in it

```
WalkerOS_Room
  Section_Room          floor, ceiling, walls, rug, door sign
  Section_Ballpark      turf, fence, infield, ballpark light
  Section_Computer      Computer > Monitor, Tower, Keyboard (Keyboard_Keys_i0 ... one node per key), Mouse
  Section_Desk          desk, lamp, books, notepads, mug, router, ...
  Section_BackWall      shelf, posters (Poster_<title>), light switch
  Section_RightWall     skate decks, cap
  Section_Hoop          hoop, net, ticker, basketball
  Section_HomeRunDerby  pitching machine, scoreboard, home plate, bat
  Section_BowlingWing   lanes, pins, masking, crowd riser, ball returns
  Section_Avatars       the bowler and the crowd
  Section_Windows       Window_Nighthawks, Window_The_Starry_Night and the scenes outside them
  Section_Lights        point, spot and directional lights (Light_Key, Light_CeilingFill, ...)
  Section_Screen        the monitor's glass
```

- Every node has a unique, stable name. Re-import matches edits by these names, so **don't rename
  existing objects**.
- Materials are PBR (metal/rough) with their textures packed in. Untouched ones are named `WOS_...`.
- The animated starry sky is baked into a still texture (`WOS_StarrySky_Baked`).
- The live monitor screen is HTML in the site, so in the file it is a dark glass panel.
- The file has no hemisphere or ambient lights, because glTF can't store them.
- Hidden effects are left out: confetti, the aim rings, flashes and steam sprites.
- Units: 1 unit ≈ 0.58 m, Y up in glTF. Blender converts to Z up on import and back on export.

## Making a fresh copy

The room is built by code, so the file is exported from the running site:

1. Serve the site locally and open `/explore`.
2. Click **Export room (.glb)** (bottom left). The button appears only on `localhost`/`127.0.0.1`,
   or with `?dev` in the URL.
   - Or run this in the browser console: `WOS3D.exportRoom()`
3. Your browser downloads `walker-os-room.glb`. Move it here, to `assets/room/`, to replace this copy.

The export always captures the room as it was built, whatever is animating at that moment.

## Editing in Blender and bringing it back

1. In Blender, use **File > Import > glTF 2.0** and pick `walker-os-room.glb`.
2. Edit. These changes come back into the site:
   - **Move / rotate / scale** any object.
   - **Reshape** a mesh. The object's bounds or vertex count must change for this to be picked up.
   - **Recolour**:
     - To change color, roughness, metalness or emission, edit the existing `WOS_...` material. The
       object keeps its drawn texture.
     - To replace the material outright, textures included, assign a **new** material (any name that
       doesn't start with `WOS_`).
   - **Delete** an object. It is hidden in the room.
   - **Add** new objects. Parent them to a section empty or to an existing object.
3. Export the whole scene: **File > Export > glTF 2.0**, Format **glTF Binary (.glb)**, with
   **Include > Punctual Lights** on. Don't use "Selected objects only": anything missing from the
   file counts as deleted.
   - Save it here as `assets/room/walker-os-room.edited.glb`.
4. In `boot3d.js`, set:
   ```js
   const ROOM_EDITS_URL = 'assets/room/walker-os-room.edited.glb'
   ```
5. Reload the site. The browser console prints `[room-edits] applied ...` with the objects it
   moved, reshaped, recoloured, added and deleted.

Set `ROOM_EDITS_URL` back to `''` to return to the room exactly as the code builds it.

### What stays under code control

The room keeps all of its behaviour after an edit, because the edits are laid over the procedural
room rather than replacing it. That also means:

- **Positioned every frame by code:** the ball, pins, avatars and the bat. Moving these in Blender
  has no effect.
- **Lights:** take the new position only. Their aim and animated brightness come from the code.
- **The monitor's live screen** is placed by `SCREEN_POS` in `boot3d.js`. Moving the Computer in
  Blender doesn't move the screen.
- **Walking collisions** come from `SOLIDS` in `boot3d.js`. Moved furniture keeps its old collision
  box.
- **When the room's code changes** (objects added or removed in `boot3d.js`), generated names can
  shift. Export a fresh copy and redo the edits on it.
