const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const occtImport = require('occt-import-js');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/convert-step.cjs "path/to/Roller.STEP"');
  process.exit(1);
}

const outputPath = path.resolve(__dirname, '../public/models/roller-assembly.glb');
const partDefinitions = [
  { match: /^ECO HDPE SHELL$/i, id: 'shell', label: 'Shell', hex: '#25b34a', roughness: 0.34, metallic: 0.12 },
  { match: /^SHAFT$/i, id: 'shaft', label: 'Shaft', hex: '#aeb9b4', roughness: 0.24, metallic: 0.82 },
  { match: /^SKF BEARING/i, id: 'bearing', label: 'Bearing', hex: '#c1c9c5', roughness: 0.2, metallic: 0.9 },
  { match: /^SHELL 2$/i, id: 'seal', label: 'Sealing', hex: '#e6262b', roughness: 0.34, metallic: 0.05 },
  { match: /^HOUSING$/i, id: 'housing', label: 'Housing', hex: '#222624', roughness: 0.44, metallic: 0.16 },
  { match: /^SNAPRING/i, id: 'snapring', label: 'Snap ring', hex: '#929d97', roughness: 0.24, metallic: 0.82 },
  { match: /^END SHIELD$/i, id: 'shield', label: 'Extended shield', hex: '#111513', roughness: 0.4, metallic: 0.12 },
];

function align4(value) {
  return (value + 3) & ~3;
}

function sRGBToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function colorFactor(hex) {
  const value = hex.slice(1);
  return [0, 2, 4].map((start) => sRGBToLinear(Number.parseInt(value.slice(start, start + 2), 16)));
}

function boundsForNode(node, meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const indices = [];
  const collect = (current) => {
    for (const index of current.meshes || []) indices.push(index);
    for (const child of current.children || []) collect(child);
  };
  collect(node);
  for (const index of indices) {
    const positions = meshes[index].attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], positions[i + axis]);
        max[axis] = Math.max(max[axis], positions[i + axis]);
      }
    }
  }
  if (indices.length === 0) throw new Error(`No mesh data found for STEP component: ${node.name}`);
  return { min, max, centerX: (min[0] + max[0]) / 2, meshIndices: indices };
}

