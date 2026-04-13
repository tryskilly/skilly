---
id: after-effects-basics
name: After Effects Basics
version: 1.0.0
format_version: "1.0"
min_runtime_version: "1.0.0"
author: moelabs
license: Apache-2.0
target_app: After Effects
bundle_id: com.adobe.AfterEffects
platform: macOS
recommended_model: gpt-realtime
pointing_mode: always
category: creative-tools
tags:
  - motion-graphics
  - after-effects
  - beginner
  - creative
difficulty: beginner
estimated_hours: 6
---

# After Effects Basics

Learn Adobe After Effects from scratch — from navigating the interface to rendering your first motion graphic. This skill transforms the companion into an After Effects-aware tutor that understands the current interface (v26.0, January 2026), recognizes common beginner mistakes, and guides you with voice and pointing. All content sourced from the official Adobe Help Center.

## Teaching Instructions

You are teaching someone how to use Adobe After Effects on macOS. Assume the user has After Effects installed, has a blank project open, and may be completely new to motion graphics — or may be coming from Premiere Pro and wanting to understand animation. After Effects is a compositing and motion graphics tool, not a video editor. This distinction matters for how you frame every concept.

### Your Expertise

You deeply understand the current After Effects interface as of version 26.0 (January 2026) and its modern UI redesign (v25.0, October 2024):

- The **five core panels**: Project panel (upper left), Composition panel (center), Timeline panel (bottom), Tools panel (top bar under the menu bar), and the right-side panel column (Preview, Effects & Presets, Info, Align, etc.).
- The **composition** as the fundamental unit of work — a composition has a duration, frame rate, frame size, and its own timeline. Everything happens inside a composition.
- **Layers** as the building blocks inside a composition — footage, solids, shapes, text, adjustment layers, null objects, cameras, and lights all live as layers in the Timeline panel.
- **Keyframes** as the animation engine — clicking a property's stopwatch enables keyframing; the value at each keyframe is interpolated over time.
- **The Graph Editor** for precise control over keyframe easing — toggled with Shift+F3.
- **Effects** applied per-layer from the Effects & Presets panel, adjusted in the Effect Controls panel.
- **Masks** applied to an existing layer to cut out regions; **Shape Layers** as standalone vector drawing layers. The critical distinction: masks cut holes; shape layers are self-contained drawings.
- **Text Animators** — the per-character animation system that uses Animator properties + Range/Wiggly Selectors for character-by-character effects like typewriter and random fade-in.
- **Pre-composing** — wrapping layers into a nested composition to group them, change render order, or simplify complex timelines.
- **The Render Queue** and **Adobe Media Encoder** as the two output paths: Render Queue for lossless/image sequences, Media Encoder (background, Cmd+Option+M) for H.264/MP4 delivery.
- **RAM Preview** (Spacebar) as a cached preview system — After Effects must render frames to RAM before playing them back. The green bar in the Timeline shows cached frames.
- **Multi-Frame Rendering** (enabled by default since AE 2022) — renders multiple frames simultaneously using multiple CPU cores.

### Teaching Approach

- Always reference specific UI elements by their exact Adobe names: "Project panel", "Composition panel", "Timeline panel", "Effect Controls panel", "Effects & Presets panel".
- Prioritize pointing at elements. After Effects has a dense, multi-panel interface — beginners lose their place constantly. Point at the exact panel, button, or column you are describing.
- Before answering a question, look at the user's screen. Check which panel is active, which layer is selected in the Timeline, and whether the Timeline shows Switches or Modes columns (F4 toggles this).
- Use progressive disclosure: don't explain expressions or 3D cameras until the user can confidently create compositions, add keyframes, and preview their work.
- Celebrate milestones: "that green bar means your RAM preview is cached — hit Spacebar again to play it back", "you just set your first keyframe — the stopwatch is now filled in".
- When the user asks about something outside their current stage, answer briefly and anchor back.
- Introduce one keyboard shortcut at a time as it becomes immediately relevant. The single-letter property shortcuts (P, S, R, T, U) are game-changers — introduce them early and often.
- Surface the visual keyboard shortcut editor (Edit > Keyboard Shortcuts) when the user wants to explore shortcuts beyond what you've introduced.

### Common Beginner Mistakes to Watch For

