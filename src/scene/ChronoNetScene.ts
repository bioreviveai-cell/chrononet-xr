import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import {
  OVERVIEW_CAMERA,
  STAGE_METADATA,
} from '../data/agingNetwork';
import type {
  HallmarkId,
  SelectionTarget,
  StageId,
} from '../types/chrononet';
import {
  createContactShadowTexture,
  createLabFloorTexture,
  createSharedLabMaterials,
} from './materials';
import { buildStageBlocks, type StageBlocksSystem } from './StageBlocks';

export type CameraFocusView = 'overview' | StageId;

export interface StageScreenAnchor {
  id: StageId;
  x: number;
  y: number;
  visible: boolean;
}

export interface ChronoNetSceneCallbacks {
  onSelect: (target: SelectionTarget | null) => void;
  onDeployIntervention: (tokenId: string, targetHallmark: HallmarkId | null) => void;
  onStageAnchorsUpdate?: (anchors: StageScreenAnchor[]) => void;
  onXrStateChange?: (active: boolean) => void;
  onContextLost?: (lost: boolean) => void;
}

export interface ChronoNetSceneState {
  stageProgress: Record<StageId, number>;
  ageFactor: number;
  deployedInterventions: Record<string, HallmarkId | null>;
  selectedTarget: SelectionTarget | null;
}

