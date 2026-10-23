import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';

const definitions = [
  { id: 'shell', name: 'Shell', sub: 'ECO HDPE SHELL · GREEN', color: '#25b34a', material: 'HDPE (STEP appearance)', position: 'Roller body' },
  { id: 'shaft', name: 'Shaft', sub: 'STEEL AXLE · CENTER', color: '#aeb9b4', material: 'Steel (STEP appearance)', position: 'Through axis' },
  { id: 'bearing', name: 'Bearings', sub: 'SKF 6205 · PAIR', color: '#c1c9c5', material: 'SKF 6205 (STEP component)', position: 'Both ends' },
  { id: 'seal', name: 'Sealing', sub: 'SHELL 2 · RED', color: '#e6262b', material: 'Sealing component (STEP appearance)', position: 'Both ends' },
  { id: 'housing', name: 'Housing', sub: 'BEARING CARRIER · BLACK', color: '#222624', material: 'Housing (STEP appearance)', position: 'Both ends' },
  { id: 'snapring', name: 'Snap rings', sub: 'SNAPRING S25 · STEEL', color: '#929d97', material: 'SnapRing S25 (STEP component)', position: 'Both ends' },
  { id: 'shield', name: 'Extended shields', sub: 'END SHIELD · OUTER', color: '#111513', material: 'End shield (STEP appearance)', position: 'Both ends' },
];
const byId = new Map(definitions.map((part) => [part.id, part]));
const shellTypes = {
  'hdpe-std': { label: 'HDPE Std', colorName: 'Green', color: '#00b050' },
  'eco-hdpe': { label: 'Eco HDPE', colorName: 'Gray', color: '#a6a6a6' },
  'fr-hdpe': { label: 'FR HDPE', colorName: 'Brown', color: '#984807' },
  'fras-hdpe': { label: 'Fras HDPE', colorName: 'Red', color: '#ff0000' },
  'uhmw-tube': { label: 'UHMW Tube', colorName: 'Blue', color: '#0070c0' },
};
let activeShellType = shellTypes['hdpe-std'];
const componentList = document.querySelector('#component-list');
const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c6cbd5');
scene.fog = new THREE.Fog('#c6cbd5', 100, 300);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 3;
controls.maxDistance = 180;
controls.maxPolarAngle = Math.PI * 0.92;

scene.add(new THREE.HemisphereLight('#ffffff', '#535c64', 2.0));
const key = new THREE.DirectionalLight('#fff8ec', 3.2);
key.position.set(22, 30, 24);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const fill = new THREE.DirectionalLight('#dce8ff', 1.35);
fill.position.set(-24, 14, -18);
scene.add(fill);
const rimLight = new THREE.DirectionalLight('#e7fff0', 1.2);
rimLight.position.set(-8, 12, 28);
scene.add(rimLight);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#c6cbd5', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -7.2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(240, 48, '#737d89', '#9ea6b1');
grid.position.y = -7.18;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const assembly = new THREE.Group();
scene.add(assembly);
const partGroups = new Map(definitions.map((part) => [part.id, []]));
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedId = null;
let explode = 0;
let wireframe = false;
let toastTimer;
let defaultCamera = null;

function setLoadingError(message) {
  const overlay = document.querySelector('#loading');
  overlay.innerHTML = `<span style="color:#ff938d">MODEL LOAD FAILED</span><span style="max-width:420px;text-align:center;line-height:1.7">${message}</span>`;
  overlay.classList.remove('done');
}

function meshBounds(group) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(10);
  return size;
}

function cameraFit() {
  const bounds = new THREE.Box3().setFromObject(assembly);
  const center = bounds.getCenter(new THREE.Vector3());
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const distance = Math.max(20, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92);
  const direction = new THREE.Vector3(1, 0.62, 1.25).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center);
  camera.near = Math.max(0.05, sphere.radius / 100);
  camera.far = Math.max(500, distance * 10);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(3, sphere.radius * 0.22);
  controls.maxDistance = Math.max(180, sphere.radius * 8);
  controls.update();
  defaultCamera = { position: camera.position.clone(), target: center.clone() };
}