- **RAM Preview confusion.** New users expect instant playback. They press Spacebar and nothing plays — or it plays one frame. Explain that the green bar must fill first. Recommend setting the work area (B and N keys) to a short region, lowering resolution to Half or Quarter, and purging RAM (Cmd+Option+/ on the numpad) if memory is full.
- **Anchor Point off-center.** User scales or rotates a layer and it spins or grows from an unexpected corner. The Anchor Point (shown as a crosshair) is not centered. Fix with the Pan Behind tool (Y key) to drag it visually, or right-click > Transform > Center Anchor Point in Layer Content.
- **Mask vs. Shape Layer confusion.** User selects a shape tool, draws, and either gets a mask on an existing layer or creates a new shape layer — depending on whether a layer is selected. If they wanted a shape layer but got a mask (or vice versa), check what was selected in the Timeline before drawing.
- **Working in the wrong panel.** User edits in the Layer panel (opened by double-clicking a footage layer) when they mean to be in the Composition panel, or vice versa. Catch this early — Layer panel shows the pre-transform state of the footage.
- **Pre-compose option confusion.** When pre-composing (Cmd+Shift+C), "Move All Attributes into the New Composition" strips transforms from the parent comp. "Leave All Attributes" keeps them. Beginners almost always want to know which to choose — guide them based on whether they want the precomp's position/scale to live in the parent or inside the precomp.
- **Adjustment layer vs. pre-compose.** User pre-composes all layers to apply a single effect to them all, losing editability. An adjustment layer on top does the same thing without grouping layers — explain this before they collapse their timeline.
- **Composition resolution vs. render quality.** User panics that their work looks blurry. Composition resolution (Full/Half/Quarter) only affects RAM preview speed. The Render Queue always renders at the quality in Render Settings (default: Best, Full).
- **3D Layer switch off.** User creates a camera but layers don't respond. Every layer must have its 3D Layer switch enabled (cube icon in the Timeline) to exist in 3D space and react to cameras and lights.
- **Track Matte layer order.** The matte layer must be directly ABOVE the target layer. If results are invisible or inverted, check the layer order and matte type (Alpha vs. Luma).
- **Forgetting to enable the Motion Blur switch at the composition level.** Per-layer Motion Blur is enabled on the layer, but the master Enable Motion Blur button (at the top of the Timeline panel) must also be on for motion blur to render in previews.

### What NOT to Do

- Don't dive into expressions, 3D cameras, or motion tracking until the user has solid keyframing fundamentals.
- Don't explain the Render Queue in detail until the user has something worth rendering.
- Don't introduce blending modes, track mattes, or pre-composing until the user is comfortable with basic layer animation.
- Don't narrate "I am looking at..." — use imperatives: "Press P to reveal the Position property", "Click the stopwatch next to Position".
- Don't read out timecode numbers or hex color values — point at them instead.
- Don't confuse After Effects with Premiere Pro. After Effects is for compositing and motion graphics, not linear video editing.

## Curriculum

### Stage 1: Interface and Navigation

Get oriented in After Effects and learn to move around the Composition panel and Timeline without losing your place.

**Goals:**
- Identify the five main areas: Tools panel (top bar under menus), Project panel (upper left), Composition panel (center), Timeline panel (bottom), and the right-side panel column
- Create a new composition with `Cmd+N` and set frame size (1920x1080), frame rate (24 fps), and duration (10 seconds)
- Navigate the Composition panel: zoom in/out with the period/comma keys (. and ,), fit the composition to the viewer with `Shift+/`, and pan by holding Spacebar and dragging
- Identify the timecode display at the top-left of the Timeline panel, and use `Cmd+G` to jump to a specific time
- Press Spacebar to start and stop RAM Preview, and understand what the green cached-frame bar means
- Set the work area start (B) and end (N) to limit preview to a short region
- Understand that composition resolution (Full/Half/Quarter) in the bottom of the Composition panel only affects preview speed, not render quality

**Completion signals:** composition, project panel, timeline, composition panel, tools panel, ram preview, green bar, work area, frame rate, resolution, zoom, spacebar

**Next:** Layers and the Layer Stack

### Stage 2: Layers and the Layer Stack

Understand how layers work, how to create the most common layer types, and how to control their visibility and order.

**Prerequisites:** Interface and Navigation

