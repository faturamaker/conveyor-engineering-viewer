import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const defaults = { length: 420, diameter: 89, shaft: 20 };
const params = { ...defaults };
const mm = (value) => value / 10; // Display parameters in mm; scene scale is 1 unit = 10 mm.
const colors = { shell: '#20d447', shaft: '#bac5c1', bearing: '#b9c3c0', seal: '#f12c2d', housing: '#252a28', shield: '#101412' };
const parts = [
  { id: 'shell', name: 'Shell', sub: 'ROLLER TUBE · GREEN', label: 'Shell', material: 'Powder coated steel', position: 'Center', color: colors.shell, dims: () => `Ø ${params.diameter} × ${params.length} mm`, mass: '3.82 kg' },
  { id: 'shaft', name: 'Shaft', sub: 'SOLID STEEL · CENTER', label: 'Shaft', material: 'Carbon steel', position: 'Through axis', color: colors.shaft, dims: () => `Ø ${params.shaft} × ${params.length + 74} mm`, mass: '1.14 kg' },
  { id: 'bearing', name: 'Bearings', sub: 'DEEP GROOVE · PAIR', label: 'Bearing pair', material: 'Chrome steel', position: 'Both ends', color: colors.bearing, dims: () => `6204 · Ø ${params.shaft} mm bore`, mass: '0.46 kg' },
  { id: 'seal', name: 'Sealing', sub: 'LABYRINTH SEAL · RED', label: 'Sealing', material: 'NBR elastomer + steel', position: 'Both ends', color: colors.seal, dims: () => `Ø ${params.diameter - 6} mm`, mass: '0.08 kg' },
  { id: 'housing', name: 'Housing', sub: 'BEARING CARRIER · BLACK', label: 'Housing', material: 'Glass reinforced polymer', position: 'Both ends', color: colors.housing, dims: () => `Ø ${params.diameter - 8} mm seat`, mass: '0.31 kg' },
  { id: 'shield', name: 'Extended shield', sub: 'OUTER END CAP · BLACK', label: 'Extended shield', material: 'Impact resistant polymer', position: 'Outer ends', color: colors.shield, dims: () => `Ø ${params.diameter + 1} mm`, mass: '0.22 kg' },
];
const componentList = document.querySelector('#component-list');
const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a211f');
scene.fog = new THREE.Fog('#1a211f', 100, 300);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
camera.position.set(61, 46, 66);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.target.set(0, 0, 0);
controls.minDistance = 23;
controls.maxDistance = 180;
controls.maxPolarAngle = Math.PI * .88;
scene.add(new THREE.HemisphereLight('#d9ebdd', '#232c28', 2.15));
const keyLight = new THREE.DirectionalLight('#fff6e8', 3.1); keyLight.position.set(24, 38, 24); keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#a4c8ff', 1.4); fillLight.position.set(-26, 12, -18); scene.add(fillLight);
const rimLight = new THREE.DirectionalLight('#a4ff83', 1.45); rimLight.position.set(-5, 8, 34); scene.add(rimLight);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#19201d', roughness: .88 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -11; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(240, 40, '#39453e', '#29332e'); grid.position.y = -10.96; grid.material.transparent = true; grid.material.opacity = .45; scene.add(grid);
const assembly = new THREE.Group(); scene.add(assembly);
const partsMap = new Map();
let selectedId = null, exploded = 0, sectionOn = false, wireOn = false, toastTimer;
const mat = (color, roughness = .35, metalness = .15) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const materials = {
  shell: mat(colors.shell, .28, .28), shaft: mat(colors.shaft, .24, .82), bearing: mat(colors.bearing, .2, .8), seal: mat(colors.seal, .35, .12),
  housing: mat(colors.housing, .5, .15), shield: mat(colors.shield, .44, .16), chrome: mat('#d9e0de', .16, .94), dark: mat('#111614', .7, .1), ball: mat('#e3e9e6', .13, .92),
};
function addPartMesh(id, geometry, material, parent, name = id) {
  const mesh = geometry instanceof THREE.Mesh ? geometry : new THREE.Mesh(geometry, material); mesh.material = material; mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.partId = id; parent.add(mesh); return mesh;
}
function cyl(radiusTop, radiusBottom, length, material, axis = 'x', radial = 48, h = 1) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radial, h), material);
  mesh.rotation.z = axis === 'x' ? Math.PI / 2 : 0; return mesh;
}
function torus(major, tube, material, axis = 'x', radial = 48) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 12, radial), material);
  if (axis === 'x') mesh.rotation.y = Math.PI / 2; return mesh;
}
function buildAssembly() {
  while (assembly.children.length) { const child = assembly.children[0]; assembly.remove(child); }
  partsMap.clear();
  const R = mm(params.diameter) / 2, L = mm(params.length), shaftR = mm(params.shaft) / 2;
  // Groups sit at their assembled axial centers; exploded motion moves components along the roller axis.
  const group = (id, x = 0) => { const g = new THREE.Group(); g.name = id; g.position.x = x; g.userData.partId = id; assembly.add(g); partsMap.set(id, g); return g; };
  const shell = group('shell');
  // Cutaway is a longitudinal sector: the shell wall remains visible over most of its circumference.
  const shellGeo = new THREE.CylinderGeometry(R, R, L, 96, 1, true, sectionOn ? Math.PI * .20 : 0, sectionOn ? Math.PI * 1.60 : Math.PI * 2);
  shellGeo.rotateZ(Math.PI / 2);
  addPartMesh('shell', shellGeo, materials.shell, shell, 'Shell tube');
  const rimMat = mat('#168b31', .28, .25);
  for (const side of [-1, 1]) {
    const rim = torus(R - .32, .32, rimMat); rim.position.x = side * L / 2; addPartMesh('shell', rim.geometry, rim.material, shell, 'Shell end rim').position.copy(rim.position);
  }
  // Internal tie/reinforcement liner: subtly visible in the cutaway sector only.
  const liner = new THREE.Mesh(new THREE.CylinderGeometry(R - 1.2, R - 1.2, L * .55, 64, 1, true, Math.PI * .20, Math.PI * 1.6), mat('#159b32', .55, .12));
  liner.rotation.z = Math.PI / 2; liner.userData.partId = 'shell'; shell.add(liner);

  const shaft = group('shaft');
  const shaftLength = L + mm(74);
  addPartMesh('shaft', cyl(shaftR, shaftR, shaftLength, materials.shaft), shaft, shaft, 'Axle shaft');
  // Small polished shaft ends and retaining grooves.
  for (const side of [-1, 1]) {
    const x = side * shaftLength / 2;
    const tip = cyl(shaftR * .94, shaftR * .94, mm(5), materials.chrome); tip.position.x = side * mm(2); addPartMesh('shaft', tip.geometry, tip.material, shaft, 'Shaft end').position.copy(tip.position);
    for (const offset of [4, 7]) { const ring = torus(shaftR, .12, materials.dark); ring.position.x = side * (x - mm(offset)); const m = addPartMesh('shaft', ring.geometry, ring.material, shaft, 'Retaining groove'); m.position.copy(ring.position); }
  }
  const bearingX = L / 2 - mm(13);
  const bearing = group('bearing');
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.x = side * bearingX; bearing.add(g);
    const outer = cyl(R * .64, R * .64, mm(13), materials.bearing); addPartMesh('bearing', outer.geometry, outer.material, g, 'Bearing outer race');
    const inner = cyl(shaftR + .58, shaftR + .58, mm(13), materials.chrome); addPartMesh('bearing', inner.geometry, inner.material, g, 'Bearing inner race');
    const mid = cyl(R * .48, R * .48, mm(5), materials.dark); addPartMesh('bearing', mid.geometry, mid.material, g, 'Bearing cage');
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.49, 12, 8), materials.ball); ball.position.set(0, Math.cos(a) * (R * .48), Math.sin(a) * (R * .48)); ball.userData.partId = 'bearing'; ball.castShadow = true; g.add(ball);
    }
    for (const x of [-mm(5.2), mm(5.2)]) { const ring = torus(R * .61, .14, materials.chrome); ring.position.x = x; addPartMesh('bearing', ring.geometry, ring.material, g, 'Race edge').position.copy(ring.position); }
  }
  const seal = group('seal');
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.x = side * (L / 2 - mm(7)); seal.add(g);
    const body = cyl(R * .74, R * .74, mm(7), materials.seal); addPartMesh('seal', body.geometry, body.material, g, 'Red sealing body');
    const lip = torus(R * .5, .28, materials.seal); addPartMesh('seal', lip.geometry, lip.material, g, 'Seal lip');
    const innerLip = torus(shaftR + .42, .2, materials.dark); addPartMesh('seal', innerLip.geometry, innerLip.material, g, 'Inner seal lip');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const lug = new THREE.Mesh(new THREE.BoxGeometry(.62, .28, .36), materials.seal); lug.position.set(0, Math.cos(a) * R * .7, Math.sin(a) * R * .7); lug.rotation.x = a; lug.userData.partId = 'seal'; g.add(lug); }
  }
  const housing = group('housing');
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.x = side * (L / 2 + mm(1)); housing.add(g);
    const flange = cyl(R * .91, R * .91, mm(6), materials.housing); addPartMesh('housing', flange.geometry, flange.material, g, 'Bearing housing flange');
    const boss = cyl(R * .62, R * .62, mm(12), materials.housing); boss.position.x = -side * mm(6); addPartMesh('housing', boss.geometry, boss.material, g, 'Bearing housing seat').position.copy(boss.position);
    const boreRing = torus(R * .58, .24, materials.dark); boreRing.position.x = -side * mm(12); addPartMesh('housing', boreRing.geometry, boreRing.material, g, 'Housing inner lip').position.copy(boreRing.position);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const lug = new THREE.Mesh(new THREE.BoxGeometry(mm(8), .75, 1.1), materials.housing); lug.position.set(0, Math.cos(a) * R * .77, Math.sin(a) * R * .77); lug.rotation.x = a; lug.userData.partId = 'housing'; g.add(lug); }
  }
  const shield = group('shield');
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.x = side * (L / 2 + mm(10)); shield.add(g);
    const plate = cyl(R * 1.01, R * 1.01, mm(5), materials.shield); addPartMesh('shield', plate.geometry, plate.material, g, 'Extended shield plate');
    const lip = cyl(R * 1.01, R * 1.01, mm(12), materials.shield); lip.position.x = side * mm(8); addPartMesh('shield', lip.geometry, lip.material, g, 'Extended outer skirt').position.copy(lip.position);
    const edge = torus(R * .98, .2, materials.dark); edge.position.x = side * mm(14); addPartMesh('shield', edge.geometry, edge.material, g, 'Shield outer bead').position.copy(edge.position);
    const innerPlate = cyl(R * .67, R * .67, mm(2), materials.housing); innerPlate.position.x = -side * mm(3.2); addPartMesh('housing', innerPlate.geometry, innerPlate.material, g, 'Housing end face').position.copy(innerPlate.position);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.BoxGeometry(mm(1.7), .45, .7), materials.dark); tooth.position.set(-side * mm(2.8), Math.cos(a) * R * .97, Math.sin(a) * R * .97); tooth.rotation.x = a; tooth.userData.partId = 'shield'; g.add(tooth); }
  }
  applyExplode();
}
function applyExplode() {
  const amount = exploded / 100;
  const travel = mm(params.length) * .38 * amount;
  const offsets = { shell: 0, shaft: 0, bearing: 1, seal: 1.45, housing: 2.15, shield: 2.85 };
  for (const [id, g] of partsMap) {
    if (id === 'bearing' || id === 'seal' || id === 'housing' || id === 'shield') {
      // Push each end's subassembly outward while preserving its left/right side.
      for (const child of g.children) { const side = Math.sign(child.position.x) || 1; const base = id === 'bearing' ? mm(params.length / 2 - 13) : id === 'seal' ? mm(params.length / 2 - 7) : id === 'housing' ? mm(params.length / 2 + 1) : mm(params.length / 2 + 10); child.position.x = side * (base + travel * offsets[id]); }
    }
  }
}
function renderPartList() {
  const glyphs = { shell: '▱', shaft: '━', bearing: '◎', seal: '◉', housing: '▣', shield: '◧' };
  componentList.innerHTML = parts.map(p => `<div class="component-row${selectedId === p.id ? ' active' : ''}" data-id="${p.id}"><span class="part-icon" style="--part-color:${p.color}"><svg viewBox="0 0 20 20"><text x="2" y="15" fill="currentColor" stroke="none" font-size="14">${glyphs[p.id]}</text></svg></span><span><span class="part-name">${p.name}</span><span class="part-sub">${p.sub}</span></span><button class="eye-button" data-eye="${p.id}" title="Toggle visibility">◉</button></div>`).join('');
  componentList.querySelectorAll('.component-row').forEach(row => row.addEventListener('click', e => { if (!e.target.closest('.eye-button')) selectPart(row.dataset.id); }));
  componentList.querySelectorAll('.eye-button').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); const g = partsMap.get(btn.dataset.eye); if (!g) return; g.visible = !g.visible; btn.classList.toggle('hidden', !g.visible); }));
}
function selectPart(id) {
  selectedId = id;
  const part = parts.find(p => p.id === id);
  document.querySelector('#properties-content').innerHTML = `<div class="property-header"><i class="property-color" style="background:${part.color}"></i><span><strong>${part.label}</strong><small>${part.sub}</small></span></div><div class="property-table"><span>Material</span><b>${part.material}</b><span>Position</span><b>${part.position}</b><span>Envelope</span><b>${part.dims()}</b><span>Est. mass</span><b>${part.mass}</b></div>`;
  document.querySelector('#status-selection').textContent = `SELECTED · ${part.name.toUpperCase()}`;
  const toast = document.querySelector('#selection-toast'); toast.textContent = `${part.name.toUpperCase()}  /  ${part.dims()}`; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2300);
  renderPartList();
}
function applyWireframe() { for (const m of Object.values(materials)) m.wireframe = wireOn; document.querySelector('#wire-button').classList.toggle('selected', wireOn); }
function onResize() { const w = viewport.clientWidth, h = viewport.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let downPos;
renderer.domElement.addEventListener('pointerdown', e => { downPos = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => { if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) return; const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(assembly.children, true).find(h => h.object.visible && h.object.userData.partId); if (hit) selectPart(hit.object.userData.partId); });
document.querySelector('#explode-range').addEventListener('input', e => { exploded = Number(e.target.value); document.querySelector('#explode-value').textContent = `${exploded}%`; document.querySelector('#explode-button').classList.toggle('selected', exploded > 0); document.querySelector('#view-mode').textContent = exploded ? 'EXPLODED VIEW' : sectionOn ? 'SECTION VIEW' : 'ASSEMBLY VIEW'; applyExplode(); });
document.querySelector('#explode-button').addEventListener('click', () => { exploded = exploded ? 0 : 100; document.querySelector('#explode-range').value = exploded; document.querySelector('#explode-range').dispatchEvent(new Event('input')); });
document.querySelector('#reset-view').addEventListener('click', () => { camera.position.set(61, 46, 66); controls.target.set(0, 0, 0); controls.update(); exploded = 0; document.querySelector('#explode-range').value = 0; document.querySelector('#explode-range').dispatchEvent(new Event('input')); selectedId = null; document.querySelector('#properties-content').innerHTML = '<div class="empty-selection"><span class="crosshair">⌖</span><span>Pilih komponen untuk melihat<br>detail dan dimensinya.</span></div>'; document.querySelector('#status-selection').textContent = 'NO PART SELECTED'; renderPartList(); });
document.querySelector('#section-button').addEventListener('click', e => { sectionOn = !sectionOn; e.currentTarget.classList.toggle('selected', sectionOn); document.querySelector('#view-mode').textContent = sectionOn ? 'SECTION VIEW' : exploded ? 'EXPLODED VIEW' : 'ASSEMBLY VIEW'; buildAssembly(); });
document.querySelector('#wire-button').addEventListener('click', () => { wireOn = !wireOn; applyWireframe(); });
document.querySelector('#view-cube').addEventListener('click', () => document.querySelector('#reset-view').click());
document.querySelector('#apply-dimensions').addEventListener('click', () => {
  const next = { length: Number(document.querySelector('#length-input').value), diameter: Number(document.querySelector('#diameter-input').value), shaft: Number(document.querySelector('#shaft-input').value) };
  if (next.length < 180 || next.length > 900 || next.diameter < 50 || next.diameter > 180 || next.shaft < 12 || next.shaft > 30) { alert('Dimensi di luar batas yang diizinkan. Periksa nilai input.'); return; }
  Object.assign(params, next); buildAssembly(); renderPartList(); if (selectedId) selectPart(selectedId); document.querySelector('#scale-readout').textContent = `L ${params.length} MM`;
});
document.querySelector('#reset-parameters').addEventListener('click', () => { Object.assign(params, defaults); document.querySelector('#length-input').value = defaults.length; document.querySelector('#diameter-input').value = defaults.diameter; document.querySelector('#shaft-input').value = defaults.shaft; document.querySelector('#apply-dimensions').click(); });
const modal = document.querySelector('#help-modal');
document.querySelector('#help-button').addEventListener('click', () => modal.classList.add('open'));
document.querySelector('#close-help').addEventListener('click', () => modal.classList.remove('open'));
document.querySelector('#got-it').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
renderPartList(); buildAssembly(); onResize(); window.addEventListener('resize', onResize);
const observer = new ResizeObserver(onResize); observer.observe(viewport);
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();
setTimeout(() => document.querySelector('#loading').classList.add('done'), 600);
