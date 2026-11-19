import * as THREE from 'three';
import {
  HALLMARK_MODULES,
  INTERVENTION_TOKENS,
  PROTEIN_EDGES,
  PROTEIN_NODES,
  STAGE_METADATA,
} from '../data/agingNetwork';
import type {
  HallmarkId,
  SelectionTarget,
  StageId,
} from '../types/chrononet';
import {
  createPedestalDeckTexture,
  type SharedLabMaterials,
} from './materials';

export interface StagePedestalController {
  stageId: StageId;
  group: THREE.Group;
  completionSegments: THREE.Mesh[];
  accentColor: THREE.Color;
  updateProgress: (ratio: number, time: number) => void;
}

export interface ProteinMeshRecord {
  id: string;
  mesh: THREE.Mesh;
  haloMesh?: THREE.Mesh;
  baseScale: number;
  baseColor: THREE.Color;
  youngColor: THREE.Color;
  oldColor: THREE.Color;
  worldPos: THREE.Vector3;
}

export interface HallmarkMeshRecord {
  id: HallmarkId;
  sphere: THREE.Mesh;
  ring: THREE.Mesh;
  worldCenter: THREE.Vector3;
  color: THREE.Color;
}

export interface InterventionMeshRecord {
  id: string;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  defaultWorldPos: THREE.Vector3;
  color: THREE.Color;
  targetGenes: string[];
  targetHallmark: HallmarkId;
}

export interface StageBlocksSystem {
  root: THREE.Group;
  interactables: THREE.Object3D[];
  draggableTokens: THREE.Object3D[];
  pedestals: Record<StageId, StagePedestalController>;
  stage1LatticeMesh: THREE.InstancedMesh;
  stage1Edges: THREE.LineSegments;
  stage1CoreGroup: THREE.Group;
  stage2Proteins: Map<string, ProteinMeshRecord>;
  stage2Hallmarks: Map<HallmarkId, HallmarkMeshRecord>;
  stage2BridgeLines: THREE.LineSegments;
  stage2IntraLines: THREE.LineSegments;
  stage3Proteins: Map<string, ProteinMeshRecord>;
  stage3HallmarkZones: Map<HallmarkId, HallmarkMeshRecord>;
  stage3FlowLines: THREE.LineSegments;
  interventionTokens: Map<string, InterventionMeshRecord>;
  proximityArcsGroup: THREE.Group;
  stage3DeckY: number;
  update: (params: {
    time: number;
    delta: number;
    stageProgress: Record<StageId, number>;
    ageFactor: number;
    deployedInterventions: Record<string, HallmarkId | null>;
    selectedTarget: SelectionTarget | null;
    hoveredTarget: SelectionTarget | null;
  }) => void;
  rebuildProximityArcs: (
    deployedInterventions: Record<string, HallmarkId | null>,
  ) => void;
  dispose: () => void;
}

const _tmpVec = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _youngHealthy = new THREE.Color('#38BDF8');
const _oldStressed = new THREE.Color('#F97316');
const _oldDepleted = new THREE.Color('#475569');
const _reversalMint = new THREE.Color('#34D399');