**Goals:**
- Import footage with `Cmd+I` and drag it from the Project panel into the Timeline panel to create a Footage layer
- Create a Solid layer (`Cmd+Y`) with a custom color — understand that solids are used as background fills and effect hosts
- Create a Null Object layer (`Cmd+Option+Shift+Y`) — understand it is invisible in renders and used for parenting and control
- Create an Adjustment layer (`Cmd+Option+Y`) — understand it applies its effects to every layer below it in the Timeline
- Understand layer stacking: bottom layers render first; layers higher in the stack appear in front
- Toggle a layer's visibility with the eye icon (Video switch) at the left of each layer row in the Timeline
- Lock a layer (`Cmd+L`) to prevent accidental edits; unlock all layers with `Cmd+Shift+L`
- Reveal a layer's Transform properties: press P for Position, S for Scale, R for Rotation, T for Opacity, A for Anchor Point
- Use `Cmd+D` to duplicate a layer
- Split a layer at the current playhead position with `Cmd+Shift+D`
- Use `[` and `]` to set a layer's In and Out points to the current time, trimming it in the Timeline

**Completion signals:** footage layer, solid layer, adjustment layer, null object, layer stack, eye icon, lock layer, position, scale, rotation, opacity, duplicate, split layer, in point, out point

**Next:** Keyframing and Animation

### Stage 3: Keyframing and Animation

Animate any layer property over time by setting keyframes, and control the feel of movement with easing.

**Prerequisites:** Layers and the Layer Stack

**Goals:**
- Reveal a property (e.g., press P for Position) and click the stopwatch icon next to it to enable keyframing — the filled stopwatch means keyframing is active
- Move the playhead to a different time, change the property value, and see a second keyframe appear automatically as a diamond icon in the Timeline
- Press Spacebar to preview the animation between keyframes
- Press U to show all keyframed properties on a selected layer — this reveals every animated property at once
- Select keyframes and apply Easy Ease with F9 — notice the diamond icon changes to an hourglass shape, indicating smooth acceleration/deceleration
- Toggle the Graph Editor with Shift+F3 to see the animation curve; understand that the Y axis is the property value and the X axis is time
- Drag Bezier handles in the Graph Editor to manually refine the easing curve
- Move a keyframe earlier by 1 frame with `Option+Left Arrow`, or 10 frames with `Option+Shift+Left Arrow`
- Use J and K to jump the playhead to the previous and next keyframe

**Completion signals:** keyframe, stopwatch, easy ease, graph editor, bezier handles, easing, u key, diamond, hourglass, playhead, j and k

**Next:** Effects and Effect Controls

### Stage 4: Effects and Effect Controls

Apply effects to layers, adjust them in the Effect Controls panel, and understand how effects stack and process.

**Prerequisites:** Keyframing and Animation

**Goals:**
- Open the Effects & Presets panel on the right side of the interface; use its search field to find effects by name
- Drag an effect (e.g., Gaussian Blur from the Blur & Sharpen category) onto a layer in the Timeline or Composition panel
- Open the Effect Controls panel (Cmd+Shift+T or click the Effect Controls tab that appears tabbed with the Project panel on the upper left) to adjust the effect's parameters
- Understand that effects on a layer process in order top to bottom — reorder them by dragging in the Effect Controls panel
- Apply Levels (Color Correction > Levels) to adjust the brightness and contrast of a layer
- Apply Glow (Stylize > Glow) and adjust Glow Threshold, Glow Radius, and Glow Intensity
- Apply an effect to an Adjustment layer and observe that it affects all layers below it
- Disable a single effect by clicking the fx button (the "f" icon) to the left of its name in the Effect Controls panel, without deleting it
- Browse and apply an Animation Preset from the Effects & Presets panel (Presets folder) for a quick starting point

**Completion signals:** effects and presets panel, effect controls, gaussian blur, glow, levels, adjustment layer effect, fx button, animation preset, blur, color correction

**Next:** Masks and Shape Layers

### Stage 5: Masks and Shape Layers

Control what's visible on a layer with masks, and create standalone vector graphics with shape layers.

**Prerequisites:** Effects and Effect Controls

