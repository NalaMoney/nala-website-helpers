# Globe Animation Performance Fix — Implementation Plan

## Problem

When landing on nala.money, the globe animation stutters on initial load, then fast-forwards to catch up. This is caused by main thread contention from heavy JS parsing and redundant downloads.

## Root Causes

1. **Duplicate Three.js** — `globe-visualizer.js` imports Three.js separately (`//unpkg.com/three/build/three.module.js`, ~624 KB), but `globe.gl` already bundles its own copy inside its UMD closure. Console warns: `Multiple instances of Three.js being imported.`
2. **Unpinned unpkg URLs** — `//unpkg.com/globe.gl` and `//unpkg.com/topojson-client` trigger 302 redirect chains, adding ~800ms before downloads start.
3. **Land data fetched after globe init** — `world-atlas/land-110m.json` is fetched inside `loadLandData()`, causing a two-phase render (empty globe → populated globe).
4. **Unbounded rAF loop in TwinklingStars** — runs every frame with no visibility check, competing with globe's WebGL render loop.
5. **Bug: `this.particleCanvas` is undefined** — `createWorld()` line 154 references `this.particleCanvas` which is never defined. Dead code from a previous particle effects version.
6. **Duplicate jQuery on the page** — loaded from cdnjs AND by Webflow (not in this repo, but noted for the Webflow fix).

---

## Changes to This Repo (`NalaMoney/nala-website-helpers`)

### 1. Remove dead `particleCanvas` line

**File:** `globe-visualizer.js`, line 154

Delete:
```js
this.texture = new THREE.CanvasTexture(this.particleCanvas);
```
Dead code — `this.particleCanvas` is never defined, and `this.texture` is never read.

### 2. Remove the duplicate Three.js import

**File:** `globe-visualizer.js`

**Investigation result:** globe.gl@2.45.0 does NOT expose Three.js externally. In UMD mode, THREE is fully private inside the IIFE closure. It does not set `window.THREE` or re-export it.

After removing the dead `CanvasTexture` line, THREE is only used in **2 places**:
- Line 179: `this.world.globeMaterial().emissive = new THREE.Color('#023C8B')`
- Line 187: `new THREE.MeshLambertMaterial({ color: '#0662B9', side: THREE.DoubleSide })`

**Fix — eliminate the THREE import entirely by using workarounds:**

**Line 179** — `.emissive` is a `THREE.Color` instance which has a `.set()` method that accepts hex strings:
```js
// Before
this.world.globeMaterial().emissive = new THREE.Color('#023C8B');
// After
this.world.globeMaterial().emissive.set('#023C8B');
```

