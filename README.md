# Conveyor Engineering Viewer

A runnable, parametric Three.js viewer for a conveyor roller end assembly. The model is generated from editable dimensions and is organized into six selectable components: shell, shaft, bearing pair, sealing, housing, and extended shields. The green shell includes a longitudinal cutaway so the internal red seals and bearing hardware can be inspected, following the provided reference image.

## Requirements

- Windows 10 or 11
- Node.js 20.19+ or 22.12+ (required by Vite 7)
- A modern browser with WebGL enabled

## Run on Windows

1. Extract the project folder and open PowerShell in `conveyor-engineering-viewer`.
2. Install packages: `npm install`
3. Start the development server: `npm run dev`
4. Open the local URL printed by Vite, usually `http://localhost:5173`.

For a production build, run `npm run build`. To serve that build locally, use `npm run preview`.

## Publish with GitHub Pages

The repository is prepared for GitHub Actions deployment. Create a new public GitHub repository named `conveyor-engineering-viewer`, upload the project source (including the `.github/workflows/deploy-pages.yml` file), and push it to the `main` branch. In the repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**. The included workflow builds the site and publishes it automatically. After the workflow finishes, GitHub Pages will show the public URL in the deployment environment; it will usually be `https://<your-github-username>.github.io/conveyor-engineering-viewer/`.

The GitHub Pages build uses a repository subpath. For Netlify Drop instead, use a root-path build (`vite build --base=/`) because the prebuilt GitHub Pages assets use `/conveyor-engineering-viewer/` URLs.

## Viewer controls

- Drag with the left mouse button to orbit.
- Scroll to zoom.
- Drag with the right mouse button to pan.
- Click a component in the viewport or parts list to select it and view its properties.
- Use the eye icon by a part to hide or show it.
- Use **EXPLODE** or the slider to separate end components along the roller axis.
- Use **SECTION** to change the shell cutaway opening, and **WIREFRAME** to inspect mesh structure.
- Edit length, shell diameter, and shaft diameter in **DIMENSIONS**, then press **APPLY DIMENSIONS**.
- **RESET VIEW** restores the default camera and assembled state.

## Editable parameter ranges

All dimensions are millimeters. Defaults are 420 mm shell length, 89 mm shell outside diameter, and 20 mm shaft diameter. UI limits are 180–900 mm, 50–180 mm, and 12–30 mm respectively. Dimensions are demonstrator values inferred from the image, not manufacturing drawings or a tolerance-qualified design. Bearing race/ball geometry, seal profile, housing form, and shield details are illustrative.

Main geometry and parameters live in `src/main.js`; layout and styling live in `src/style.css`.

## Minimal manual test checklist

- [ ] `npm install` completes and `npm run dev` serves the viewer.
- [ ] The assembly appears with a green cutaway shell, central shaft, red seals, bearings, black housing, and outer black shields.
- [ ] Orbit, zoom, and pan respond to mouse input.
- [ ] Clicking each part or its list row highlights it and displays its properties.
- [ ] Eye icons hide and restore individual groups.
- [ ] Explode slider separates components and returns smoothly at 0%.
- [ ] SECTION and WIREFRAME toggle their display modes.
- [ ] Applying new dimensions rebuilds the model; reset parameters restores defaults.
- [ ] `npm run build` completes successfully.