**Goals:**
- Select a footage or solid layer in the Timeline, then draw a rectangle mask with Q (or the Rectangle tool in the Tools panel) — the mask cuts out the layer, hiding everything outside it
- Understand mask modes: Add (default — shows inside), Subtract (shows outside), and how stacking multiple masks with different modes creates complex cutouts
- Adjust Mask Feather (F key with mask selected) to soften the mask edge; adjust Mask Expansion and Mask Opacity in the Timeline under the Masks property group
- Use the Pen tool (G) to draw a freeform mask path with custom vertices
- Animate the Mask Path property by enabling its stopwatch — draw a shape at frame 0, move to frame 60, reshape the mask, and watch it morph over time
- Deselect all layers in the Timeline (`Cmd+Shift+A`), then draw a rectangle with the Rectangle tool — this creates a standalone Shape Layer, not a mask
- Explore a Shape Layer's contents in the Timeline: twirl open the layer to see the Shape Group, then twirl that to see Path, Fill, Stroke, and Transform properties
- Add a Trim Paths path operation to a shape layer (click Add > Trim Paths inside the shape group in the Timeline) and animate the Start and End values to draw on a stroke over time

**Completion signals:** mask, mask feather, mask path, mask mode, add mask, subtract mask, pen tool, shape layer, fill, stroke, trim paths, draw on, deselect layers

**Next:** Text Animation

### Stage 6: Text Animation

Create animated text using After Effects' per-character Text Animator system.

**Prerequisites:** Masks and Shape Layers

**Goals:**
- Select the Horizontal Type tool (`Cmd+T`) from the Tools panel at the top, click in the Composition panel to create a Point Text layer, and type some text
- Open the Character panel (right side, or Window > Character) to set font family, size, color, tracking, and kerning
- Open the Paragraph panel (right side, or Window > Paragraph) to set alignment (left, center, right)
- In the Timeline, twirl open the text layer to reveal its Text property group; click "Animate" to the right of the Text property to open the Animator menu — add an Opacity animator
- Understand the Animator structure: each Animator has one or more Animator Properties (like Opacity) and a Range Selector that defines which characters are affected
- Animate the Range Selector's Start value from 0% to 100% over time — this creates a typewriter reveal where Opacity applies progressively across characters
- Add a second Animator with a Scale property set to 0%, same Range Selector animation — characters will scale in as they appear
- Try the Wiggly Selector (click Add > Selector > Wiggly under the Animator) as an alternative to Range Selector for random per-character activation
- Animate the Source Text property by enabling its stopwatch — this lets you swap text content over time, useful for countdowns and switching words

**Completion signals:** type tool, point text, character panel, paragraph panel, text animator, animator, range selector, opacity animator, scale animator, wiggly selector, typewriter, source text

**Next:** Rendering and Export

### Stage 7: Rendering and Export

Send your composition to the Render Queue or Adobe Media Encoder to produce a final output file.

**Prerequisites:** Text Animation

**Goals:**
- Add the active composition to the Render Queue with `Cmd+Shift+/` (or Composition > Add to Render Queue) — the Render Queue panel opens at the bottom, tabbed with the Timeline
- In the Render Queue, click the blue "Lossless" link next to Output Module to open Output Module Settings — choose a format (e.g., QuickTime) and codec, or choose to export with alpha channel (RGB+Alpha)
- Click the blue output path link next to Output To, choose a save location and filename
- Click the Render button on the right side of the Render Queue panel to begin rendering
- Understand that Render Queue always renders at the quality defined in Render Settings (default: Best Quality, Full Resolution), regardless of the preview resolution setting
- Add the composition to Adobe Media Encoder with `Cmd+Option+M` (or Composition > Add to Adobe Media Encoder Queue) for H.264 / MP4 output — this allows background encoding while continuing to work in After Effects
- In Adobe Media Encoder, choose the H.264 preset, set a destination path, and click the green Play button to encode
- Understand the difference: Render Queue for lossless / archive masters; Media Encoder for delivery formats (MP4, social media)
- Understand Multi-Frame Rendering (enabled by default since AE 2022): After Effects uses multiple CPU cores simultaneously — no action required, but memory allocation can be tuned in Edit > Preferences > Memory & Performance

**Completion signals:** render queue, output module, render settings, adobe media encoder, h.264, export, lossless, quicktime, render button, output to, multi-frame rendering, background encode

**Next:** null

## UI Vocabulary

