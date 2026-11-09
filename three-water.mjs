import * as THREE from 'three/webgpu';
import {
  cameraPosition, cameraWorldMatrix, color, dot, float, mix, normalize,
  positionWorld, reflector, sin, uniform, vec2, vec3,
} from 'three/tsl';

export const BLUE_WATER_PALETTE = Object.freeze({
  deep: 0x133d60,
  shallow: 0x245f88,
  side: 0x164563,
  reflectionTint: [0.52, 0.75, 1.0],
});

/** One horizontal reflection plane for a known world-space water level. */
export function createWaterReflection({
  scene, camera, waterLevel, reflectionLayer = 31,
  resolutionScale = 0.5, skyRadius = camera.far * 0.65,
}) {
  if (!Number.isFinite(waterLevel) || !Number.isFinite(skyRadius) || skyRadius <= 0) {
    throw new Error('A finite water level and positive sky radius are required.');
  }
  if (camera.layers.isEnabled(reflectionLayer)) {
    throw new Error('Choose a sky layer that the main camera does not use.');
  }
  const node = reflector({ resolutionScale, generateMipmaps: true, bounces: false });
  const base = node.reflector;
  if (typeof base?.getVirtualCamera !== 'function') {
    node.dispose();
    throw new Error('This Three.js version needs a ReflectorNode adapter.');
  }
  node.target.rotation.x = -Math.PI / 2;
  node.target.position.y = waterLevel;
  scene.add(node.target);

  const direction = normalize(positionWorld);
  const gradient = mix(color(0xc3d9df), color(0x537ea6), direction.y.clamp(0, 1).pow(0.5));
  const sun = dot(direction, normalize(vec3(-0.20, 0.65, -0.73))).max(0);
  const cloud = sin(direction.x.mul(9).add(direction.z.mul(4))).mul(0.03);
  const skyMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  skyMaterial.colorNode = gradient.add(vec3(1.1, 1.02, 0.85).mul(sun.pow(28))).add(cloud);
  const skyGeometry = new THREE.SphereGeometry(skyRadius, 32, 16);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'Water reflection sky';
  sky.layers.set(reflectionLayer);
  scene.add(sky);

  // Version-sensitive adapter, checked against Three.js 0.187.0.
  const originalGetCamera = base.getVirtualCamera.bind(base);
  base.getVirtualCamera = sourceCamera => {
    const virtualCamera = originalGetCamera(sourceCamera);
    virtualCamera.layers.enable(reflectionLayer);
    return virtualCamera;
  };
  return {
    node,
    dispose() {
      node.target.removeFromParent();
      sky.removeFromParent();
      skyGeometry.dispose();
      skyMaterial.dispose();
      node.dispose();
    },
  };
}

/** Shade existing geometry. The caller owns geometry and animation scheduling. */
export function createWaterMaterial({
  camera, waterLevel, clock = uniform(0), reflection = null,
  opacity = 0.9, palette = BLUE_WATER_PALETTE, rippleScale = 1,
  rippleSpeed = 0.18, distortion = 0.00075, reflectionBlur = 1.4,
}) {
  if (!camera || !Number.isFinite(waterLevel)) {
    throw new Error('A camera and finite world-space water level are required.');
  }
  const position = positionWorld.xz;
  const flow = clock.mul(rippleSpeed);
  const waveA = sin(position.x.mul(1.67 * rippleScale)
    .add(position.y.mul(0.93 * rippleScale)).add(flow));
  const waveB = sin(position.x.mul(1.13 * rippleScale)
    .sub(position.y.mul(2.10 * rippleScale)).sub(flow.mul(0.7)));
  const normal = normalize(vec3(waveA.mul(0.005), 1, waveB.mul(0.004)));
  const view = camera.isOrthographicCamera
    ? normalize(cameraWorldMatrix.element(2).xyz)
    : normalize(cameraPosition.sub(positionWorld));
  const fresnel = float(1).sub(dot(view, normal).clamp(0, 1)).pow(5).mul(0.98).add(0.02);
  const longWave = sin(position.x.mul(0.023)
    .add(position.y.mul(0.017)).add(clock.mul(0.04)));
  const body = mix(color(palette.deep), color(palette.shallow), longWave.mul(0.14).add(0.4));
  let surface = body.add(color(palette.shallow).mul(waveA.mul(waveB).mul(0.008)));
  if (reflection) {
    const reflected = reflection.sample(
      reflection.uvNode.add(vec2(waveA, waveB).mul(distortion)),
    ).level(reflectionBlur);
    surface = mix(body, reflected.rgb.mul(vec3(...palette.reflectionTint)), fresnel);
  }
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    opacity: THREE.MathUtils.clamp(opacity, 0, 1),
    side: THREE.FrontSide,
    depthWrite: false,
  });
  const surfaceMask = positionWorld.y.sub(waterLevel - 0.02).div(0.02).clamp(0, 1);
  material.colorNode = mix(color(palette.side), surface, surfaceMask);
  return {
    material,
    update(seconds) { clock.value = seconds; },
    setOpacity(value) { material.opacity = THREE.MathUtils.clamp(value, 0, 1); },
    dispose() { material.dispose(); },
  };
}