function createPedestal(
  stageId: StageId,
  anchor: [number, number, number],
  accentHex: string,
  radius: number,
  shared: SharedLabMaterials,
  shadowTex: THREE.Texture,
  maxAnisotropy: number,
  interactables: THREE.Object3D[],
  disposables: Array<{ dispose: () => void }>,
): StagePedestalController {
  const group = new THREE.Group();
  group.position.set(anchor[0], anchor[1], anchor[2]);
  const accentColor = new THREE.Color(accentHex);

  // 1. Contact shadow disc directly on lab floor (y = 0.012)
  const shadowGeo = new THREE.PlaneGeometry(radius * 2.9, radius * 2.9);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.012;
  shadowPlane.renderOrder = 1;
  group.add(shadowPlane);
  disposables.push(shadowGeo, shadowMat);

  // 2. Heavy anodized chamfered base plinth (grounded at y=0)
  const plinthGeo = new THREE.CylinderGeometry(radius * 0.94, radius * 1.04, 0.22, 16);
  const plinth = new THREE.Mesh(plinthGeo, shared.anodizedBase);
  plinth.position.y = 0.11;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  plinth.layers.enable(1);
  plinth.userData.selectionTarget = { kind: 'stage', id: stageId } satisfies SelectionTarget;
  group.add(plinth);
  interactables.push(plinth);
  disposables.push(plinthGeo);

  // 3. Brushed titanium collar ring
  const collarGeo = new THREE.CylinderGeometry(radius * 0.89, radius * 0.93, 0.09, 24);
  const collar = new THREE.Mesh(collarGeo, shared.brushedTitanium);
  collar.position.y = 0.265;
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);
  disposables.push(collarGeo);

  // 4. Calibrated graphical deck disc (offset Y cleanly to avoid Z-fighting)
  const deckTex = createPedestalDeckTexture(accentHex, maxAnisotropy);
  const deckGeo = new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 0.025, 32);
  const deckMat = new THREE.MeshStandardMaterial({
    map: deckTex,
    roughness: 0.45,
    metalness: 0.35,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.325;
  deck.receiveShadow = true;
  group.add(deck);
  disposables.push(deckTex, deckGeo, deckMat);

  // 5. Beveled optical glass cover plate
  const glassGeo = new THREE.CylinderGeometry(radius * 0.83, radius * 0.85, 0.03, 32);
  const glassPlate = new THREE.Mesh(glassGeo, shared.glassDeck);
  glassPlate.position.y = 0.355;
  glassPlate.receiveShadow = true;
  group.add(glassPlate);
  disposables.push(glassGeo);

  // 6. Four corner containment pylons with emissive cap accents
  const pylonGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11);
  const capGeo = new THREE.BoxGeometry(0.125, 0.04, 0.125);
  const capMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.3,
  });
  disposables.push(pylonGeo, capGeo, capMat);

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const px = Math.cos(angle) * (radius * 0.91);
    const pz = Math.sin(angle) * (radius * 0.91);
    const pylon = new THREE.Mesh(pylonGeo, shared.pylonStrut);
    pylon.position.set(px, 0.27, pz);
    pylon.rotation.y = -angle;
    pylon.castShadow = true;
    group.add(pylon);

    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(px, 0.495, pz);
    cap.rotation.y = -angle;
    group.add(cap);
  }

  // 7. Segmented perimeter progress ring (12 arc segments)
  const completionSegments: THREE.Mesh[] = [];
  const segCount = 12;
  const arcStep = (Math.PI * 2) / segCount;
  const segGeo = new THREE.TorusGeometry(radius * 0.97, 0.022, 8, 12, arcStep * 0.78);
  disposables.push(segGeo);

  for (let s = 0; s < segCount; s++) {
    const segMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: accentColor,
      emissiveIntensity: 0.05,
      roughness: 0.3,
      metalness: 0.6,
    });
    const seg = new THREE.Mesh(segGeo, segMat);
    seg.rotation.x = Math.PI / 2;
    seg.rotation.z = s * arcStep;
    seg.position.y = 0.23;
    group.add(seg);
    completionSegments.push(seg);
    disposables.push(segMat);
  }

  return {
    stageId,
    group,
    completionSegments,
    accentColor,
    updateProgress: (ratio: number, time: number) => {
      const litCount = Math.round(THREE.MathUtils.clamp(ratio, 0, 1) * segCount);
      for (let i = 0; i < segCount; i++) {
        const mat = completionSegments[i].material as THREE.MeshStandardMaterial;
        if (i < litCount) {
          mat.color.copy(accentColor);
          mat.emissiveIntensity = 1.15 + Math.sin(time * 2.2 + i * 0.4) * 0.22;
        } else {
          mat.color.setHex(0x1e293b);
          mat.emissiveIntensity = 0.06;
        }
      }
    },
  };
}