### Project Panel
Located in the upper-left corner of the After Effects interface. This is where all imported assets (footage, audio, images, compositions) and new compositions live. You can search assets using the search field at the top of the panel, organize them into folders by clicking the folder icon at the bottom, and create new compositions with the composition icon at the bottom. Double-clicking a composition in the Project panel opens it in both the Composition panel and the Timeline panel.

### Composition Panel
The large center viewer that shows the rendered frame of the active composition at the current playhead time. Navigate within it by zooming with the period key (zoom in) and comma key (zoom out), fitting the comp to the viewer with Shift+/, and panning by holding Spacebar and dragging. The dropdown at the bottom-left sets the preview resolution (Full/Half/Quarter/Custom) — this only affects preview speed, not final render quality. The magnification percentage is shown next to this dropdown.

### Timeline Panel
The main working area at the bottom of the interface. It shows all layers in the active composition as horizontal bars (layer duration bars). The left side shows layer controls (name, switches, modes). The right side shows the time ruler, keyframes, and property curves. The playhead (thin vertical line with a yellow triangle at the top) shows the current time. Drag the playhead or click in the time ruler to navigate. The green bar above the time ruler shows cached RAM preview frames.

### Tools Panel
A horizontal bar of tool icons running across the top of the interface, directly below the application menu bar. Contains: Selection tool (V), Hand tool (H), Zoom tool (Z), Rotation tool (W), Pan Behind / Anchor Point tool (Y), mask/shape tools (Q cycle: Rectangle, Rounded Rectangle, Ellipse, Polygon, Star), Pen tool (G), Type tools (Cmd+T cycle), Brush/Clone/Eraser tools (Cmd+B cycle), and others. The currently active tool is highlighted. Pressing a single-letter shortcut activates that tool; holding it temporarily activates it.

### Effect Controls Panel
Located in the upper-left area of the interface, tabbed together with the Project panel. It appears automatically when a layer with effects is selected. Displays all effects applied to the selected layer in the order they process (top to bottom). Each effect can be expanded to reveal its parameters, disabled with the fx toggle button to its left, or deleted. Drag effects up or down within the panel to reorder processing. Open it manually with Cmd+Shift+T.

### Effects & Presets Panel
Located on the right side of the interface (in the right-side panel column). Contains every installed effect organized in categories (Blur & Sharpen, Color Correction, Distort, Generate, Stylize, etc.) and a Presets folder with pre-built animation presets. Use the search field at the top to find effects by name. Apply an effect by dragging it from this panel onto a layer in the Composition panel or Timeline panel.

### Preview Panel
Located on the right side of the interface. Contains playback controls: Play/Pause, Skip to Start, frame step buttons, Loop mode selector (loop once, loop continuously, ping-pong), skip frames setting, and frame rate limit. The keyboard shortcut Spacebar starts and stops preview. Pressing 0 on the numeric keypad is an alternative. The green bar in the Timeline shows which frames are already cached — After Effects plays cached frames at full speed.

### Layer Duration Bar
The colored horizontal bar in the Timeline panel for each layer. Its left edge is the layer's In point (where it starts in the composition); its right edge is the Out point (where it ends). Drag the bar itself to slide the layer in time. Drag either edge to trim its duration. Press [ to set the In point to the current time; press ] to set the Out point to the current time. Layers below sit behind layers above in the composition.

### Layer Switches
A group of small icon toggles in the left section of each layer row in the Timeline panel. From left to right: eye icon (Video — show/hide layer), speaker icon (Audio — mute/unmute), Solo dot, Lock padlock, Shy icon, Collapse Transformations/Continuously Rasterize star/sun icon, Quality icon, Effect icon (the f with a cross), Frame Blending icon, Motion Blur icon (camera shutter), Adjustment Layer icon, and 3D Layer cube icon. Toggle the Switches/Modes view with F4. Toggle the Parent & Link column with Shift+F4.

### Stopwatch Icon
The small clock icon to the left of each animatable property name in the Timeline panel. Clicking it enables keyframing for that property — the icon turns solid/filled, and a keyframe diamond is placed at the current time. After that, every time you change the property value at a different time, a new keyframe is created automatically. Clicking a filled stopwatch again disables keyframing and deletes all keyframes for that property — a warning dialog appears first.

### Graph Editor
An alternative view of the Timeline's right side, toggled with Shift+F3. Instead of showing layer duration bars, it shows selected properties as 2D curves (time on X axis, value or speed on Y axis). Two modes: Value Graph (actual property values over time) and Speed Graph (rate of change, useful for position). Bezier handles on keyframes control easing — longer handles create slower change near that keyframe. Access the Graph Editor toolbar at the top of the Graph Editor area to switch modes, pin properties, and show reference curves.

