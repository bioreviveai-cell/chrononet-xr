import * as THREE from 'three';

export function createLabFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, size, size);

  // Subtle radial glow from center
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    20,
    size / 2,
    size / 2,
    size * 0.5,
  );
  grad.addColorStop(0, 'rgba(30, 58, 95, 0.24)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(7, 10, 16, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Fine sub-grid
  const subStep = size / 32;
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 32; i++) {
    const p = i * subStep;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Major calibration grid
  const majorStep = size / 8;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const p = i * majorStep;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Calibration crosshairs at intersections
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1.5;
  for (let ix = 1; ix < 8; ix++) {
    for (let iy = 1; iy < 8; iy++) {
      const cx = ix * majorStep;
      const cy = iy * majorStep;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 5);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 14, 0.38)');
  grad.addColorStop(1, 'rgba(2, 6, 14, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createPedestalDeckTexture(
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c121e';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Concentric technical calibration rings
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1.5;
  [90, 155, 215].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Accent degree ticks around perimeter
  ctx.strokeStyle = accentHex;
  ctx.globalAlpha = 0.42;
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const inner = deg % 45 === 0 ? 198 : 206;
    const outer = 215;
    ctx.lineWidth = deg % 45 === 0 ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
    ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Orthogonal axes
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 220, cy);
  ctx.lineTo(cx + 220, cy);
  ctx.moveTo(cx, cy - 220);
  ctx.lineTo(cx, cy + 220);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export interface SharedLabMaterials {
  anodizedBase: THREE.MeshStandardMaterial;
  brushedTitanium: THREE.MeshPhysicalMaterial;
  glassDeck: THREE.MeshPhysicalMaterial;
  pylonStrut: THREE.MeshStandardMaterial;
  disposables: Array<{ dispose: () => void }>;
}

export function createSharedLabMaterials(isSoftwareGl: boolean): SharedLabMaterials {
  const anodizedBase = new THREE.MeshStandardMaterial({
    color: 0x0f1624,
    roughness: 0.62,
    metalness: 0.55,
  });

  const brushedTitanium = new THREE.MeshPhysicalMaterial({
    color: 0x334155,
    roughness: 0.24,
    metalness: 0.92,
    anisotropy: 0.75,
    clearcoat: 0.2,
  });

  const glassDeck = new THREE.MeshPhysicalMaterial({
    color: 0x162238,
    roughness: 0.12,
    metalness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.65,
    transparent: true,
    opacity: isSoftwareGl ? 0.52 : 0.88,
    ior: 1.52,
    thickness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const pylonStrut = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.82,
  });

  return {
    anodizedBase,
    brushedTitanium,
    glassDeck,
    pylonStrut,
    disposables: [anodizedBase, brushedTitanium, glassDeck, pylonStrut],
  };
}