function createInterventionTokenMesh(
  tokenData: (typeof INTERVENTION_TOKENS)[number],
  anchor: [number, number, number],
  shared: SharedLabMaterials,
  interactables: THREE.Object3D[],
  draggableTokens: THREE.Object3D[],
  disposables: Array<{ dispose: () => void }>,
): InterventionMeshRecord {
  const tokenColor = new THREE.Color(tokenData.color);
  const group = new THREE.Group();
  const worldPos = new THREE.Vector3(
    anchor[0] + tokenData.defaultLocalPos[0],
    tokenData.defaultLocalPos[1],
    anchor[2] + tokenData.defaultLocalPos[2],
  );
  group.position.copy(worldPos);

  // Part 1: Weighted anodized grip base
  const baseGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.07, 12);
  const baseMesh = new THREE.Mesh(baseGeo, shared.anodizedBase);
  baseMesh.position.y = -0.11;
  baseMesh.castShadow = true;
  group.add(baseMesh);
  disposables.push(baseGeo);

  // Part 2: Brushed titanium collar
  const collarGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.05, 16);
  const collarMesh = new THREE.Mesh(collarGeo, shared.brushedTitanium);
  collarMesh.position.y = -0.055;
  group.add(collarMesh);
  disposables.push(collarGeo);

  // Part 3: Faceted bioactive crystal core
  const coreGeo = new THREE.OctahedronGeometry(0.125, 0);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: tokenColor,
    emissive: tokenColor,
    emissiveIntensity: 0.75,
    roughness: 0.15,
    metalness: 0.25,
    clearcoat: 1.0,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = 0.06;
  coreMesh.castShadow = true;
  group.add(coreMesh);
  disposables.push(coreGeo, coreMat);

  // Part 4: Orbital containment ring
  const ringGeo = new THREE.TorusGeometry(0.18, 0.015, 10, 28);
  const ringMat = new THREE.MeshStandardMaterial({
    color: tokenColor,
    emissive: tokenColor,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.85,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = 0.05;
  group.add(ringMesh);
  disposables.push(ringGeo, ringMat);

  // Part 5: Top crown beacon
  const crownGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.035, 8);
  const crownMesh = new THREE.Mesh(crownGeo, shared.brushedTitanium);
  crownMesh.position.y = 0.19;
  group.add(crownMesh);
  disposables.push(crownGeo);

  // Simplified invisible collision proxy for effortless picking & dragging
  const hitGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.42, 12);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.y = 0.04;
  hitMesh.layers.enable(1);
  hitMesh.userData.selectionTarget = {
    kind: 'intervention',
    id: tokenData.id,
  } satisfies SelectionTarget;
  hitMesh.userData.interventionId = tokenData.id;
  hitMesh.userData.tokenGroup = group;
  group.add(hitMesh);
  interactables.push(hitMesh);
  draggableTokens.push(hitMesh);
  disposables.push(hitGeo, hitMat);

  return {
    id: tokenData.id,
    group,
    hitMesh,
    coreMesh,
    ringMesh,
    defaultWorldPos: worldPos.clone(),
    color: tokenColor,
    targetGenes: tokenData.targetGenes,
    targetHallmark: tokenData.targetHallmark,
  };
}