function writeGlb(gltf, binary) {
  gltf.buffers = [{ byteLength: binary.length }];
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonLength = align4(json.length);
  const binLength = align4(binary.length);
  const totalLength = 12 + 8 + jsonLength + 8 + binLength;
  const output = Buffer.alloc(totalLength);
  output.write('glTF', 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  output.fill(0x20, 20 + json.length, 20 + jsonLength);
  const binHeader = 20 + jsonLength;
  output.writeUInt32LE(binLength, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  binary.copy(output, binHeader + 8);
  return output;
}

(async () => {
  const occt = await occtImport();
  const stepBytes = fs.readFileSync(path.resolve(inputPath));
  const result = occt.ReadStepFile(new Uint8Array(stepBytes), {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: 0.18,
    angularDeflection: 0.25,
  });
  if (!result.success) throw new Error('OpenCascade could not read this STEP assembly.');

  const assemblyNode = result.root.children.find((child) => child.name.toLowerCase() === 'roller');
  if (!assemblyNode) throw new Error('The STEP file has no root assembly named Roller.');

  const components = assemblyNode.children.map((node) => {
    const definition = partDefinitions.find((part) => part.match.test(node.name));
    if (!definition) throw new Error(`Unmapped STEP component: ${node.name}`);
    return { ...definition, sourceName: node.name, source: node, bounds: boundsForNode(node, result.meshes) };
  });

  // The STEP assembly already contains a clean one-end exploded layout. Pair instances
  // around the shell center so slider 0 reassembles them and slider 100 restores STEP.
  const byPart = new Map();
  for (const component of components) {
    const list = byPart.get(component.id) || [];
    list.push(component);
    byPart.set(component.id, list);
  }
  for (const list of byPart.values()) {
    list.sort((a, b) => a.bounds.centerX - b.bounds.centerX);
    for (const component of list) component.assembledDeltaX = 0;
    if (list.length === 2) {
      const [left, right] = list;
      right.assembledDeltaX = -(left.bounds.centerX + right.bounds.centerX);
    }
  }

  const shell = components.find((component) => component.id === 'shell');
  const centerY = (shell.bounds.min[1] + shell.bounds.max[1]) / 2;
  const assembledBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const component of components) {
    const shift = [component.assembledDeltaX, -centerY, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      assembledBounds.min[axis] = Math.min(assembledBounds.min[axis], component.bounds.min[axis] + shift[axis]);
      assembledBounds.max[axis] = Math.max(assembledBounds.max[axis], component.bounds.max[axis] + shift[axis]);
    }
  }

  const binaryChunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  // glTF node translation is applied after its scale, so store this center offset in scene units.
  const nodes = [{ name: 'Roller assembly', translation: [0, -centerY * 0.1, 0], scale: [0.1, 0.1, 0.1], children: [], extras: {
    source: 'Roller.STEP', unit: 'mm', componentCount: components.length,
    shellLength: shell.bounds.max[0] - shell.bounds.min[0],
    shellDiameter: Math.max(shell.bounds.max[1] - shell.bounds.min[1], shell.bounds.max[2] - shell.bounds.min[2]),
    assembledBounds,
  } }];
  const binaryLength = () => byteOffset;
  const appendTyped = (typed, target) => {
    const padding = align4(byteOffset) - byteOffset;
    if (padding) { binaryChunks.push(Buffer.alloc(padding)); byteOffset += padding; }
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const viewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target });
    binaryChunks.push(bytes);
    byteOffset += bytes.length;
    return viewIndex;
  };
  const addAccessor = (view, componentType, type, count, min, max) => {
    const accessorIndex = accessors.length;
    accessors.push({ bufferView: view, componentType, count, type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
    return accessorIndex;
  };

  const materials = partDefinitions.map((part) => ({
    name: part.label,
    pbrMetallicRoughness: { baseColorFactor: [...colorFactor(part.hex), 1], metallicFactor: part.metallic, roughnessFactor: part.roughness },
    doubleSided: true,
  }));
  const materialIndex = new Map(partDefinitions.map((part, index) => [part.id, index]));

  for (const component of components) {
    const componentNodeIndex = nodes.length;
    const side = component.bounds.centerX < 0 ? 'left' : component.bounds.centerX > 0 ? 'right' : 'center';
    nodes.push({
      name: `${component.label} · ${side}`,
      translation: [component.assembledDeltaX, 0, 0],
      children: [],
      extras: { partId: component.id, side, sourceName: component.sourceName, sourceCenterX: component.bounds.centerX, assembledDeltaX: component.assembledDeltaX },
    });
    nodes[0].children.push(componentNodeIndex);

    for (const meshIndex of component.bounds.meshIndices) {
      const sourceMesh = result.meshes[meshIndex];
      const positions = new Float32Array(sourceMesh.attributes.position.array);
      const normals = new Float32Array(sourceMesh.attributes.normal.array);
      const indices = new Uint32Array(sourceMesh.index.array);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], positions[i + axis]);
          max[axis] = Math.max(max[axis], positions[i + axis]);
        }
      }
      const positionAccessor = addAccessor(appendTyped(positions, 34962), 5126, 'VEC3', positions.length / 3, min, max);
      const normalAccessor = addAccessor(appendTyped(normals, 34962), 5126, 'VEC3', normals.length / 3);
      const largestIndex = indices.reduce((largest, value) => Math.max(largest, value), 0);
      const indexAccessor = addAccessor(appendTyped(indices, 34963), 5125, 'SCALAR', indices.length, [0], [largestIndex]);
      const meshObjectIndex = gltfMeshes.length;
      gltfMeshes.push({
        name: sourceMesh.name || `${component.sourceName} detail ${meshIndex + 1}`,
        primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: materialIndex.get(component.id), mode: 4 }],
      });
      const meshNodeIndex = nodes.length;
      nodes.push({ name: sourceMesh.name || `${component.sourceName} detail ${meshIndex + 1}`, mesh: meshObjectIndex });
      nodes[componentNodeIndex].children.push(meshNodeIndex);
    }
  }

  const gltf = {
    asset: { version: '2.0', generator: 'Conveyor Engineering Viewer STEP converter' },
    scene: 0,
    scenes: [{ name: 'Roller assembly', nodes: [0] }],
    nodes,
    meshes: gltfMeshes,
    materials,
    buffers: [{ byteLength: binaryLength() }],
    bufferViews,
    accessors,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const glb = writeGlb(gltf, Buffer.concat(binaryChunks));
  fs.writeFileSync(outputPath, glb);
  // Publish a compressed ASCII payload so it can be uploaded with GitHub's text-file API.
  fs.writeFileSync(`${outputPath}.gz.b64`, zlib.gzipSync(glb, { level: 9 }).toString('base64'));
  const counts = [...byPart.entries()].map(([id, list]) => `${id}: ${list.length}`).join(', ');
  console.log(`Wrote ${outputPath}`);
  console.log(`Imported ${components.length} STEP component instances (${counts}).`);
  console.log(`Shell: ${(shell.bounds.max[0] - shell.bounds.min[0]).toFixed(1)} × ${Math.max(shell.bounds.max[1] - shell.bounds.min[1], shell.bounds.max[2] - shell.bounds.min[2]).toFixed(1)} mm.`);
  console.log(`Mesh: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MiB.`);
  console.log(`Compressed web payload: ${(fs.statSync(`${outputPath}.gz.b64`).size / 1024 / 1024).toFixed(2)} MiB.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

