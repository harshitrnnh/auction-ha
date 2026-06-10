import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { getArtworkUrl } from '../data/lotsData';

const SPACING = 2.5;   // horizontal distance between slides in world units
const CAM_Z   = 2.0;   // default camera Z

export default function Stage({ modelCount = 3, lot }) {
  const mountRef   = useRef(null);
  const canvasRef  = useRef(null);
  const [view, setView]           = useState(0);
  const [interacted, setInteracted] = useState(false);
  const viewRef    = useRef(0);
  const targetXRef = useRef(0);
  const totalRef   = useRef(0);
  const controlsRef = useRef(null);
  const swipeRef   = useRef(null);

  const total = 1 + 2 + modelCount; // 3D + front 2D + back 2D + model shots
  totalRef.current = total;

  const API_URL    = import.meta.env.VITE_API_URL ?? '';
  const artworkSrc = getArtworkUrl(lot, API_URL);

  // ── Navigation ───────────────────────────────────────────────────────────
  const goTo = (n) => {
    const clamped = Math.max(0, Math.min(totalRef.current - 1, n));
    viewRef.current    = clamped;
    targetXRef.current = clamped * SPACING;
    setView(clamped);
    setInteracted(true);
    // disable controls during slide transition; re-enabled on arrival (see animate loop)
    if (controlsRef.current) controlsRef.current.enabled = false;
  };

  // ── Swipe gesture (for non-3D slides) ───────────────────────────────────
  const onPointerDown = (e) => {
    if (viewRef.current === 0) return; // OrbitControls owns 3D touch
    const p = e.touches ? e.touches[0] : e;
    swipeRef.current = { x: p.clientX };
    setInteracted(true);
  };

  useEffect(() => {
    const onUp = (e) => {
      if (!swipeRef.current || viewRef.current === 0) { swipeRef.current = null; return; }
      const p   = e.changedTouches ? e.changedTouches[0] : e;
      const dx  = (p?.clientX ?? 0) - swipeRef.current.x;
      const dir = dx < -50 ? 1 : dx > 50 ? -1 : 0;
      if (dir) goTo(viewRef.current + dir);
      swipeRef.current = null;
    };
    window.addEventListener('mouseup',  onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mouseup',  onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  // ── Three.js scene ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current || !canvasRef.current) return;
    const container = mountRef.current;
    const canvas    = canvasRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 20);
    camera.position.set(0, 0, CAM_Z);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFShadowMap;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.5);
    d1.position.set(2, 4, 3); d1.castShadow = true; scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.5);
    d2.position.set(-2, 1, 2); scene.add(d2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.25);
    rim.position.set(0, 3, -5); scene.add(rim);
    const pt = new THREE.PointLight(0xffffff, 0.3, 10);
    pt.position.set(0, 1, 1); scene.add(pt);

    // OrbitControls — active only on slide 0
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping    = true;
    controls.dampingFactor    = 0.05;
    controls.minDistance      = 1.0;
    controls.maxDistance      = 3.5;
    controls.enablePan        = false;
    controls.minPolarAngle    = Math.PI / 3;
    controls.maxPolarAngle    = (2 * Math.PI) / 3;
    controls.target.set(0, 0, 0);
    controls.enabled          = true;
    controlsRef.current       = controls;

    // ── SLIDE 0 — 3D shirt ─────────────────────────────────────────────────
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/shirt.glb', (gltf) => {
      const model = gltf.scene;
      model.position.set(0, -0.05, 0);
      model.scale.set(1.35, 1.35, 1.35);
      scene.add(model);

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow    = true;
        child.receiveShadow = true;
        child.material = new THREE.MeshStandardMaterial({
          color: 0x121212, roughness: 0.85, metalness: 0.1,
        });
        const tempMesh = new THREE.Mesh(child.geometry, child.material);
        tempMesh.updateMatrixWorld(true);

        // Front artwork decal
        if (artworkSrc) {
          new THREE.TextureLoader().load(artworkSrc, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const dg = new DecalGeometry(
              tempMesh,
              new THREE.Vector3(0, 0.04, 0.15),
              new THREE.Euler(0, 0, 0),
              new THREE.Vector3(0.18, 0.18, 0.18),
            );
            child.add(new THREE.Mesh(dg, new THREE.MeshStandardMaterial({
              map: tex, transparent: true, roughness: 0.8,
              depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
            })));
          });
        }

        // Back logo + lot details decal
        new THREE.ImageLoader().load('/logo.png', (img) => {
          const c = document.createElement('canvas');
          c.width = c.height = 512;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 126, 70, 260, 260);
          ctx.font = 'bold 24px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          const lotNo   = lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001';
          const lotDate = lot?.startsAt
            ? new Date(lot.startsAt).toLocaleDateString('en-GB')
            : new Date().toLocaleDateString('en-GB');
          ctx.fillText(`LOT NO. ${lotNo}`, 256, 380);
          ctx.fillText(`DATE- ${lotDate}`,  256, 420);
          const logoTex = new THREE.CanvasTexture(c);
          logoTex.colorSpace = THREE.SRGBColorSpace;
          const bdg = new DecalGeometry(
            tempMesh,
            new THREE.Vector3(0, 0.09, -0.15),
            new THREE.Euler(0, Math.PI, 0),
            new THREE.Vector3(0.09, 0.09, 0.09),
          );
          child.add(new THREE.Mesh(bdg, new THREE.MeshStandardMaterial({
            map: logoTex, transparent: true, roughness: 0.8,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
          })));
        });
      });
    });

    // ── SLIDES 1+ — flat 2D planes ─────────────────────────────────────────
    // Composites a shirt PNG + optional overlay onto a canvas texture then
    // places a PlaneGeometry at the correct slide position.
    const addFlatSlide = (tshirtSrc, slideIndex, overlayFn) => {
      const c   = document.createElement('canvas');
      c.width   = 1024;
      c.height  = 1280;
      const ctx = c.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 1024, 1280);
        const place = () => {
          const tex    = new THREE.CanvasTexture(c);
          const planeH = 1.4;
          const planeW = planeH * (1024 / 1280);
          const mesh   = new THREE.Mesh(
            new THREE.PlaneGeometry(planeW, planeH),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
          );
          mesh.position.set(SPACING * slideIndex, -0.05, 0);
          scene.add(mesh);
        };
        overlayFn ? overlayFn(ctx, place) : place();
      };
      img.src = tshirtSrc;
    };

    // Slide 1 — front with artwork
    addFlatSlide('/tshirt_black_front_png.png', 1, (ctx, place) => {
      if (!artworkSrc) { place(); return; }
      const art = new Image();
      art.crossOrigin = 'anonymous';
      art.onload = () => {
        const aw = 280;
        ctx.drawImage(art, (1024 - aw) / 2, Math.round(1280 * 0.31), aw, aw);
        place();
      };
      art.onerror = place;
      art.src = artworkSrc;
    });

    // Slide 2 — back with logo + lot details
    addFlatSlide('/tshirt_black_back_png.png', 2, (ctx, place) => {
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => {
        const lw = 200;
        ctx.drawImage(logo, (1024 - lw) / 2, Math.round(1280 * 0.18), lw, lw);
        ctx.font      = 'bold 28px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'center';
        const lotNo   = lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001';
        const lotDate = lot?.startsAt
          ? new Date(lot.startsAt).toLocaleDateString('en-GB')
          : new Date().toLocaleDateString('en-GB');
        ctx.fillText(`LOT NO. ${lotNo}`, 512, Math.round(1280 * 0.52));
        ctx.fillText(`DATE- ${lotDate}`,  512, Math.round(1280 * 0.56));
        place();
      };
      logo.onerror = place;
      logo.src = '/logo.png';
    });

    // Slides 3+ — model shot placeholders
    for (let i = 0; i < modelCount; i++) {
      const ph = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.4),
        new THREE.MeshBasicMaterial({ color: 0x1a1726, transparent: true, opacity: 0.7 }),
      );
      ph.position.set(SPACING * (3 + i), 0, 0);
      scene.add(ph);
    }

    // ── Animation loop ─────────────────────────────────────────────────────
    let af;
    const animate = () => {
      af = requestAnimationFrame(animate);
      const tx = targetXRef.current;

      if (!controls.enabled) {
        // Slide camera to new position and return to front-facing default
        const k = 0.09;
        camera.position.x += (tx - camera.position.x) * k;
        camera.position.y += (0  - camera.position.y) * k;
        camera.position.z += (CAM_Z - camera.position.z) * k;
        controls.target.x += (tx - controls.target.x) * k;

        // Re-enable orbit controls once camera has settled on slide 0
        if (
          viewRef.current === 0 &&
          Math.abs(camera.position.x - tx) < 0.01 &&
          Math.abs(camera.position.y)       < 0.01 &&
          Math.abs(camera.position.z - CAM_Z) < 0.01
        ) {
          camera.position.set(0, 0, CAM_Z);
          controls.target.set(0, 0, 0);
          controls.enabled = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ─────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!container) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(af);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [artworkSrc]);

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="stage">
      <div className="stage-floor">
        <div className="spotlight" />
        <div className="floor-pool" />
        <div className="vignette" />
      </div>

      <div
        ref={mountRef}
        className="canvas"
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        style={{ cursor: 'grab' }}
      >
        <canvas
          ref={canvasRef}
          aria-label="3D shirt viewer"
          style={{ width: '100%', height: '100%', outline: 'none' }}
        />

        <div className="drag-hint" style={{ opacity: interacted ? 0 : 0.9 }}>
          <span>✦</span>
          {view === 0 ? 'drag to rotate · scroll to zoom' : 'drag to browse'}
        </div>
      </div>

      <div className="rail">
        <button className="rail-nav" onClick={() => goTo(view - 1)} disabled={view === 0} aria-label="Previous">‹</button>

        <button className={'thumb' + (view === 0 ? ' on' : '')} onClick={() => goTo(0)}>
          <div className="tball" /><span className="badge">3D</span>
        </button>
        <button className={'thumb' + (view === 1 ? ' on' : '')} onClick={() => goTo(1)}>
          <div className="tball flat" style={{ borderRadius: '4px' }} /><span className="badge">2D F</span>
        </button>
        <button className={'thumb' + (view === 2 ? ' on' : '')} onClick={() => goTo(2)}>
          <div className="tball flat" style={{ borderRadius: '4px' }} /><span className="badge">2D B</span>
        </button>
        {Array.from({ length: modelCount }).map((_, i) => (
          <button
            key={i}
            className={'thumb model-thumb' + (view === i + 3 ? ' on' : '')}
            onClick={() => goTo(i + 3)}
          >
            <span className="tlabel">0{i + 1}</span>
          </button>
        ))}

        <button className="rail-nav" onClick={() => goTo(view + 1)} disabled={view === total - 1} aria-label="Next">›</button>
      </div>
    </div>
  );
}
