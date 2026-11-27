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

## The redesigned room (`walker-os-room.edited.glb`)

Built in Blender (`WalkerOSRoom.blend`) on top of this export and loaded by `ROOM_EDITS_URL` in `boot3d.js`.

- **Seated desk:** walnut desk top (`Ballpark_Box_7`), steel sled legs, cable tray, felt desk mat, thin-bezel monitor
  (`Monitor_Box*`; the screen stays at `SCREEN_POS`), aluminium keyboard case, new mouse, a smaller glass-sided
  tower with fans, GPU and RAM (`Tower_*`), and `DeskChair`. The Blender scene camera `Cam_Seated` is the seated eye point.
- **Lights added:** `DeskLamp_TaskLight`, `MonitorLightBar_Light`, `TrackLight_Spot_L/R`, `FloorLamp_Light`.
  **Retired** (hidden on the site): `DeskLamp_Light` and `Light_Wash` (both cool blue, colour set by code).
  `Light_Rim` moved behind the monitor as bias lighting.
- **Light budget:** every light costs every pixel in three.js. The room had 20 lights; going past about 23 halved the
  frame rate, so the window lights (`Window_StarryNight_MoonSpill`, `Window_Nighthawks_StreetFill`, `SN_MoonGlow`,
  `NH_DinerLight`) live in `COL_BlenderOnly` and light only the Blender view. On the site, the code's
  `Light_Moon` and `Light_DinerSpill` light the windows. With the second room retired, 14 lights render.
  Add a web light only if you remove one.
- **Posters:** all `Poster_*` hang on the back wall behind the desk with new frames, on one centre line
  (z 2.3, every poster's empty scaled 0.8; the site's focus zoom accounts for the scale). Left of the desk, other
  interests: Exposure, Creative Direction, History, Video Production, Research and Writing, Contracts. Right, sports:
  Triple Option, Scuderia Ferrari, 2024 Purdue, Big Ten, National Champions, Camden Yards, Analytics, Sports
  Management. Creative Direction, Video Production and Research and Writing are drawn by `boot3d.js` (canvas
  textures); their planes in the .blend carry packed PNG renders of the same art under `WOS_Poster_*` materials,
  so the site keeps its live canvas and Blender shows the poster.
- **Interest props** (`COL_Props`, materials `PROP_*`, merged one mesh per material per group): `Prop_BatRack`
  (34 in maple bat on brass pegs over a walnut plaque) and `Prop_GloveShelf` (glove + baseball) under the sports
  posters; `Prop_InterestShelf` (clapperboard, globe, gavel) under the other-interest posters.
- **Retired** (`COL_Retired`, excluded from the view layer, so never exported and hidden on the site): the second
  room and everything in it (ballpark, home run derby, hoop, bowling wing, avatars, pins, their 8 lights), the
  doorway (`Room_Group*`, `Room_Box_6`–`9`), `DoorSign` ("BALLPARK →"), the Purdue / IU marks (`BackWall_Group*`),
  the tower's leftover power ring (`Tower_Torus`, `Tower_PowerButton`) and the Blender-built `NH_*` diner.
  `BO_DoorFill` (Blender only) closes the doorway in the .blend; on the site `boot3d.js` adds `Wall_Front_DoorFill`.
  The code side is `MINIGAMES` in `boot3d.js`: off, the games are still built (generated names stay stable) but
  hidden, never stepped and not clickable. Turning it back on also needs the retired objects moved back into
  `Collection` and a re-export.
- **Windows:** `Outside_StarryNight` keeps its animated sky backdrop with new 3D terrain, village, cypress,
  stars, moon and swirls (`SN_*`). `Outside_Nighthawks` is the original code-built diner again (its 193
  `Outside_Nighthawks_*` children restored from `WalkerOSRoom.original-backup.blend`), so the waiter, steam, light
  flicker and the L-shaped counter all run from `nighthawks()` in `boot3d.js`.
  The Starry Night land (`SN_Terrain`, `SN_Village`, `SN_Cypress`, `SN_Trees`) shares `DIO_Paint`, which is
  **unlit** (its colour goes straight to Material Output, exported as `KHR_materials_unlit`): the painting shows its
  own colours (vertex colour `Col` × brush texture) without needing lights.

### Exporting from the .blend again

1. Hide the `COL_BlenderOnly` collection in the viewport (it holds the Blender-only screen picture, area lights,
   the doorway fill and preview cameras), and keep `COL_Retired` excluded.
2. File > Export > glTF 2.0: **glTF Binary**, **Include > Visible Objects**, **Punctual Lights** and **Cameras** on,
   **Lighting Mode: Unitless** (Blender watts / 4π = the intensity the site uses), Apply Modifiers on.
   **Data > Mesh > Vertex Color: Name**, name `Col`, with **Export all vertex colors** off. (The default exports a
   fake white `COLOR_0` for the unlit `DIO_Paint` meshes and pushes the real colours to `COLOR_1`, which the site
   ignores, so the painting turns white.)
3. Don't apply transforms (Ctrl+A) on existing objects: the site matches them by name and transform, and posters
   take their focus direction from their rotation.