function setExplode(value) {
  explode = THREE.MathUtils.clamp(Number(value) || 0, 0, 100);
  for (const groups of partGroups.values()) {
    for (const group of groups) group.position.x = (group.userData.assembledDeltaX || 0) * (1 - explode / 100);
  }
  document.querySelector('#explode-range').value = String(explode);
  document.querySelector('#explode-value').textContent = `${Math.round(explode)}%`;
  document.querySelector('#explode-button').classList.toggle('selected', explode > 0);
  document.querySelector('#view-mode').textContent = explode > 0 ? 'EXPLODED VIEW · STEP' : 'ASSEMBLY VIEW';
}

function renderPartList() {
  const glyphs = { shell: '▱', shaft: '━', bearing: '◎', seal: '◉', housing: '▣', snapring: '○', shield: '◧' };
  componentList.innerHTML = definitions.map((part) => {
    const groups = partGroups.get(part.id) || [];
    const visible = groups.some((group) => group.visible);
    const count = groups.length;
    return `<div class="component-row${selectedId === part.id ? ' active' : ''}" data-id="${part.id}"><span class="part-icon" style="--part-color:${part.color}"><svg viewBox="0 0 20 20"><text x="2" y="15" fill="currentColor" stroke="none" font-size="14">${glyphs[part.id]}</text></svg></span><span><span class="part-name">${part.name}<small class="instance-count"> ×${count}</small></span><span class="part-sub">${part.sub}</span></span><button class="eye-button${visible ? '' : ' hidden'}" data-eye="${part.id}" title="Toggle visibility">◉</button></div>`;
  }).join('');
  componentList.querySelectorAll('.component-row').forEach((row) => row.addEventListener('click', (event) => {
    if (!event.target.closest('.eye-button')) selectPart(row.dataset.id);
  }));
  componentList.querySelectorAll('.eye-button').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const groups = partGroups.get(button.dataset.eye) || [];
    const visible = groups.some((group) => group.visible);
    groups.forEach((group) => { group.visible = !visible; });
    renderPartList();
  }));
}

function selectPart(id) {
  const part = byId.get(id);
  const groups = partGroups.get(id) || [];
  if (!part || !groups.length) return;
  selectedId = id;
  const instanceBoxes = groups.map((group) => meshBounds(group));
  const envelope = instanceBoxes.reduce((max, size) => new THREE.Vector3(Math.max(max.x, size.x), Math.max(max.y, size.y), Math.max(max.z, size.z)), new THREE.Vector3());
  const dimensions = [envelope.x, envelope.y, envelope.z].sort((a, b) => b - a).map((value) => `${value.toFixed(1)}`).join(' × ');
  const materialName = id === 'shell' ? activeShellType.label : part.material;
  document.querySelector('#properties-content').innerHTML = `<div class="property-header"><i class="property-color" style="background:${part.color}"></i><span><strong>${part.name}</strong><small>${part.sub}</small></span></div><div class="property-table"><span>Source</span><b>Roller.STEP</b><span>Component</span><b>${materialName}</b><span>Position</span><b>${part.position}</b><span>Envelope / instance</span><b>${dimensions} mm</b><span>Instances</span><b>${groups.length}</b></div>`;
  document.querySelector('#status-selection').textContent = `SELECTED · ${part.name.toUpperCase()}`;
  const toast = document.querySelector('#selection-toast');
  toast.textContent = `${part.name.toUpperCase()}  /  ${groups.length} INSTANCE${groups.length === 1 ? '' : 'S'}`;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  renderPartList();
}

function setShellType(value) {
  const shellType = shellTypes[value] || shellTypes['hdpe-std'];
  activeShellType = shellType;
  const shell = byId.get('shell');
  shell.color = shellType.color;
  shell.material = shellType.label;
  shell.sub = `${shellType.label.toUpperCase()} · ${shellType.colorName.toUpperCase()}`;
  for (const group of partGroups.get('shell') || []) {
    group.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.color?.set(shellType.color));
    });
  }
  renderPartList();
  if (selectedId === 'shell') selectPart('shell');
}