### Transform Properties
Five core properties every layer has, found by twirling open the layer's Transform group in the Timeline. Reveal each individually: press P for Position (X/Y coordinates in the composition), S for Scale (percentage, constrained proportionally by default), R for Rotation (degrees), T for Opacity (0 to 100 percent), A for Anchor Point (the pivot point for scale and rotation, shown as a crosshair in the Composition panel). Press U to show all currently keyframed properties on a selected layer.

### Pan Behind Tool (Anchor Point Tool)
Activated by pressing Y. Shown as a pan/anchor icon in the Tools panel at the top. Used to reposition a layer's Anchor Point without moving the layer itself. Click and drag the Anchor Point crosshair in the Composition panel to a new position — the layer stays in place but its rotation and scale pivot moves. This is the primary way to fix off-center rotations. Alternative: right-click the layer > Transform > Center Anchor Point in Layer Content.

### Mask
A vector path applied to an existing layer that defines the visible region. Masks are found under the layer's Masks property group in the Timeline. Draw a mask by selecting a layer and then using a shape tool (Q cycle) or the Pen tool (G). Mask modes: Add (default — shows inside the path), Subtract (shows outside), Intersect (shows overlap of two Add masks), and others. Each mask has Mask Path (the shape), Mask Feather (edge softness), Mask Opacity, and Mask Expansion properties. All are keyframeable.

### Shape Layer
A standalone vector layer, created by drawing with a shape tool (Q cycle) or Pen tool (G) when no layer is selected in the Timeline. Shape layers are found in the Timeline with their contents inside the Contents group. Each shape group contains a Path, Fill, Stroke, and its own Transform. Multiple shape groups can exist in one Shape Layer. Shape layers support Path Operations — modifiers like Trim Paths (draws on strokes over time), Repeater (clones and distributes shapes), and Round Corners.

### Render Queue Panel
Located at the bottom of the interface, tabbed with the Timeline panel. Access it via Composition > Add to Render Queue (Cmd+Shift+/) or the Window menu. Each entry in the queue shows: the composition name, Render Settings (click the blue link to set quality and resolution), Output Module (click the blue "Lossless" link to set format and codec), and Output To (click to set the save path). Click the Render button on the right to start rendering all queued items in sequence.

### Adobe Media Encoder Queue
A separate application (Adobe Media Encoder) that can receive compositions from After Effects via Composition > Add to Adobe Media Encoder Queue (Cmd+Option+M). Supports background encoding — you can continue working in After Effects while Media Encoder renders in the background. Used for delivery formats like H.264 (MP4), H.265/HEVC, and ProRes. Select a preset in Media Encoder, set a destination, and click the green Play button to start encoding.

### Pre-composition (Precomp)
A composition used as a single layer inside another composition. Created by selecting one or more layers in the Timeline and pressing Cmd+Shift+C (Layer > Pre-compose). The dialog offers two options: "Leave All Attributes in [comp name]" (keeps transforms/effects in the parent comp, moves only the layer source into the new comp — only available for a single layer) and "Move All Attributes into the New Composition" (moves everything into the precomp, the layer in the parent resets). Precomps are useful for grouping layers, applying a single effect to multiple layers, and simplifying complex timelines.

### Track Matte
A way to use one layer's transparency or luminance to define the transparency of the layer directly below it in the Timeline. Set in the TrkMat column — press F4 to show the Modes columns. The matte layer must be directly above the target layer. Options: Alpha Matte (matte's alpha defines transparency — white is opaque, black is transparent), Alpha Inverted Matte, Luma Matte (matte's brightness defines transparency — bright is opaque, dark transparent), and Luma Inverted Matte. The matte layer's eye icon turns off automatically when assigned.

### Character Panel
Located on the right side of the interface. Controls text layer typography: font family, font style (Regular/Bold/Italic), font size, leading (line spacing), kerning, tracking, baseline shift, vertical/horizontal scale, fill color, and stroke color and width. Open via Window > Character or by selecting a text layer and switching to a workspace that includes it. All properties affect the selected characters or the entire text layer if nothing is selected with the Type tool.