// Module-scoped scratch math objects to prevent per-frame GC allocations
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.72);
const _dragIntersect = new THREE.Vector3();
const _dragOffset = new THREE.Vector3();
const _xrTempMatrix = new THREE.Matrix4();
const _xrOrigin = new THREE.Vector3();
const _xrDir = new THREE.Vector3();
const _projVec = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ChronoNetSceneController {
  private container: HTMLElement;
  private callbacks: ChronoNetSceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private stageBlocks: StageBlocksSystem;
  private isSoftwareGl: boolean;
  private clock = new THREE.Clock();
  private state: ChronoNetSceneState;

  private frameId = 0;
  private disposed = false;
  private xrActive = false;
  private xrSession: XRSession | null = null;

  // Camera transition state
  private transitionActive = false;
  private targetCamPos = new THREE.Vector3(...OVERVIEW_CAMERA.pos);
  private targetLookAt = new THREE.Vector3(...OVERVIEW_CAMERA.target);

  // Desktop hover & drag state
  private hoveredTarget: SelectionTarget | null = null;
  private lastHoverCheck = 0;
  private draggingTokenId: string | null = null;
  private pointerDownPos = new THREE.Vector2();
  private pointerMovedDuringDrag = false;

  // XR controllers
  private xrControllers: THREE.Group[] = [];
  private xrGrabbedToken: { controllerIdx: number; tokenId: string } | null = null;

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(
    container: HTMLElement,
    initialState: ChronoNetSceneState,
    callbacks: ChronoNetSceneCallbacks,
  ) {
    this.container = container;
    this.state = initialState;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    // 1. Renderer setup with software WebGL guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // 2. Scene, Fog & Studio Environment Map
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a10);
    this.scene.fog = new THREE.FogExp2(0x070a10, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 120);
    this.camera.position.set(...OVERVIEW_CAMERA.pos);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(...OVERVIEW_CAMERA.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.addEventListener('start', () => {
      this.transitionActive = false;
    });

    // 4. Three-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.72);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1db, 2.15);
    keyLight.position.set(8, 14, 10);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 36;
      keyLight.shadow.camera.left = -12;
      keyLight.shadow.camera.right = 12;
      keyLight.shadow.camera.top = 12;
      keyLight.shadow.camera.bottom = -12;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
    rimLight.position.set(-10, 8, -11);
    this.scene.add(rimLight);

    // 5. Spatial Laboratory Grid Floor
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const floorTex = createLabFloorTexture(maxAniso);
    const floorGeo = new THREE.PlaneGeometry(72, 72);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.78,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.disposables.push(floorTex, floorGeo, floorMat);

    // Ambient floating depth particles (InstancedMesh)
    const particleCount = 120;
    const partGeo = new THREE.OctahedronGeometry(0.025, 0);
    const partMat = new THREE.MeshBasicMaterial({
      color: 0x475569,
      transparent: true,
      opacity: 0.42,
    });
    const particles = new THREE.InstancedMesh(partGeo, partMat, particleCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < particleCount; i++) {
      const a = i * 2.39996;
      const r = 4 + (i % 14) * 1.1;
      dummy.position.set(
        Math.cos(a) * r,
        0.5 + ((i * 7) % 10) * 0.55,
        Math.sin(a) * r * 0.65,
      );
      dummy.scale.setScalar(0.6 + (i % 4) * 0.25);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;
    particles.computeBoundingSphere();
    this.scene.add(particles);
    this.disposables.push(partGeo, partMat);

    // 6. Build the 3 Spatial Stage Blocks
    const sharedMats = createSharedLabMaterials(this.isSoftwareGl);
    const shadowTex = createContactShadowTexture();
    this.disposables.push(...sharedMats.disposables, shadowTex);

    this.stageBlocks = buildStageBlocks(sharedMats, shadowTex, maxAniso);
    this.scene.add(this.stageBlocks.root);
    this.stageBlocks.rebuildProximityArcs(this.state.deployedInterventions);

    // Configure raycaster layer 1
    _raycaster.layers.set(1);

    // Pre-compile shaders on hardware WebGL for hitch-free first frame
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 7. WebXR Controller & Hand-Tracking Setup
    this.setupWebXrControllers();

    // 8. Bind Events
    this.bindEvents();

    // 9. Start Render Loop
    this.startDesktopLoop();
  }

  private setupWebXrControllers() {
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5),
    ]);
    const rayMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.7,
    });
    this.disposables.push(rayGeo, rayMat);

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const line = new THREE.Line(rayGeo, rayMat);
      controller.add(line);
      this.scene.add(controller);
      this.xrControllers.push(controller);

      controller.addEventListener('selectstart', () => {
        this.handleXrSelectStart(i, controller);
      });
      controller.addEventListener('selectend', () => {
        this.handleXrSelectEnd(i);
      });

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      this.scene.add(grip);

      const hand = this.renderer.xr.getHand(i);
      hand.add(handModelFactory.createHandModel(hand, 'mesh'));
      this.scene.add(hand);
    }
  }

  private handleXrSelectStart(controllerIdx: number, controller: THREE.Group) {
    _xrTempMatrix.identity().extractRotation(controller.matrixWorld);
    _xrOrigin.setFromMatrixPosition(controller.matrixWorld);
    _xrDir.set(0, 0, -1).applyMatrix4(_xrTempMatrix);
    _raycaster.set(_xrOrigin, _xrDir);

    const tokenHits = _raycaster.intersectObjects(
      this.stageBlocks.draggableTokens,
      false,
    );
    if (tokenHits.length > 0) {
      const hitObj = tokenHits[0].object;
      const tokenId = hitObj.userData.interventionId as string;
      const tRec = this.stageBlocks.interventionTokens.get(tokenId);
      if (tRec) {
        tRec.group.userData.isDragging = true;
        this.xrGrabbedToken = { controllerIdx, tokenId };
        this.callbacks.onSelect({ kind: 'intervention', id: tokenId });
        return;
      }
    }

    const hits = _raycaster.intersectObjects(this.stageBlocks.interactables, false);
    if (hits.length > 0) {
      const target = hits[0].object.userData.selectionTarget as
        | SelectionTarget
        | undefined;
      if (target) {
        this.callbacks.onSelect(target);
      }
    }
  }

  private handleXrSelectEnd(controllerIdx: number) {
    if (!this.xrGrabbedToken || this.xrGrabbedToken.controllerIdx !== controllerIdx) {
      return;
    }
    const { tokenId } = this.xrGrabbedToken;
    const tRec = this.stageBlocks.interventionTokens.get(tokenId);
    if (tRec) {
      tRec.group.userData.isDragging = false;
      const nearest = this.findNearestStage3Hallmark(tRec.group.position);
      this.callbacks.onDeployIntervention(tokenId, nearest);
    }
    this.xrGrabbedToken = null;
  }

  private findNearestStage3Hallmark(pos: THREE.Vector3): HallmarkId | null {
    let bestId: HallmarkId | null = null;
    let bestDist = 1.35; // Proximity drop radius around Hallmark sub-spheres
    for (const [hmId, zRec] of this.stageBlocks.stage3HallmarkZones) {
      const dx = pos.x - zRec.worldCenter.x;
      const dz = pos.z - zRec.worldCenter.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = hmId;
      }
    }
    return bestId;
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private unbindEvents() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost?.(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLost?.(false);
  };

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.xrActive) return;
    this.updatePointerNdc(e);
    this.pointerDownPos.set(e.clientX, e.clientY);
    this.pointerMovedDuringDrag = false;

    _raycaster.setFromCamera(_pointer, this.camera);
    const tokenHits = _raycaster.intersectObjects(
      this.stageBlocks.draggableTokens,
      false,
    );
    if (tokenHits.length > 0) {
      const hitObj = tokenHits[0].object;
      const tokenId = hitObj.userData.interventionId as string;
      const tRec = this.stageBlocks.interventionTokens.get(tokenId);
      if (tRec) {
        this.draggingTokenId = tokenId;
        tRec.group.userData.isDragging = true;
        this.controls.enabled = false;
        this.renderer.domElement.style.cursor = 'grabbing';

        if (_raycaster.ray.intersectPlane(_dragPlane, _dragIntersect)) {
          _dragOffset.copy(tRec.group.position).sub(_dragIntersect);
        }
      }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.xrActive) return;
    this.updatePointerNdc(e);

    if (this.draggingTokenId) {
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      if (dist > 4) this.pointerMovedDuringDrag = true;

      const tRec = this.stageBlocks.interventionTokens.get(this.draggingTokenId);
      if (tRec) {
        _raycaster.setFromCamera(_pointer, this.camera);
        if (_raycaster.ray.intersectPlane(_dragPlane, _dragIntersect)) {
          const s3x = STAGE_METADATA[3].anchor[0];
          const nx = THREE.MathUtils.clamp(
            _dragIntersect.x + _dragOffset.x,
            s3x - 2.05,
            s3x + 2.05,
          );
          const nz = THREE.MathUtils.clamp(
            _dragIntersect.z + _dragOffset.z,
            -2.05,
            2.05,
          );
          tRec.group.position.x = nx;
          tRec.group.position.z = nz;
        }
      }
      return;
    }

    // Throttle hover raycasts to ~20fps
    const now = performance.now();
    if (now - this.lastHoverCheck < 48) return;
    this.lastHoverCheck = now;

    _raycaster.setFromCamera(_pointer, this.camera);
    const hits = _raycaster.intersectObjects(this.stageBlocks.interactables, false);
    if (hits.length > 0) {
      const target = hits[0].object.userData.selectionTarget as
        | SelectionTarget
        | undefined;
      this.hoveredTarget = target ?? null;
      this.renderer.domElement.style.cursor =
        target?.kind === 'intervention' ? 'grab' : 'pointer';
    } else {
      this.hoveredTarget = null;
      this.renderer.domElement.style.cursor = 'crosshair';
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.xrActive) return;

    if (this.draggingTokenId) {
      const tokenId = this.draggingTokenId;
      const tRec = this.stageBlocks.interventionTokens.get(tokenId);
      this.draggingTokenId = null;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = 'crosshair';

      if (tRec) {
        tRec.group.userData.isDragging = false;
        if (this.pointerMovedDuringDrag) {
          const nearest = this.findNearestStage3Hallmark(tRec.group.position);
          this.callbacks.onDeployIntervention(tokenId, nearest);
          this.callbacks.onSelect({ kind: 'intervention', id: tokenId });
        } else {
          this.callbacks.onSelect({ kind: 'intervention', id: tokenId });
        }
      }
      return;
    }

    const moveDist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    if (moveDist > 6) return; // Ignore orbit drags

    // Only pick if pointer released inside the canvas
    if (e.target !== this.renderer.domElement) return;

    this.updatePointerNdc(e);
    _raycaster.setFromCamera(_pointer, this.camera);
    const hits = _raycaster.intersectObjects(this.stageBlocks.interactables, false);
    if (hits.length > 0) {
      const target = hits[0].object.userData.selectionTarget as
        | SelectionTarget
        | undefined;
      if (target) {
        this.callbacks.onSelect(target);
        return;
      }
    }
    this.callbacks.onSelect(null);
  };

  private onResize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 240);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public focusView(view: CameraFocusView) {
    if (view === 'overview') {
      this.targetCamPos.set(...OVERVIEW_CAMERA.pos);
      this.targetLookAt.set(...OVERVIEW_CAMERA.target);
    } else {
      const meta = STAGE_METADATA[view];
      this.targetCamPos.set(...meta.cameraPos);
      this.targetLookAt.set(...meta.cameraTarget);
    }
    this.transitionActive = true;
  }

  public updateState(next: Partial<ChronoNetSceneState>) {
    const prevDeployed = this.state.deployedInterventions;
    this.state = { ...this.state, ...next };
    if (
      next.deployedInterventions &&
      next.deployedInterventions !== prevDeployed
    ) {
      this.stageBlocks.rebuildProximityArcs(next.deployedInterventions);
    }
  }

  public async checkXrSupport(): Promise<{
    supported: boolean;
    mode: 'immersive-vr' | 'immersive-ar' | null;
  }> {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      return { supported: false, mode: null };
    }
    try {
      if (await navigator.xr.isSessionSupported('immersive-vr')) {
        return { supported: true, mode: 'immersive-vr' };
      }
      if (await navigator.xr.isSessionSupported('immersive-ar')) {
        return { supported: true, mode: 'immersive-ar' };
      }
    } catch {
      return { supported: false, mode: null };
    }
    return { supported: false, mode: null };
  }

  public async toggleXr(mode: 'immersive-vr' | 'immersive-ar' = 'immersive-vr') {
    if (this.xrSession) {
      await this.xrSession.end();
      return;
    }
    if (!navigator.xr) return;

    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    this.xrSession = session;
    this.xrActive = true;
    this.callbacks.onXrStateChange?.(true);

    // Stop desktop loop and switch to WebXR animation loop
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    session.addEventListener('end', () => {
      this.xrSession = null;
      this.xrActive = false;
      this.renderer.setAnimationLoop(null);
      this.callbacks.onXrStateChange?.(false);
      if (!this.disposed) {
        this.startDesktopLoop();
      }
    });

    await this.renderer.xr.setSession(session);
    this.renderer.setAnimationLoop(() => {
      this.stepSimulation();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private stepSimulation() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    // Smoothly damp camera focus transitions unless interrupted by user OrbitControls
    if (this.transitionActive && !this.xrActive) {
      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        this.targetCamPos.x,
        5.5,
        delta,
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        this.targetCamPos.y,
        5.5,
        delta,
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        this.targetCamPos.z,
        5.5,
        delta,
      );

      this.controls.target.x = THREE.MathUtils.damp(
        this.controls.target.x,
        this.targetLookAt.x,
        5.5,
        delta,
      );
      this.controls.target.y = THREE.MathUtils.damp(
        this.controls.target.y,
        this.targetLookAt.y,
        5.5,
        delta,
      );
      this.controls.target.z = THREE.MathUtils.damp(
        this.controls.target.z,
        this.targetLookAt.z,
        5.5,
        delta,
      );

      if (
        this.camera.position.distanceToSquared(this.targetCamPos) < 0.002 &&
        this.controls.target.distanceToSquared(this.targetLookAt) < 0.002
      ) {
        this.transitionActive = false;
      }
    }

    if (!this.xrActive) {
      this.controls.update();
    } else if (this.xrGrabbedToken) {
      const controller = this.xrControllers[this.xrGrabbedToken.controllerIdx];
      const tRec = this.stageBlocks.interventionTokens.get(
        this.xrGrabbedToken.tokenId,
      );
      if (controller && tRec) {
        _xrTempMatrix.identity().extractRotation(controller.matrixWorld);
        _xrOrigin.setFromMatrixPosition(controller.matrixWorld);
        _xrDir.set(0, 0, -1.6).applyMatrix4(_xrTempMatrix);
        tRec.group.position.copy(_xrOrigin).add(_xrDir);
      }
    }

    this.stageBlocks.update({
      time: elapsed,
      delta,
      stageProgress: this.state.stageProgress,
      ageFactor: this.state.ageFactor,
      deployedInterventions: this.state.deployedInterventions,
      selectedTarget: this.state.selectedTarget,
      hoveredTarget: this.hoveredTarget,
    });

    // Update projected screen anchors for semantic stage headers
    if (!this.xrActive && this.callbacks.onStageAnchorsUpdate) {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      const anchors: StageScreenAnchor[] = ([1, 2, 3] as StageId[]).map(
        (id) => {
          const a = STAGE_METADATA[id].anchor;
          _projVec.set(a[0], id === 2 ? 3.55 : 3.25, a[2]);
          _projVec.project(this.camera);
          const visible = _projVec.z < 1 && _projVec.z > -1;
          return {
            id,
            x: ((_projVec.x + 1) / 2) * w,
            y: ((-_projVec.y + 1) / 2) * h,
            visible,
          };
        },
      );
      this.callbacks.onStageAnchorsUpdate(anchors);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startDesktopLoop() {
    const tick = () => {
      if (this.disposed || this.xrActive) return;
      this.stepSimulation();
      this.renderer.render(this.scene, this.camera);
      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };
    tick();
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.renderer.setAnimationLoop(null);
    this.unbindEvents();
    this.controls.dispose();
    this.stageBlocks.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