function resetSelection() {
  selectedId = null;
  document.querySelector('#properties-content').innerHTML = '<div class="empty-selection"><span class="crosshair">⌖</span><span>Pilih komponen untuk melihat<br>detail dan dimensinya.</span></div>';
  document.querySelector('#status-selection').textContent = 'NO PART SELECTED';
  renderPartList();
}

function loadModel() {
  const modelUrl = `${import.meta.env.BASE_URL}models/roller-assembly.glb.gz.b64?v=2`;
  fetch(modelUrl).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} loading model`);
    const base64 = (await response.text()).trim();
    const binary = atob(base64);
    const compressed = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) compressed[index] = binary.charCodeAt(index);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }).then((buffer) => new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, import.meta.env.BASE_URL, resolve, reject);
  })).then((gltf) => {
    assembly.add(gltf.scene);
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material.wireframe = wireframe;
      const parent = object.parent;
      const partId = parent?.userData?.partId;
      if (partId && partGroups.has(partId) && !partGroups.get(partId).includes(parent)) partGroups.get(partId).push(parent);
    });
    setShellType(document.querySelector('#shell-type').value);
    const info = gltf.scene.children[0]?.userData || {};
    document.querySelector('#cad-shell-length').textContent = `${Number(info.shellLength).toFixed(1)} mm`;
    document.querySelector('#cad-shell-diameter').textContent = `${Number(info.shellDiameter).toFixed(1)} mm`;
    document.querySelector('#cad-instance-count').textContent = String(info.componentCount);
    document.querySelector('#part-count').textContent = `${info.componentCount} INSTANCES`;
    renderPartList();
    setExplode(100);
    cameraFit();
    document.querySelector('#loading').classList.add('done');
  }).catch((error) => {
    console.error('Could not load the STEP-derived GLB model.', error);
    setLoadingError('Pastikan public/models/roller-assembly.glb tersedia. Coba muat ulang halaman.');
  });
}

function onResize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

let downPosition = null;
renderer.domElement.addEventListener('pointerdown', (event) => { downPosition = { x: event.clientX, y: event.clientY }; });
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!downPosition || Math.hypot(event.clientX - downPosition.x, event.clientY - downPosition.y) > 4) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(assembly, true).find((item) => item.object.visible);
  let object = hit?.object;
  while (object && object !== assembly && !object.userData.partId) object = object.parent;
  if (object?.userData.partId) selectPart(object.userData.partId);
});

document.querySelector('#explode-range').addEventListener('input', (event) => setExplode(event.target.value));
document.querySelector('#explode-button').addEventListener('click', () => setExplode(explode > 0 ? 0 : 100));
document.querySelector('#assemble-button').addEventListener('click', () => setExplode(0));
document.querySelector('#reset-view').addEventListener('click', () => {
  setExplode(100);
  if (defaultCamera) {
    camera.position.copy(defaultCamera.position);
    controls.target.copy(defaultCamera.target);
    controls.update();
  }
  resetSelection();
});
document.querySelector('#wire-button').addEventListener('click', (event) => {
  wireframe = !wireframe;
  assembly.traverse((object) => { if (object.isMesh) object.material.wireframe = wireframe; });
  event.currentTarget.classList.toggle('selected', wireframe);
});
document.querySelector('#shell-type').addEventListener('change', (event) => setShellType(event.target.value));
document.querySelector('#view-cube').addEventListener('click', () => document.querySelector('#reset-view').click());

const modal = document.querySelector('#help-modal');
document.querySelector('#help-button').addEventListener('click', () => modal.classList.add('open'));
document.querySelector('#close-help').addEventListener('click', () => modal.classList.remove('open'));
document.querySelector('#got-it').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('open'); });

renderPartList();
onResize();
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(viewport);
loadModel();
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();