**Line 187** — We need `MeshLambertMaterial` and `DoubleSide`. We can extract the THREE namespace from an existing Three.js object that globe.gl created (the globe material's constructor lives in the THREE module):
```js
// Get THREE from globe.gl's internal instance via an existing object
const THREE = Object.getPrototypeOf(this.world.scene()).constructor;
// THREE.Color, THREE.MeshLambertMaterial etc are on this module's scope
```

Actually, the simplest reliable approach — access the constructors from existing instances:
```js
// Get MeshLambertMaterial constructor from Three.js's module registry
// globe.gl's scene is a THREE.Scene — we can traverse to get the module
const globeMaterial = this.world.globeMaterial(); // MeshPhongMaterial instance
const THREE_module = globeMaterial.constructor; // gives us the constructor

// But we need MeshLambertMaterial specifically...
```

**Recommended approach: use a `<script type="importmap">` in Webflow to share one Three.js instance.**

Add to Webflow head code (before any scripts):
```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.181.0/build/three.module.js",
    "three/": "https://unpkg.com/three@0.181.0/"
  }
}
</script>
```

Then in `globe-visualizer.js`, change the import to use a bare specifier:
```js
// Before
import * as THREE from '//unpkg.com/three/build/three.module.js';
// After
import { Color, MeshLambertMaterial, DoubleSide } from 'three';
```

And switch globe.gl from UMD (`<script>` tag) to ESM. The ESM build (`globe.gl.mjs`, only 29 KB) imports `from 'three'` as a peer dependency, so it will share the same Three.js instance via the import map.

In Webflow, replace:
```html
<script src="//unpkg.com/topojson-client"></script>
<script src="//unpkg.com/globe.gl"></script>
```

With the import map (above) and move globe.gl into the ES module import:
```js
import Globe from 'https://unpkg.com/globe.gl@2.45.0/dist/globe.gl.mjs';
```

**However**, globe.gl's ESM build imports `from 'three'` (bare specifier) and `from 'three/examples/jsm/...'` — both will resolve via the import map. But `topojson-client` is still needed as a global. Keep it as a `<script>` tag (pinned).

**Result:** One shared Three.js instance (~624 KB saved), no duplicate warning, no redirect chains.

> **Fallback if import maps cause issues:** Keep the separate Three.js import but pin it to `three@0.181.0` (matching globe.gl's bundled version). This still loads Two copies but eliminates the redirect and version mismatch. The duplicate warning remains but is cosmetic.

### 3. Pin the world-atlas URL

**File:** `globe-visualizer.js`, line 183

```js
// Before
fetch('//unpkg.com/world-atlas/land-110m.json')
// After
fetch('//unpkg.com/world-atlas@2.0.2/land-110m.json')
```

### 4. Add visibility-based pause to TwinklingStars

**File:** `twinkling-stars.js`

Add an `IntersectionObserver` so the rAF loop only runs when the stars canvas is visible:

```js
constructor(divId, ...) {
    // ... existing setup ...
    this.isVisible = true;
    this.observeVisibility();
}

observeVisibility() {
    const observer = new IntersectionObserver(([entry]) => {
        this.isVisible = entry.isIntersecting;
        if (this.isVisible) this.animate();
    });
    observer.observe(this.container);
}

animate() {
    if (!this.isVisible) return; // stop loop when off-screen
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawStars();
    this.updateStars();
    requestAnimationFrame(() => this.animate());
}
```

### 5. Tag a new release

After all changes, tag `v2.1.0` so the jsdelivr URL can be updated in Webflow.

```bash
git tag v2.1.0
git push origin v2.1.0
```

---

## Changes to Webflow (Homepage Custom Code)

### 6. Add import map for shared Three.js (in Site Settings → Head Code)

Add **before** any other scripts:
```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.181.0/build/three.module.js",
    "three/": "https://unpkg.com/three@0.181.0/"
  }
}
</script>
```

### 7. Replace globe script tags

Change:
```html
<script src="//unpkg.com/topojson-client"></script>
<script src="//unpkg.com/globe.gl"></script>
```
To:
```html
<script src="//unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js"></script>
```
(globe.gl is now imported as ESM inside the module script — see step 9)

### 8. Add prefetch for land data

Add to head code:
```html
<link rel="prefetch" href="https://unpkg.com/world-atlas@2.0.2/land-110m.json">
```

### 9. Remove duplicate jQuery

Remove:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"> </script>
```
Webflow's built-in jQuery 3.5.1 is sufficient for intl-tel-input and the GSAP/flip-card scripts.

### 10. Update the globe module script

Change:
```html
<script type="module">
import { GlobeVisualizer, TwinklingStars } from 'https://cdn.jsdelivr.net/gh/codeandwander/nala-helpers@v2.0.15/index.js';

document.addEventListener('DOMContentLoaded', () => {
  const globeVisualizer = new GlobeVisualizer('globeViz');
  const twinklingStars = new TwinklingStars('starDiv', 500, 1.5, 1000, 0.05);
});
</script>
```
To:
```html
<script type="module">
import { GlobeVisualizer, TwinklingStars } from 'https://cdn.jsdelivr.net/gh/NalaMoney/nala-website-helpers@v2.1.0/index.js';

document.addEventListener('DOMContentLoaded', () => {
  const globeVisualizer = new GlobeVisualizer('globeViz');
  const twinklingStars = new TwinklingStars('starDiv', 500, 1.5, 1000, 0.05);
});
</script>
```

---

## Implementation Order

| # | Step | Where | Impact | Risk |
|---|------|-------|--------|------|
| 1 | Remove dead `particleCanvas` line | Repo | Eliminates silent error | Low |
| 2 | Remove THREE import, use import map approach | Repo + Webflow | Saves ~624 KB, fixes console warning | Medium |
| 3 | Pin world-atlas URL | Repo | Eliminates redirect latency | Low |
| 4 | Add visibility pause to TwinklingStars | Repo | Reduces rAF contention when off-screen | Low |
| 5 | Pin topojson-client URL in Webflow | Webflow | Eliminates redirect | Low |
| 6 | Add import map to Webflow | Webflow | Enables shared Three.js | Medium |
| 7 | Add prefetch for land data | Webflow | Preloads geo data | Low |
| 8 | Remove duplicate jQuery | Webflow | Saves ~28 KB | Low — test intl-tel-input |
| 9 | Tag release + update jsdelivr URL | Repo + Webflow | Points to fixed code | Low |

**Expected total improvement:** ~1.4 seconds faster load (800ms redirect elimination + 624 KB less JS to parse) plus smoother animation from reduced main thread contention.

---

## Resolved Questions

1. **How does globe.gl expose Three.js?** — It does NOT. UMD build keeps THREE fully private in the closure. ESM build (`globe.gl.mjs`, 29 KB) imports `from 'three'` as a peer dependency. Solution: use ESM build + import map to share one Three.js instance.
2. **GitHub org/repo name** — `NalaMoney/nala-website-helpers` (confirmed via git remote).
3. **Is `this.particleCanvas` / `this.texture` used downstream?** — No. Dead code from a previous version with particle effects. Safe to delete.
