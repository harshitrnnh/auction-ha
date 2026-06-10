import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { getArtworkUrl } from '../data/lotsData';

const RING_R    = 2.0;   // carousel ring radius
const CAM_Z     = 3.8;   // camera Z (front item at Z=RING_R, camera 1.8 units behind)
const CAM_Z_MIN = 2.4;   // closest zoom on slide 0
const CAM_Z_MAX = 10.0;  // furthest zoom on slide 0
const SLIDE_H   = 1.0;   // height of every slide in world units

// Thumbnail rail carousel geometry
const ITEM_W  = 54;
const ITEM_GAP = 10;
const STRIDE   = ITEM_W + ITEM_GAP; // 64 px per slot

export default function Stage({ modelCount = 3, lot }) {
  const mountRef  = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView]             = useState(0);
  const [interacted, setInteracted] = useState(false);
  const viewRef        = useRef(0);
  const totalRef       = useRef(0);
  const camZTarget     = useRef(CAM_Z);
  const ringAngleRef   = useRef(0);   // current accumulated ring Y rotation
  const ringTargetRef  = useRef(0);   // target accumulated ring Y rotation

  const total = 1 + 2 + modelCount;
  totalRef.current = total;

  const API_URL    = import.meta.env.VITE_API_URL ?? '';
  const artworkSrc = getArtworkUrl(lot, API_URL);

  // ── Navigation ───────────────────────────────────────────────────────────
  const goTo = useCallback((n) => {
    const N       = totalRef.current;
    const clamped = Math.max(0, Math.min(N - 1, n));
    viewRef.current = clamped;

    // Target ring angle for this slide, shortest path from current accumulated angle
    const desired = -clamped * (2 * Math.PI / N);
    let diff = desired - ringAngleRef.current;
    diff -= Math.round(diff / (2 * Math.PI)) * (2 * Math.PI); // normalize to (-π, π]
    ringTargetRef.current = ringAngleRef.current + diff;

    setView(clamped);
    setInteracted(true);
    camZTarget.current = CAM_Z;
  }, []);

  // ── Thumbnail rail carousel ───────────────────────────────────────────────
  const slides = useMemo(() => [
    { idx: 0, is3D: true },
    { idx: 1, label: '2D F' },
    { idx: 2, label: '2D B' },
    ...Array.from({ length: modelCount }, (_, i) => ({ idx: i + 3, isModel: true, num: i + 1 })),
  ], [modelCount]);

  const railOffRef   = useRef(0);
  const [railOff, setRailOff] = useState(0);
  const railDragRef  = useRef(null);   // { startX, startOff } while dragging
  const railMovedRef = useRef(false);  // crossed move threshold in current drag
  const railAnimRef  = useRef(null);

  // Keep rail in sync when view changes externally (shortest-path animation)
  useEffect(() => {
    if (railDragRef.current) return;
    const N      = slides.length;
    const period = N * STRIDE;
    const ideal  = view * STRIDE;
    let diff = ideal - railOffRef.current;
    diff -= Math.round(diff / period) * period; // shortest path, wraps correctly
    if (Math.abs(diff) < 1) return;
    const target = railOffRef.current + diff;
    cancelAnimationFrame(railAnimRef.current);
    const tick = () => {
      const d = target - railOffRef.current;
      if (Math.abs(d) < 0.3) { railOffRef.current = target; setRailOff(target); return; }
      railOffRef.current += d * 0.2;
      setRailOff(railOffRef.current);
      railAnimRef.current = requestAnimationFrame(tick);
    };
    railAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(railAnimRef.current);
  }, [view, slides.length]);

  // Rail drag → snap → goTo
  useEffect(() => {
    const N = slides.length;

    const onDown = (e) => {
      if (!e.target.closest('.rail')) return;
      cancelAnimationFrame(railAnimRef.current);
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      railDragRef.current  = { startX: x, startOff: railOffRef.current };
      railMovedRef.current = false;
    };

    const onMove = (e) => {
      if (!railDragRef.current) return;
      if (e.cancelable) e.preventDefault();
      const x  = e.touches ? e.touches[0].clientX : e.clientX;
      const dx = railDragRef.current.startX - x;
      if (Math.abs(dx) > 4) railMovedRef.current = true;
      railOffRef.current = railDragRef.current.startOff + dx;
      setRailOff(railOffRef.current);
    };

    const onUp = () => {
      if (!railDragRef.current) return;
      const moved = railMovedRef.current;
      railDragRef.current = null;
      if (!moved) return;
      const rawIdx  = Math.round(railOffRef.current / STRIDE);
      const viewIdx = ((rawIdx % N) + N) % N;
      const target  = rawIdx * STRIDE;
      cancelAnimationFrame(railAnimRef.current);
      const tick = () => {
        const d = target - railOffRef.current;
        if (Math.abs(d) < 0.3) {
          railOffRef.current = target;
          setRailOff(target);
          goTo(viewIdx);
          return;
        }
        railOffRef.current += d * 0.22;
        setRailOff(railOffRef.current);
        railAnimRef.current = requestAnimationFrame(tick);
      };
      railAnimRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousedown',  onDown);
    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('touchmove',  onMove, { passive: false });
    window.addEventListener('mouseup',    onUp);
    window.addEventListener('touchend',   onUp);
    return () => {
      window.removeEventListener('mousedown',  onDown);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('mouseup',    onUp);
      window.removeEventListener('touchend',   onUp);
      cancelAnimationFrame(railAnimRef.current);
    };
  }, [slides.length, goTo]);

  // ── Three.js scene ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current || !canvasRef.current) return;
    const container = mountRef.current;
    const canvas    = canvasRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    const raycaster = new THREE.Raycaster();
    const mouse2    = new THREE.Vector2();

    // Camera — fixed position; only Z changes for zoom; ring rotates instead of translating
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 30);
    camera.position.set(0, 0, CAM_Z);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFShadowMap;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Shift frustum to center on non-bidrail area on desktop (--canvas-shift: -174px)
    const applyViewOffset = () => {
      const nw    = container.clientWidth;
      const nh    = container.clientHeight;
      const shift = parseInt(getComputedStyle(container).getPropertyValue('--canvas-shift')) || 0;
      if (shift !== 0) {
        camera.setViewOffset(nw, nh, -shift, 0, nw, nh);
      } else {
        camera.aspect = nw / nh;
        camera.clearViewOffset();
      }
    };
    applyViewOffset();

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

    // ── Carousel ring ─────────────────────────────────────────────────────
    // All slide pods are children of this group; rotating it changes the focused slide.
    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const N       = totalRef.current;
    const allPods = []; // every pod collected here for per-frame camera-facing

    // Make a pod on the ring for slide index i.
    // Pods are NOT pre-rotated; they face the camera via billboarding every frame.
    const makePod = (i) => {
      const pod = new THREE.Group();
      const θ   = (2 * Math.PI / N) * i;
      pod.position.set(RING_R * Math.sin(θ), 0, RING_R * Math.cos(θ));
      ringGroup.add(pod);
      allPods.push(pod);
      return { pod, θ };
    };

    // ── SLIDE 0 — 3D shirt inside its own rotation group (child of pod 0) ──
    const { pod: shirtPod, θ: shirtθ } = makePod(0);
    const shirtGroup = new THREE.Group();
    shirtPod.add(shirtGroup);

    // ── Drag-to-rotate: rotates shirtGroup/tilt flat pod locally, or rotates ring if empty space ──
    const drag   = { active: false, x: 0, y: 0 };
    const rotVel = { x: 0, y: 0 };
    let initialPinchDist = null;
    let initialCamZ = null;
    let clickedOnPod = false;

    const onDragStart = (e) => {
      if (e.touches && e.touches.length === 2) {
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialCamZ = camZTarget.current;
        drag.active = false;
        return;
      }
      
      const p = e.touches ? e.touches[0] : e;
      const rect = canvas.getBoundingClientRect();
      mouse2.x = ((p.clientX - rect.left)  / rect.width)  * 2 - 1;
      mouse2.y = -((p.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse2, camera);
      const hits = raycaster.intersectObjects(clickProxies.map(cp => cp.proxy));
      clickedOnPod = hits.length > 0;

      drag.active = true; 
      drag.x = p.clientX; 
      drag.y = p.clientY;
      setInteracted(true);
    };
    const onDragMove = (e) => {
      if (e.touches && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        if (initialPinchDist === null || initialCamZ === null) {
          initialPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialCamZ = camZTarget.current;
        } else {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const diff = initialPinchDist - dist;
          camZTarget.current = Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX,
            initialCamZ + diff * 0.015));
        }
        return;
      }

      if (!drag.active) return;
      if (e.cancelable) e.preventDefault();
      const p  = e.touches ? e.touches[0] : e;
      const dx = p.clientX - drag.x;
      const dy = p.clientY - drag.y;
      drag.x = p.clientX; drag.y = p.clientY;

      if (!clickedOnPod) {
        // Drag empty space to rotate the carousel ring directly
        ringTargetRef.current += dx * 0.006;
      } else {
        if (viewRef.current === 0) {
          // Shirt: free rotation with inertia
          rotVel.y = dx * 0.008;
          rotVel.x = dy * 0.004;
          shirtGroup.rotation.y += dx * 0.008;
          shirtGroup.rotation.x  = Math.max(-0.45, Math.min(0.45,
            shirtGroup.rotation.x + dy * 0.004));
        } else {
          // Flat slide: tilt slightly more (clamped to ±0.5 Y and ±0.3 X)
          const tilt = podTilts[viewRef.current];
          if (tilt) {
            tilt.vy = dx * 0.003;
            tilt.vx = dy * 0.002;
            tilt.ry = Math.max(-0.5, Math.min(0.5, tilt.ry + dx * 0.003));
            tilt.rx = Math.max(-0.3, Math.min(0.3, tilt.rx + dy * 0.002));
          }
        }
      }
    };
    const onDragEnd = () => {
      drag.active = false;
      initialPinchDist = null;
      initialCamZ = null;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const speed = e.ctrlKey ? 0.04 : 0.008;
      camZTarget.current = Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX,
        camZTarget.current + e.deltaY * speed));
    };

    canvas.addEventListener('mousedown',  onDragStart);
    canvas.addEventListener('touchstart', onDragStart, { passive: true });
    canvas.addEventListener('wheel',      onWheel,     { passive: false });
    window.addEventListener('mousemove',  onDragMove);
    window.addEventListener('touchmove',  onDragMove,  { passive: false });
    window.addEventListener('mouseup',    onDragEnd);
    window.addEventListener('touchend',   onDragEnd);

    // ── GLTF shirt ────────────────────────────────────────────────────────
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/shirt.glb', (gltf) => {
      const model = gltf.scene;

      // Scale to match 2D slide height, then center — before adding to scene
      // so bbox is in the model's own local space (world matrix = identity).
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s      = SLIDE_H / size.y; // match flat slide height
      model.scale.setScalar(s);
      model.position.set(-center.x * s, -center.y * s, -center.z * s);

      shirtGroup.add(model);

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow    = true;
        child.receiveShadow = true;
        // transparent: true from the start so opacity updates never need needsUpdate
        child.material = new THREE.MeshStandardMaterial({
          color: 0x121212, roughness: 0.85, metalness: 0.1, transparent: true,
        });
        const tempMesh = new THREE.Mesh(child.geometry, child.material);
        tempMesh.updateMatrixWorld(true);

        if (artworkSrc) {
          new THREE.TextureLoader().load(artworkSrc, (tex) => {
            tex.colorSpace  = THREE.SRGBColorSpace;
            tex.anisotropy  = maxAniso;
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
          logoTex.anisotropy = maxAniso;
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

    // ── SLIDES 1+ — flat 2D planes, each in its own ring pod ─────────────
    // { mesh, θ, idx } for per-frame frontness fade and raycasting
    const flatSlides = [];
    // per flat-slide tilt state (pod-local, springs back to 0)
    const podTilts = {}; // idx → { ry, rx, vy, vx }

    // overlayFn signature: (ctx, cw, ch, place)
    const addFlatSlide = (tshirtSrc, slideIdx, overlayFn) => {
      podTilts[slideIdx] = { ry: 0, rx: 0, vy: 0, vx: 0 };
      const { pod, θ } = makePod(slideIdx);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const cw = img.naturalWidth;
        const ch = img.naturalHeight;
        const c   = document.createElement('canvas');
        c.width   = cw;
        c.height  = ch;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);

        const place = () => {
          const tex    = new THREE.CanvasTexture(c);
          tex.colorSpace      = THREE.SRGBColorSpace;
          tex.anisotropy      = maxAniso;
          tex.minFilter       = THREE.LinearFilter;
          tex.generateMipmaps = false;
          const planeH = SLIDE_H;
          const planeW = planeH * (cw / ch); // correct aspect, no stretching
          const mesh   = new THREE.Mesh(
            new THREE.PlaneGeometry(planeW, planeH),
            new THREE.MeshBasicMaterial({
              map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide,
            }),
          );
          pod.add(mesh);
          flatSlides.push({ mesh, θ, idx: slideIdx });
        };
        overlayFn ? overlayFn(ctx, cw, ch, place) : place();
      };
      img.src = tshirtSrc;
    };

    addFlatSlide('/tshirt_black_front_png.png', 1, (ctx, cw, ch, place) => {
      if (!artworkSrc) { place(); return; }
      const art = new Image();
      art.crossOrigin = 'anonymous';
      art.onload = () => {
        const aw = Math.round(cw * 0.273); // chest artwork ~27% of image width
        ctx.drawImage(art, (cw - aw) / 2, Math.round(ch * 0.31), aw, aw);
        place();
      };
      art.onerror = place;
      art.src = artworkSrc;
    });

    addFlatSlide('/tshirt_black_back_png.png', 2, (ctx, cw, ch, place) => {
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => {
        const lw = Math.round(cw * 0.195); // logo ~19.5% of image width
        ctx.drawImage(logo, (cw - lw) / 2, Math.round(ch * 0.18), lw, lw);
        ctx.font      = `bold ${Math.round(ch * 0.022)}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'center';
        const lotNo   = lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001';
        const lotDate = lot?.startsAt
          ? new Date(lot.startsAt).toLocaleDateString('en-GB')
          : new Date().toLocaleDateString('en-GB');
        ctx.fillText(`LOT NO. ${lotNo}`, cw / 2, Math.round(ch * 0.52));
        ctx.fillText(`DATE- ${lotDate}`,  cw / 2, Math.round(ch * 0.56));
        place();
      };
      logo.onerror = place;
      logo.src = '/logo.png';
    });

    // Standardize placeholder size to 1.12 × 1.4 (same aspect as tshirt images)
    for (let i = 0; i < modelCount; i++) {
      podTilts[3 + i] = { ry: 0, rx: 0, vy: 0, vx: 0 };
      const { pod, θ } = makePod(3 + i);
      const ph = new THREE.Mesh(
        new THREE.PlaneGeometry(SLIDE_H * 0.8, SLIDE_H),
        new THREE.MeshBasicMaterial({ color: 0x1a1726, transparent: true, opacity: 0 }),
      );
      pod.add(ph);
      flatSlides.push({ mesh: ph, θ, idx: 3 + i });
    }

    // ── Click-to-focus: invisible proxy planes in every pod for raycasting ──
    const proxyGeo = new THREE.PlaneGeometry(SLIDE_H * 1.1, SLIDE_H * 1.2);
    const proxyMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const clickProxies = []; // { proxy, idx }

    // Shirt pod (slide 0)
    const shirtProxy = new THREE.Mesh(proxyGeo, proxyMat.clone());
    shirtProxy.position.set(0, 0, 0.1);
    shirtPod.add(shirtProxy);
    clickProxies.push({ proxy: shirtProxy, idx: 0 });

    // Proxies for slides 1..N-1: iterate ringGroup children (all pods added synchronously above)
    ringGroup.children.forEach((pod, i) => {
      if (i === 0) return; // shirtPod already done
      const pr = new THREE.Mesh(proxyGeo, proxyMat.clone());
      pr.position.set(0, 0, 0);
      pod.add(pr);
      clickProxies.push({ proxy: pr, idx: i });
    });


    let   pointerDownPos = null;

    const onCanvasPointerDown = (e) => {
      const p = e.touches ? e.touches[0] : e;
      pointerDownPos = { x: p.clientX, y: p.clientY };
    };
    const onCanvasClick = (e) => {
      if (!pointerDownPos) return;
      const p  = e.changedTouches ? e.changedTouches[0] : e;
      const dx = p.clientX - pointerDownPos.x;
      const dy = p.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return; // was a drag, not a click

      const rect = canvas.getBoundingClientRect();
      mouse2.x = ((p.clientX - rect.left)  / rect.width)  * 2 - 1;
      mouse2.y = -((p.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse2, camera);
      const hits = raycaster.intersectObjects(clickProxies.map(cp => cp.proxy));
      if (!hits.length) return;
      const hitProxy = hits[0].object;
      const target   = clickProxies.find(cp => cp.proxy === hitProxy);
      if (target && target.idx !== viewRef.current) goTo(target.idx);
    };

    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointerup',   onCanvasClick);

    // ── Animation loop ─────────────────────────────────────────────────────
    const tmpVec = new THREE.Vector3(); // reused every frame for billboard calc
    let af;
    const animate = () => {
      af = requestAnimationFrame(animate);

      // Shirt rotation inertia (local to shirtGroup — never affects the ring)
      if (viewRef.current === 0 && !drag.active) {
        shirtGroup.rotation.y += rotVel.y;
        shirtGroup.rotation.x  = Math.max(-0.45, Math.min(0.45,
          shirtGroup.rotation.x + rotVel.x));
        rotVel.y *= 0.92;
        rotVel.x *= 0.92;
      }

      // Flat slide tilt: inertia + spring back to facing-forward
      for (const { mesh, idx } of flatSlides) {
        const tilt = podTilts[idx];
        if (!tilt) continue;
        if (!(drag.active && viewRef.current === idx)) {
          tilt.ry += tilt.vy;
          tilt.rx += tilt.vx;
          tilt.vy *= 0.88;
          tilt.vx *= 0.88;
          tilt.ry *= 0.93; // spring toward 0
          tilt.rx *= 0.93;
        }
        mesh.rotation.y = tilt.ry;
        mesh.rotation.x = tilt.rx;
      }

      // Smooth ring rotation (carousel)
      ringAngleRef.current += (ringTargetRef.current - ringAngleRef.current) * 0.09;
      ringGroup.rotation.y  = ringAngleRef.current;

      // Billboard: every pod rotates so its +Z faces the camera regardless of ring angle
      for (const pod of allPods) {
        pod.getWorldPosition(tmpVec);
        pod.rotation.y = Math.atan2(
          camera.position.x - tmpVec.x,
          camera.position.z - tmpVec.z,
        ) - ringGroup.rotation.y;
      }

      // Smooth zoom (slide 0)
      camera.position.z += (camZTarget.current - camera.position.z) * 0.1;

      // Fade flat slides: opacity = max(0, cos(world angle)) — front=1, side=0.5, back=0
      for (const { mesh, θ } of flatSlides) {
        const worldAngle = θ + ringGroup.rotation.y;
        mesh.material.opacity = Math.max(0, Math.cos(worldAngle));
      }

      // Fade 3D shirt by same frontness (transparent was set on material from birth)
      const shirtFrontness = Math.max(0, Math.cos(shirtθ + ringGroup.rotation.y));
      shirtGroup.traverse((child) => {
        if (child.isMesh) child.material.opacity = shirtFrontness;
      });

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ─────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!container) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      renderer.setSize(nw, nh);
      applyViewOffset();
    };
    window.addEventListener('resize', onResize);

    return () => {
      canvas.removeEventListener('mousedown',   onDragStart);
      canvas.removeEventListener('touchstart',  onDragStart);
      canvas.removeEventListener('wheel',       onWheel);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointerup',   onCanvasClick);
      window.removeEventListener('mousemove',   onDragMove);
      window.removeEventListener('touchmove',   onDragMove);
      window.removeEventListener('mouseup',     onDragEnd);
      window.removeEventListener('touchend',    onDragEnd);
      window.removeEventListener('resize',      onResize);
      cancelAnimationFrame(af);
      renderer.dispose();
      scene.clear();
    };
  }, [artworkSrc]);

  // ── Rail items ───────────────────────────────────────────────────────────
  const N_sl    = slides.length;
  const vCenter = railOff / STRIDE;
  const vFrom   = Math.floor(vCenter) - 3;
  const vTo     = Math.ceil(vCenter)  + 3;
  const railItems = [];
  for (let v = vFrom; v <= vTo; v++) {
    const actualIdx = ((v % N_sl) + N_sl) % N_sl;
    const slide     = slides[actualIdx];
    const px        = v * STRIDE - railOff; // px from container centre
    const distU     = Math.abs(px) / STRIDE;
    const scale     = Math.max(0.72, 1 - distU * 0.1);
    const opacity   = Math.max(0.25, 1 - distU * 0.28);
    railItems.push(
      <button
        key={v}
        className={`thumb${slide.isModel ? ' model-thumb' : ''}${actualIdx === view ? ' on' : ''}`}
        onClick={() => { if (!railMovedRef.current) goTo(actualIdx); }}
        style={{
          left: `calc(50% + ${px - ITEM_W / 2}px)`,
          transform: `scale(${scale.toFixed(3)})`,
          opacity: opacity.toFixed(3),
        }}
      >
        {slide.is3D
          ? <><div className="tball" /><span className="badge">3D</span></>
          : slide.isModel
            ? <span className="tlabel">0{slide.num}</span>
            : <><div className="tball flat" style={{ borderRadius: '4px' }} /><span className="badge">{slide.label}</span></>
        }
      </button>,
    );
  }

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
        style={{ cursor: 'grab' }}
      >
        <canvas
          ref={canvasRef}
          aria-label="3D carousel viewer"
          style={{ width: '100%', height: '100%', outline: 'none' }}
        />

        <div className="drag-hint" style={{ opacity: interacted ? 0 : 0.9 }}>
          <span>✦</span>
          {view === 0 ? 'drag to rotate · scroll to zoom' : 'drag to browse · scroll to zoom'}
        </div>
      </div>

      <div className="rail">
        <div className="rail-center" />
        {railItems}
      </div>
    </div>
  );
}