export function buildStageBlocks(
  shared: SharedLabMaterials,
  shadowTex: THREE.Texture,
  maxAnisotropy: number,
): StageBlocksSystem {
  const root = new THREE.Group();
  const interactables: THREE.Object3D[] = [];
  const draggableTokens: THREE.Object3D[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  // ---------------------------------------------------------------------------
  // Pedestals for Stages 1, 2, 3
  // ---------------------------------------------------------------------------
  const p1 = createPedestal(
    1,
    STAGE_METADATA[1].anchor,
    STAGE_METADATA[1].accentColor,
    2.1,
    shared,
    shadowTex,
    maxAnisotropy,
    interactables,
    disposables,
  );
  const p2 = createPedestal(
    2,
    STAGE_METADATA[2].anchor,
    STAGE_METADATA[2].accentColor,
    2.65,
    shared,
    shadowTex,
    maxAnisotropy,
    interactables,
    disposables,
  );
  const p3 = createPedestal(
    3,
    STAGE_METADATA[3].anchor,
    STAGE_METADATA[3].accentColor,
    2.25,
    shared,
    shadowTex,
    maxAnisotropy,
    interactables,
    disposables,
  );

  root.add(p1.group, p2.group, p3.group);

  // Inter-stage data conduit tracks on the lab floor connecting 1 -> 2 -> 3
  const conduitMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.8,
  });
  const conduitGeo12 = new THREE.BoxGeometry(2.05, 0.03, 0.14);
  const conduit12 = new THREE.Mesh(conduitGeo12, conduitMat);
  conduit12.position.set(-3.2, 0.025, 0);
  const conduit23 = new THREE.Mesh(conduitGeo12, conduitMat);
  conduit23.position.set(3.2, 0.025, 0);
  root.add(conduit12, conduit23);
  disposables.push(conduitMat, conduitGeo12);

  // ---------------------------------------------------------------------------
  // STAGE 1: 3D PPI Interactome Lattice (InstancedMesh + Seed Gene Highlights)
  // ---------------------------------------------------------------------------
  const s1Anchor = STAGE_METADATA[1].anchor;
  const stage1CoreGroup = new THREE.Group();
  stage1CoreGroup.position.set(s1Anchor[0], 1.75, s1Anchor[2]);
  root.add(stage1CoreGroup);

  const gridDim = 6; // 6 x 6 x 6 = 216 lattice nodes
  const latticeCount = gridDim * gridDim * gridDim;
  const nodeGeo = new THREE.IcosahedronGeometry(0.045, 1);
  const latticeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.3,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.4,
  });
  const stage1LatticeMesh = new THREE.InstancedMesh(
    nodeGeo,
    latticeMat,
    latticeCount,
  );

  const latticeDummy = new THREE.Object3D();
  const latticePositions: THREE.Vector3[] = [];
  const seedFlags: boolean[] = [];
  const spacing = 0.42;
  const halfSpan = ((gridDim - 1) * spacing) / 2;

  let idx = 0;
  for (let ix = 0; ix < gridDim; ix++) {
    for (let iy = 0; iy < gridDim; iy++) {
      for (let iz = 0; iz < gridDim; iz++) {
        // Deterministic organic perturbation for biological network feel
        const seedHash = Math.sin(ix * 12.9898 + iy * 78.233 + iz * 37.719);
        const jitterX = seedHash * 0.055;
        const jitterY = Math.cos(ix * 45.1 + iy * 19.4) * 0.055;
        const jitterZ = Math.sin(iz * 63.7 + ix * 11.3) * 0.055;

        const px = ix * spacing - halfSpan + jitterX;
        const py = iy * spacing - halfSpan + jitterY;
        const pz = iz * spacing - halfSpan + jitterZ;

        const pos = new THREE.Vector3(px, py, pz);
        latticePositions.push(pos);

        const isSeed = (ix + iy * 2 + iz * 3) % 5 === 0 || (ix === 2 && iy === 3);
        seedFlags.push(isSeed);

        latticeDummy.position.copy(pos);
        latticeDummy.scale.setScalar(isSeed ? 1.55 : 0.72);
        latticeDummy.updateMatrix();
        stage1LatticeMesh.setMatrixAt(idx, latticeDummy.matrix);

        if (isSeed) {
          stage1LatticeMesh.setColorAt(idx, new THREE.Color('#38BDF8'));
        } else {
          stage1LatticeMesh.setColorAt(idx, new THREE.Color('#334155'));
        }
        idx++;
      }
    }
  }
  stage1LatticeMesh.instanceMatrix.needsUpdate = true;
  if (stage1LatticeMesh.instanceColor) {
    stage1LatticeMesh.instanceColor.needsUpdate = true;
  }
  stage1LatticeMesh.computeBoundingSphere();
  stage1CoreGroup.add(stage1LatticeMesh);
  disposables.push(nodeGeo, latticeMat);

  // Lattice PPI edges
  const edgePositions: number[] = [];
  for (let i = 0; i < latticeCount; i++) {
    for (let j = i + 1; j < latticeCount; j++) {
      const dist = latticePositions[i].distanceTo(latticePositions[j]);
      if (dist < spacing * 1.15 && ((i + j) % 3 !== 0 || seedFlags[i])) {
        edgePositions.push(
          latticePositions[i].x,
          latticePositions[i].y,
          latticePositions[i].z,
          latticePositions[j].x,
          latticePositions[j].y,
          latticePositions[j].z,
        );
      }
    }
  }
  const s1EdgeGeo = new THREE.BufferGeometry();
  s1EdgeGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(edgePositions, 3),
  );
  const s1EdgeMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.24,
  });
  const stage1Edges = new THREE.LineSegments(s1EdgeGeo, s1EdgeMat);
  stage1CoreGroup.add(stage1Edges);
  disposables.push(s1EdgeGeo, s1EdgeMat);

  // Stage 1 calibration orbital frame
  const s1RingGeo = new THREE.TorusGeometry(1.48, 0.016, 10, 64);
  const s1RingMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.7,
  });
  const s1OrbitalRing = new THREE.Mesh(s1RingGeo, s1RingMat);
  s1OrbitalRing.rotation.x = Math.PI / 2.6;
  stage1CoreGroup.add(s1OrbitalRing);
  disposables.push(s1RingGeo, s1RingMat);

  // ---------------------------------------------------------------------------
  // STAGE 2: Hallmark Modules & Bottleneck Bridges (Primary Milestone)
  // ---------------------------------------------------------------------------
  const s2Anchor = STAGE_METADATA[2].anchor;
  const stage2Hallmarks = new Map<HallmarkId, HallmarkMeshRecord>();
  const stage2Proteins = new Map<string, ProteinMeshRecord>();

  const hallmarkGeo = new THREE.SphereGeometry(1, 32, 24);
  const hallmarkRingGeo = new THREE.TorusGeometry(1, 0.014, 8, 48);
  disposables.push(hallmarkGeo, hallmarkRingGeo);

  for (const hm of HALLMARK_MODULES) {
    const color = new THREE.Color(hm.color);
    const worldCenter = new THREE.Vector3(
      s2Anchor[0] + hm.localCenter[0],
      hm.localCenter[1],
      s2Anchor[2] + hm.localCenter[2],
    );

    const hmMat = new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.16,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sphere = new THREE.Mesh(hallmarkGeo, hmMat);
    sphere.position.copy(worldCenter);
    sphere.scale.setScalar(hm.radius);
    sphere.renderOrder = 4;
    sphere.layers.enable(1);
    sphere.userData.selectionTarget = {
      kind: 'hallmark',
      id: hm.id,
    } satisfies SelectionTarget;
    root.add(sphere);
    interactables.push(sphere);
    disposables.push(hmMat);

    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(hallmarkRingGeo, ringMat);
    ring.position.copy(worldCenter);
    ring.scale.setScalar(hm.radius * 1.03);
    ring.rotation.x = Math.PI / 2.2;
    root.add(ring);
    disposables.push(ringMat);

    stage2Hallmarks.set(hm.id, {
      id: hm.id,
      sphere,
      ring,
      worldCenter,
      color,
    });
  }

  // Build Stage 2 protein hubs & high-betweenness bottlenecks
  const proteinGeo = new THREE.SphereGeometry(1, 20, 16);
  const bottleneckCollarGeo = new THREE.OctahedronGeometry(1.45, 0);
  disposables.push(proteinGeo, bottleneckCollarGeo);

  for (const node of PROTEIN_NODES) {
    const hmRec = stage2Hallmarks.get(node.hallmarkId)!;
    const worldPos = hmRec.worldCenter
      .clone()
      .add(new THREE.Vector3(...node.localOffset));

    const baseScale = 0.048 + node.degreeCentrality * 0.068;
    const baseColor = hmRec.color.clone();

    const mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: node.isBottleneck ? 1.1 : 0.45,
      roughness: 0.22,
      metalness: 0.35,
    });

    const mesh = new THREE.Mesh(proteinGeo, mat);
    mesh.position.copy(worldPos);
    mesh.scale.setScalar(baseScale);
    mesh.castShadow = true;
    mesh.layers.enable(1);
    mesh.userData.selectionTarget = {
      kind: 'protein',
      id: node.id,
    } satisfies SelectionTarget;
    root.add(mesh);
    interactables.push(mesh);
    disposables.push(mat);

    let haloMesh: THREE.Mesh | undefined;
    if (node.isBottleneck) {
      const collarMat = new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
      });
      haloMesh = new THREE.Mesh(bottleneckCollarGeo, collarMat);
      mesh.add(haloMesh);
      disposables.push(collarMat);
    }

    const youngColor = baseColor.clone().lerp(_youngHealthy, 0.35);
    const oldColor =
      node.oldExpr > node.youngExpr
        ? _oldStressed.clone()
        : _oldDepleted.clone();

    stage2Proteins.set(node.id, {
      id: node.id,
      mesh,
      haloMesh,
      baseScale,
      baseColor,
      youngColor,
      oldColor,
      worldPos,
    });
  }

  // Stage 2 edges (intra-module vs high-betweenness bridges)
  const intraCoords: number[] = [];
  const bridgeCoords: number[] = [];

  for (const edge of PROTEIN_EDGES) {
    const src = stage2Proteins.get(edge.source);
    const dst = stage2Proteins.get(edge.target);
    if (!src || !dst) continue;
    const arr = edge.isBridge ? bridgeCoords : intraCoords;
    arr.push(
      src.worldPos.x,
      src.worldPos.y,
      src.worldPos.z,
      dst.worldPos.x,
      dst.worldPos.y,
      dst.worldPos.z,
    );
  }

  const intraGeo = new THREE.BufferGeometry();
  intraGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(intraCoords, 3),
  );
  const intraMat = new THREE.LineBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.35,
  });
  const stage2IntraLines = new THREE.LineSegments(intraGeo, intraMat);
  root.add(stage2IntraLines);
  disposables.push(intraGeo, intraMat);

  const bridgeGeo = new THREE.BufferGeometry();
  bridgeGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(bridgeCoords, 3),
  );
  const bridgeMat = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.68,
  });
  const stage2BridgeLines = new THREE.LineSegments(bridgeGeo, bridgeMat);
  root.add(stage2BridgeLines);
  disposables.push(bridgeGeo, bridgeMat);

  // ---------------------------------------------------------------------------
  // STAGE 3: Directionality & Perturbation Sandbox
  // ---------------------------------------------------------------------------
  const s3Anchor = STAGE_METADATA[3].anchor;
  const stage3HallmarkZones = new Map<HallmarkId, HallmarkMeshRecord>();
  const stage3Proteins = new Map<string, ProteinMeshRecord>();

  // Compact mirrored hallmark zones positioned cleanly on Stage 3 above the token docking deck
  const s3ZoneScale = 0.72;
  for (const hm of HALLMARK_MODULES) {
    const color = new THREE.Color(hm.color);
    const worldCenter = new THREE.Vector3(
      s3Anchor[0] + hm.localCenter[0] * s3ZoneScale,
      1.2 + hm.localCenter[1] * 0.52,
      s3Anchor[2] + hm.localCenter[2] * s3ZoneScale - 0.25,
    );

    const zMat = new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.14,
      roughness: 0.3,
      metalness: 0.08,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sphere = new THREE.Mesh(hallmarkGeo, zMat);
    sphere.position.copy(worldCenter);
    sphere.scale.setScalar(hm.radius * s3ZoneScale);
    sphere.renderOrder = 4;
    sphere.layers.enable(1);
    sphere.userData.selectionTarget = {
      kind: 'hallmark',
      id: hm.id,
    } satisfies SelectionTarget;
    root.add(sphere);
    interactables.push(sphere);
    disposables.push(zMat);

    const rMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
    });
    const ring = new THREE.Mesh(hallmarkRingGeo, rMat);
    ring.position.copy(worldCenter);
    ring.scale.setScalar(hm.radius * s3ZoneScale * 1.03);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    disposables.push(rMat);

    stage3HallmarkZones.set(hm.id, {
      id: hm.id,
      sphere,
      ring,
      worldCenter,
      color,
    });
  }

  for (const node of PROTEIN_NODES) {
    const zRec = stage3HallmarkZones.get(node.hallmarkId)!;
    const worldPos = zRec.worldCenter
      .clone()
      .add(
        new THREE.Vector3(
          node.localOffset[0] * s3ZoneScale,
          node.localOffset[1] * s3ZoneScale,
          node.localOffset[2] * s3ZoneScale,
        ),
      );
    const baseScale = (0.042 + node.degreeCentrality * 0.055) * 0.92;
    const youngColor = zRec.color.clone().lerp(_youngHealthy, 0.42);
    const oldColor =
      node.oldExpr > node.youngExpr
        ? _oldStressed.clone()
        : _oldDepleted.clone();

    const mat = new THREE.MeshStandardMaterial({
      color: youngColor,
      emissive: youngColor,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.3,
    });

    const mesh = new THREE.Mesh(proteinGeo, mat);
    mesh.position.copy(worldPos);
    mesh.scale.setScalar(baseScale);
    mesh.layers.enable(1);
    mesh.userData.selectionTarget = {
      kind: 'protein',
      id: node.id,
    } satisfies SelectionTarget;
    root.add(mesh);
    interactables.push(mesh);
    disposables.push(mat);

    stage3Proteins.set(node.id, {
      id: node.id,
      mesh,
      baseScale,
      baseColor: zRec.color.clone(),
      youngColor,
      oldColor,
      worldPos,
    });
  }

  // Stage 3 flow edges
  const s3FlowCoords: number[] = [];
  for (const edge of PROTEIN_EDGES) {
    const src = stage3Proteins.get(edge.source);
    const dst = stage3Proteins.get(edge.target);
    if (!src || !dst) continue;
    s3FlowCoords.push(
      src.worldPos.x,
      src.worldPos.y,
      src.worldPos.z,
      dst.worldPos.x,
      dst.worldPos.y,
      dst.worldPos.z,
    );
  }
  const s3FlowGeo = new THREE.BufferGeometry();
  s3FlowGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(s3FlowCoords, 3),
  );
  const s3FlowMat = new THREE.LineBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.35,
  });
  const stage3FlowLines = new THREE.LineSegments(s3FlowGeo, s3FlowMat);
  root.add(stage3FlowLines);
  disposables.push(s3FlowGeo, s3FlowMat);

  // Stage 3 Intervention Tokens & Proximity Arcs
  const interventionTokens = new Map<string, InterventionMeshRecord>();
  for (const tData of INTERVENTION_TOKENS) {
    const rec = createInterventionTokenMesh(
      tData,
      s3Anchor,
      shared,
      interactables,
      draggableTokens,
      disposables,
    );
    root.add(rec.group);
    interventionTokens.set(tData.id, rec);
  }

  const proximityArcsGroup = new THREE.Group();
  root.add(proximityArcsGroup);

  const rebuildProximityArcs = (
    deployedInterventions: Record<string, HallmarkId | null>,
  ) => {
    while (proximityArcsGroup.children.length > 0) {
      const child = proximityArcsGroup.children[0] as THREE.Mesh;
      proximityArcsGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    for (const [tokenId, targetHallmark] of Object.entries(
      deployedInterventions,
    )) {
      if (!targetHallmark) continue;
      const tokenRec = interventionTokens.get(tokenId);
      if (!tokenRec) continue;

      const tokenPos = tokenRec.group.position;
      for (const geneId of tokenRec.targetGenes) {
        const pRec = stage3Proteins.get(geneId);
        if (!pRec) continue;

        const mid = tokenPos.clone().lerp(pRec.worldPos, 0.5);
        mid.y += 0.32;
        const curve = new THREE.QuadraticBezierCurve3(
          tokenPos.clone(),
          mid,
          pRec.worldPos.clone(),
        );
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.012, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: tokenRec.color,
          transparent: true,
          opacity: 0.85,
        });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        proximityArcsGroup.add(tube);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Per-Frame Update (zero GC allocations)
  // ---------------------------------------------------------------------------
  const update: StageBlocksSystem['update'] = ({
    time,
    delta,
    stageProgress,
    ageFactor,
    deployedInterventions,
    selectedTarget,
    hoveredTarget,
  }) => {
    p1.updateProgress(stageProgress[1], time);
    p2.updateProgress(stageProgress[2], time);
    p3.updateProgress(stageProgress[3], time);

    // Stage 1 lattice rotation & task-driven illumination
    stage1CoreGroup.rotation.y += delta * (0.14 + stageProgress[1] * 0.14);
    s1OrbitalRing.rotation.z += delta * 0.25;
    (stage1Edges.material as THREE.LineBasicMaterial).opacity =
      0.16 + stageProgress[1] * 0.36;
    latticeMat.emissiveIntensity = 0.28 + stageProgress[1] * 0.55;

    // Stage 2 bridge radiance upgrades with Stage 2 task completion
    (stage2BridgeLines.material as THREE.LineBasicMaterial).opacity =
      0.32 + stageProgress[2] * 0.62;
    (stage2IntraLines.material as THREE.LineBasicMaterial).opacity =
      0.22 + stageProgress[2] * 0.28;

    // Collect which genes are currently rescued by deployed interventions
    const rescuedGenes = new Set<string>();
    const activeTokenHallmarks = new Set<HallmarkId>();
    for (const [tokenId, targetHm] of Object.entries(deployedInterventions)) {
      if (!targetHm) continue;
      activeTokenHallmarks.add(targetHm);
      const tRec = interventionTokens.get(tokenId);
      if (tRec) {
        tRec.targetGenes.forEach((g) => rescuedGenes.add(g));
      }
    }

    // Update Stage 2 hallmark spheres & protein hubs
    for (const [hmId, hmRec] of stage2Hallmarks) {
      const isSelected =
        selectedTarget?.kind === 'hallmark' && selectedTarget.id === hmId;
      const isHovered =
        hoveredTarget?.kind === 'hallmark' && hoveredTarget.id === hmId;
      const mat = hmRec.sphere.material as THREE.MeshPhysicalMaterial;
      mat.opacity = isSelected ? 0.26 : isHovered ? 0.21 : 0.11 + stageProgress[2] * 0.08;
      mat.emissiveIntensity = isSelected ? 0.42 : 0.16 + stageProgress[2] * 0.16;
      hmRec.ring.rotation.z = time * 0.18;
    }

    for (const [geneId, pRec] of stage2Proteins) {
      const isSelected =
        selectedTarget?.kind === 'protein' && selectedTarget.id === geneId;
      const isHovered =
        hoveredTarget?.kind === 'protein' && hoveredTarget.id === geneId;
      const pulse = 1 + Math.sin(time * (1.8 + ageFactor * 2.2) + pRec.worldPos.x) * (0.04 + ageFactor * 0.06);
      const scaleMult = isSelected ? 1.48 : isHovered ? 1.26 : pulse;
      pRec.mesh.scale.setScalar(pRec.baseScale * scaleMult);

      if (pRec.haloMesh) {
        pRec.haloMesh.rotation.y += delta * 0.9;
        pRec.haloMesh.rotation.x += delta * 0.45;
      }

      const mat = pRec.mesh.material as THREE.MeshStandardMaterial;
      _tmpColor.copy(pRec.baseColor).lerp(pRec.oldColor, ageFactor * 0.45);
      if (rescuedGenes.has(geneId)) {
        _tmpColor.lerp(_reversalMint, 0.55);
      }
      mat.color.copy(_tmpColor);
      mat.emissive.copy(_tmpColor);
      mat.emissiveIntensity = isSelected ? 1.8 : pRec.haloMesh ? 1.05 : 0.48 + stageProgress[2] * 0.35;
    }

    // Update Stage 3 trajectory drift & intervention reversal
    for (const [hmId, zRec] of stage3HallmarkZones) {
      const isTargeted = activeTokenHallmarks.has(hmId);
      const isSelected =
        selectedTarget?.kind === 'hallmark' && selectedTarget.id === hmId;
      const mat = zRec.sphere.material as THREE.MeshPhysicalMaterial;
      mat.opacity = isTargeted ? 0.25 : isSelected ? 0.22 : 0.11;
      mat.emissiveIntensity = isTargeted ? 0.48 : 0.16;
      zRec.ring.rotation.z = -time * 0.22;
    }

    for (const [geneId, pRec] of stage3Proteins) {
      const isRescued = rescuedGenes.has(geneId);
      const isSelected =
        selectedTarget?.kind === 'protein' && selectedTarget.id === geneId;
      const effectiveAge = isRescued ? ageFactor * 0.22 : ageFactor;

      _tmpColor.copy(pRec.youngColor).lerp(pRec.oldColor, effectiveAge);
      if (isRescued) {
        _tmpColor.lerp(_reversalMint, 0.45);
      }

      const mat = pRec.mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(_tmpColor);
      mat.emissive.copy(_tmpColor);
      mat.emissiveIntensity = isRescued ? 1.35 : 0.45 + effectiveAge * 0.65 + (isSelected ? 0.7 : 0);

      const pulseAmp = isRescued ? 0.05 : 0.04 + effectiveAge * 0.12;
      const pulse = 1 + Math.sin(time * (2.2 + effectiveAge * 2.5) + pRec.worldPos.z) * pulseAmp;
      pRec.mesh.scale.setScalar(pRec.baseScale * (isSelected ? 1.45 : pulse));
    }

    // Stage 3 flow lines shift from cyan/emerald (young) toward amber (aged) unless rescued
    const s3Mat = stage3FlowLines.material as THREE.LineBasicMaterial;
    _tmpColor.set('#10B981').lerp(_oldStressed, ageFactor * (rescuedGenes.size > 0 ? 0.35 : 0.85));
    s3Mat.color.copy(_tmpColor);
    s3Mat.opacity = 0.24 + stageProgress[3] * 0.38;

    // Animate Intervention Tokens (gentle hover spin + snap toward target Hallmark when deployed)
    for (const [tokenId, tRec] of interventionTokens) {
      tRec.coreMesh.rotation.y += delta * 1.1;
      tRec.ringMesh.rotation.z -= delta * 0.8;

      const deployedHm = deployedInterventions[tokenId];
      const isSelected =
        selectedTarget?.kind === 'intervention' && selectedTarget.id === tokenId;
      const coreMat = tRec.coreMesh.material as THREE.MeshPhysicalMaterial;
      coreMat.emissiveIntensity = deployedHm || isSelected ? 1.35 : 0.68;

      if (deployedHm && !tRec.group.userData.isDragging) {
        const zRec = stage3HallmarkZones.get(deployedHm);
        if (zRec) {
          _tmpVec.set(
            zRec.worldCenter.x,
            0.72,
            zRec.worldCenter.z + 0.58,
          );
          tRec.group.position.x = THREE.MathUtils.damp(
            tRec.group.position.x,
            _tmpVec.x,
            7,
            delta,
          );
          tRec.group.position.z = THREE.MathUtils.damp(
            tRec.group.position.z,
            _tmpVec.z,
            7,
            delta,
          );
        }
      } else if (!deployedHm && !tRec.group.userData.isDragging) {
        tRec.group.position.x = THREE.MathUtils.damp(
          tRec.group.position.x,
          tRec.defaultWorldPos.x,
          7,
          delta,
        );
        tRec.group.position.z = THREE.MathUtils.damp(
          tRec.group.position.z,
          tRec.defaultWorldPos.z,
          7,
          delta,
        );
      }
      tRec.group.position.y =
        0.72 + Math.sin(time * 2.0 + tRec.defaultWorldPos.x) * 0.025;
    }
  };

  return {
    root,
    interactables,
    draggableTokens,
    pedestals: { 1: p1, 2: p2, 3: p3 },
    stage1LatticeMesh,
    stage1Edges,
    stage1CoreGroup,
    stage2Proteins,
    stage2Hallmarks,
    stage2BridgeLines,
    stage2IntraLines,
    stage3Proteins,
    stage3HallmarkZones,
    stage3FlowLines,
    interventionTokens,
    proximityArcsGroup,
    stage3DeckY: 0.72,
    update,
    rebuildProximityArcs,
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
      while (proximityArcsGroup.children.length > 0) {
        const child = proximityArcsGroup.children[0] as THREE.Mesh;
        proximityArcsGroup.remove(child);
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    },
  };
}
