# Composite HDPE Roller Viewer

Browser based Three.js viewer for the roller assembly in `Roller.STEP`. The site uses triangulated component geometry imported from the supplied CAD assembly. The STEP file's component positions already define an orderly one end exploded arrangement; the viewer preserves those positions and provides a slider to interpolate back to the assembled state.

## What is included

- STEP derived geometry grouped into 12 selectable component instances: shell, shaft, two SKF 6205 bearings, two seals, two housings, two SnapRing S25 rings, and two end shields.
- Orbit, zoom, pan, component selection, visibility toggles, wireframe, and animated exploded assembly slider.
- TechnoRoll CCR and Supra logos in the header, with selectable shell grades that recolor the STEP derived shell tube: HDPE Std (green), Eco HDPE (gray), FR HDPE (brown), Fras HDPE (red), and UHMW Tube (blue).
- CAD sourced dimensions and per-instance mesh envelopes. The original STEP file and any manufacturing tolerances are not included in this public repository.
- Source converter at `scripts/convert-step.cjs`; generated web model at `public/models/roller-assembly.glb`.

The displayed colors follow the reference visualization. Material names are identified from the STEP assembly where available; this viewer is a visualization tool, not a tolerance qualified manufacturing drawing.

## Requirements

- Windows 10 or 11
- Node.js 20.19+ or 22.12+
- npm or pnpm
- A modern browser with WebGL enabled

## Run on Windows

1. Extract the project folder and open PowerShell in `conveyor-engineering-viewer`.
2. Install dependencies: `npm install` (or `pnpm install`).
3. Start the viewer: `npm run dev` (or `pnpm dev`).
4. Open the local URL printed by Vite, usually `http://localhost:5173`.

Create and preview a production build with `npm run build` and `npm run preview`.

## Regenerate the model from STEP

The public site does not include the original STEP source. To regenerate the GLB locally, install the development dependencies and run:

```powershell
npm run convert:model -- "E:\path\to\Roller.STEP"
```

The script writes `public/models/roller-assembly.glb`. It reads component geometry and occurrence positions from the STEP file and keeps the original source file on your computer. Mesh tessellation settings and part color mapping are in `scripts/convert-step.cjs`.

## Viewer controls

- Left drag: orbit.
- Scroll: zoom.
- Right drag: pan.
- Click a model part or component row: inspect source component and mesh envelope.
- **SHELL TYPE** dropdown: change the shell tube color and displayed material grade.
- Eye icon: hide or show every occurrence of a component type.
- Explode slider or **EXPLODE**: move between assembled and STEP exploded positions.
- **ASSEMBLE**: return all components to their assembled locations.
- **WIREFRAME**: show tessellated mesh edges.
- **RESET VIEW**: restore the default exploded view and camera.

## GitHub Pages

The repository deploys from GitHub Actions. Push changes to `main`; the `Deploy to GitHub Pages` workflow builds the Vite site and publishes its `dist` folder. The deployed viewer uses the repository subpath `/conveyor-engineering-viewer/`.

## Minimal manual test checklist

- [ ] `npm install` and `npm run dev` work on Windows.
- [ ] The actual STEP derived roller model loads with the shell, shaft, bearing, seals, housing, snap rings, and end shields.
- [ ] Orbit, zoom, and pan respond.
- [ ] Clicking geometry and component list rows shows the component properties and envelope.
- [ ] Visibility toggles affect all matching instances.
- [ ] The slider smoothly transitions between the compact assembly and original STEP exploded layout.
- [ ] Assemble, reset view, and wireframe controls work.
- [ ] `npm run build` completes successfully.

