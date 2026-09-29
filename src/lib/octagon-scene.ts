import * as THREE from 'three';

// Imported only after the desktop/motion/visibility checks in OctagonScene.
export function initOctagon(wrapper: HTMLDivElement, canvas: HTMLCanvasElement, fallback: SVGElement | null) {
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  camera.position.set(0, 0, 6);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);

  // ── Build octagonal prism wireframe ──
  // 8-sided cylinder = octagonal prism. EdgesGeometry strips the diagonals.
  const radius = 2.4, depth = 1.6, segments = 8;
  const geo = new THREE.CylinderGeometry(radius, radius, depth, segments, 1, true);
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({
    color: 0xF2D928,
    transparent: true,
    opacity: 0.22,
  });
  const cage = new THREE.LineSegments(edges, mat);
  cage.rotation.x = Math.PI / 2.3; // tilt para que se vea el "techo"
  scene.add(cage);

  // Inner ghost octagon — depth/parallax cue
  const innerGeo  = new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, depth * 0.7, segments, 1, true);
  const innerEdges = new THREE.EdgesGeometry(innerGeo);
  const innerMat = new THREE.LineBasicMaterial({
    color: 0xF2D928,
    transparent: true,
    opacity: 0.10,
  });
  const innerCage = new THREE.LineSegments(innerEdges, innerMat);
  innerCage.rotation.x = Math.PI / 2.3;
  scene.add(innerCage);

  // ── Reactivity state ──
  let mouseX = 0, mouseY = 0;     // -1 .. 1
  let scrollY = window.scrollY;
  let targetRotX = 0, targetRotY = 0;

  const onMouse = (e: MouseEvent) => {
    const rect = wrapper.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  };
  const onScroll = () => { scrollY = window.scrollY; };
  const onResize = () => {
    const nw = wrapper.clientWidth, nh = wrapper.clientHeight;
    renderer.setSize(nw, nh, false);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
  };

  window.addEventListener('mousemove', onMouse, { passive: true });
  window.addEventListener('scroll',    onScroll, { passive: true });
  window.addEventListener('resize',    onResize);

  // Fade in canvas, fade out SVG fallback
  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
    if (fallback) fallback.style.opacity = '0';
  });

  const start = performance.now();
  let raf = 0;
  const tick = () => {
    const t = (performance.now() - start) / 1000;

    // Continuous slow Y rotation
    cage.rotation.y      = t * 0.18 + targetRotY * 0.4;
    innerCage.rotation.y = -t * 0.12 + targetRotY * 0.3;

    // Tilt from cursor (lerp)
    targetRotX += (mouseY * 0.15 - targetRotX) * 0.05;
    targetRotY += (mouseX * 0.20 - targetRotY) * 0.05;
    cage.rotation.x      = Math.PI / 2.3 + targetRotX;
    innerCage.rotation.x = Math.PI / 2.3 + targetRotX * 0.7;

    // Subtle scale "breath" from scroll
    const breath = 1 + Math.sin(t * 0.6) * 0.02;
    cage.scale.setScalar(breath);
    innerCage.scale.setScalar(1 + Math.sin(t * 0.6 + 1) * 0.025);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // Pause when tab hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(tick);
    }
  });
}
