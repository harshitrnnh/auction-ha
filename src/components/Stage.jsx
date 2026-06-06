import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { getArtworkUrl } from '../data/lotsData';

const clampZoom = (z) => Math.max(0.6, Math.min(2.2, z));

function Tee3DViewer({ lot }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL ?? '';
  const artworkSrc = getArtworkUrl(lot, API_URL);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scale = 1.35;
    const posY = -0.05;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10);
    camera.position.set(0, 0, 0.85);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(2, 4, 3);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-2, 1, 2);
    scene.add(dirLight2);

    // Rim light / Backlight to outline the dark T-shirt edges
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.25);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.3, 10);
    pointLight.position.set(0, 1, 1);
    scene.add(pointLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.4;
    controls.maxDistance = 1.6;
    controls.enablePan = false;
    
    // Restrict vertical rotation to keep T-shirt looking neat
    controls.minPolarAngle = Math.PI / 3;
    controls.maxPolarAngle = Math.PI * 2 / 3;

    let model;
    let animFrame;

    // Load Model
    const loader = new GLTFLoader();
    loader.load(
      '/shirt.glb',
      (gltf) => {
        model = gltf.scene;
        scene.add(model);

        model.position.set(0, posY, 0);
        model.scale.set(scale, scale, scale);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // Matte black material
            child.material = new THREE.MeshStandardMaterial({
              color: 0x121212,
              roughness: 0.85,
              metalness: 0.1,
            });

            // Create a temporary un-transformed mesh to project decals without warp skewing
            const tempMesh = new THREE.Mesh(child.geometry, child.material);
            tempMesh.updateMatrixWorld(true);

            // Decal Projector for Generative Art (Front)
            if (artworkSrc) {
              const textureLoader = new THREE.TextureLoader();
              textureLoader.load(
                artworkSrc,
                (texture) => {
                  texture.colorSpace = THREE.SRGBColorSpace;

                  // Chest is at +Z in local space, projecting along -Z (Euler Y = 0)
                  const decalPosition = new THREE.Vector3(0, 0.04, 0.15);
                  const decalOrientation = new THREE.Euler(0, 0, 0);
                  const decalSize = new THREE.Vector3(0.18, 0.18, 0.18);

                  const decalGeom = new DecalGeometry(tempMesh, decalPosition, decalOrientation, decalSize);
                  const decalMat = new THREE.MeshStandardMaterial({
                    map: texture,
                    transparent: true,
                    roughness: 0.8,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -4,
                  });

                  const decalMesh = new THREE.Mesh(decalGeom, decalMat);
                  child.add(decalMesh);
                  setLoading(false);
                },
                undefined,
                (err) => {
                  console.error('[3D Viewer] Error loading texture:', err);
                  setLoading(false);
                }
              );
            } else {
              setLoading(false);
            }

            // Decal Projector for Logo and Details (Back)
            const logoLoader = new THREE.ImageLoader();
            logoLoader.load(
              '/logo.png',
              (image) => {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');

                // Draw logo in the center-top
                const logoW = 260;
                const logoH = 260;
                ctx.drawImage(image, (512 - logoW) / 2, 70, logoW, logoH);

                // Write text details (Lot No and Date) below logo
                const lotDate = lot?.startsAt 
                  ? new Date(lot.startsAt).toLocaleDateString('en-GB') 
                  : new Date().toLocaleDateString('en-GB');
                const lotNo = lot?.lotNumber != null 
                  ? String(lot.lotNumber).padStart(3, '0') 
                  : (lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

                ctx.font = 'bold 24px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`LOT NO. ${lotNo}`, 256, 380);
                ctx.fillText(`DATE- ${lotDate}`, 256, 420);

                const logoTexture = new THREE.CanvasTexture(canvas);
                logoTexture.colorSpace = THREE.SRGBColorSpace;

                // Back is at -Z in local space, projecting along +Z (Euler Y = Math.PI)
                const backDecalPosition = new THREE.Vector3(0, 0.09, -0.15);
                const backDecalOrientation = new THREE.Euler(0, Math.PI, 0);
                const backDecalSize = new THREE.Vector3(0.09, 0.09, 0.09);

                const backDecalGeom = new DecalGeometry(tempMesh, backDecalPosition, backDecalOrientation, backDecalSize);
                const backDecalMat = new THREE.MeshStandardMaterial({
                  map: logoTexture,
                  transparent: true,
                  roughness: 0.8,
                  depthWrite: false,
                  polygonOffset: true,
                  polygonOffsetFactor: -4,
                });

                const backDecalMesh = new THREE.Mesh(backDecalGeom, backDecalMat);
                child.add(backDecalMesh);
              },
              undefined,
              (err) => console.error('[3D Viewer] Error loading back logo image:', err)
            );
          }
        });
      },
      undefined,
      (err) => {
        console.error('[3D Viewer] Error loading GLB:', err);
        setLoading(false);
      }
    );

    // Animation Loop
    const animate = () => {
      animFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrame);
      renderer.dispose();
      scene.clear();
    };
  }, [artworkSrc]);

  return (
    <div ref={containerRef} className="mockup-slide" style={{ background: 'radial-gradient(circle at 50% 50%, #5c5c66 0%, #16151c 100%)' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />
      {loading && (
        <div className="mockup-artwork-placeholder" style={{ background: 'rgba(12,10,18,0.85)' }}>
          <div className="spinner" />
          <span style={{ marginTop: '14px', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)' }}>
            Loading 3D Canvas...
          </span>
        </div>
      )}
    </div>
  );
}

function Tee2DFrontViewer({ lot, zoom }) {
  const [hovered, setHovered] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL ?? '';
  const artworkSrc = getArtworkUrl(lot, API_URL);

  return (
    <div 
      className="mockup-slide" 
      style={{ background: 'radial-gradient(circle at 50% 50%, #5c5c66 0%, #16151c 100%)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div 
        className="tee-2d-viewer" 
        style={{ 
          transform: hovered ? `scale(${zoom * 2.8})` : `scale(${zoom})`, 
          transformOrigin: '50% 48%', 
          transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)' 
        }}
      >
        <div className="tee-2d-single-col">
          <img src="/tshirt_black_front_png.png" className="tee-2d-shirt" alt="Tshirt Front" />
          {artworkSrc && <img src={artworkSrc} className="tee-2d-artwork" alt="Artwork" />}
          <span className="tee-2d-label" style={{ opacity: hovered ? 0 : 1, transition: 'opacity 0.3s' }}>Front (2D Mock)</span>
        </div>
      </div>
    </div>
  );
}

function Tee2DBackViewer({ lot, zoom }) {
  const [hovered, setHovered] = useState(false);
  const lotDate = lot?.startsAt 
    ? new Date(lot.startsAt).toLocaleDateString('en-GB') 
    : new Date().toLocaleDateString('en-GB');
  const lotNo = lot?.lotNumber != null 
    ? String(lot.lotNumber).padStart(3, '0') 
    : (lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

  return (
    <div 
      className="mockup-slide" 
      style={{ background: 'radial-gradient(circle at 50% 50%, #5c5c66 0%, #16151c 100%)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div 
        className="tee-2d-viewer" 
        style={{ 
          transform: hovered ? `scale(${zoom * 2.8})` : `scale(${zoom})`, 
          transformOrigin: '50% 30%', 
          transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)' 
        }}
      >
        <div className="tee-2d-single-col">
          <img src="/tshirt_black_back_png.png" className="tee-2d-shirt" alt="Tshirt Back" />
          <div className="tee-2d-logo-area">
            <img src="/logo.png" className="tee-2d-logo" alt="Logo" />
            <div className="tee-2d-details">
              <div>Lot No. {lotNo}</div>
              <div>Date- {lotDate}</div>
            </div>
          </div>
          <span className="tee-2d-label" style={{ opacity: hovered ? 0 : 1, transition: 'opacity 0.3s' }}>Back (2D Mock)</span>
        </div>
      </div>
    </div>
  );
}

function ModelSlide({ n, count, zoom }) {
  return (
    <div className="model-card" style={{ transform: `scale(${zoom})` }}>
      <div className="ph-icon">◐</div>
      <span className="ph-big">Model wearing the tee</span>
      <span className="ph-small">Editorial shot {n} / {count}</span>
    </div>
  );
}

export default function Stage({ modelCount = 3, lot }) {
  const total = modelCount + 3; // 1 3D viewer + 2 2D viewers (front, back) + modelCount editorial slides
  const [view, setView] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [interacted, setInteracted] = useState(false);
  const [swipeDX, setSwipeDX] = useState(0);
  const swipe = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const goTo = (n) => { setView(n); setZoom(1); setInteracted(false); };
  const go = (d) => goTo(Math.max(0, Math.min(total - 1, view + d)));

  const onDown = (e) => {
    const p = e.touches ? e.touches[0] : e;
    // Let OrbitControls handle touch/drag on Slide 0 (3D Viewer)
    if (viewRef.current === 0) return;
    setInteracted(true);
    swipe.current = { x: p.clientX, dx: 0 };
  };

  useEffect(() => {
    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      if (swipe.current) {
        swipe.current.dx = p.clientX - swipe.current.x;
        setSwipeDX(swipe.current.dx);
      }
    };
    const onUp = () => {
      if (swipe.current) {
        const dx = swipe.current.dx;
        if (dx < -55) go(1); else if (dx > 55) go(-1);
        swipe.current = null;
        setSwipeDX(0);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const onWheel = (e) => {
    // Only zoom in viewer if it's not the 3D model (OrbitControls handles 3D zoom internally)
    if (viewRef.current === 0) return;
    setInteracted(true);
    setZoom((z) => clampZoom(z - e.deltaY * 0.0014));
  };
  const bumpZoom = (d) => {
    if (viewRef.current === 0) return; // Controls handled by orbit controls
    setInteracted(true);
    setZoom((z) => clampZoom(z + d));
  };
  const reset = () => { setZoom(1); setInteracted(false); };

  const STEP = 108;

  return (
    <div className="stage">
      <div className="stage-floor">
        <div className="spotlight" />
        <div className="floor-pool" />
        <div className="vignette" />
      </div>

      <div
        className="canvas"
        onMouseDown={onDown}
        onTouchStart={onDown}
        onWheel={onWheel}
        style={{ cursor: view === 0 ? 'grab' : (swipe.current ? 'grabbing' : 'grab') }}
      >
        <div className="carousel-track">
          {Array.from({ length: total }).map((_, i) => {
            const rel = i - view;
            const base = rel * STEP + (swipe.current ? swipeDX / 7 : 0);
            const center = i === view;
            return (
              <div
                key={i}
                className={'slide' + (center ? '' : ' bg-slide')}
                onMouseDown={!center ? (e) => e.stopPropagation() : undefined}
                onClick={!center ? () => goTo(i) : undefined}
                style={{
                  transform: `translateX(${base}%) scale(${center ? 1 : 0.75}) rotateY(${rel * -7}deg)`,
                  opacity: Math.abs(rel) > 1 ? 0 : center ? 1 : undefined,
                  zIndex: 10 - Math.abs(rel),
                  transition: swipe.current ? 'none' : undefined,
                }}
              >
                {i === 0 ? (
                  <Tee3DViewer lot={lot} />
                ) : i === 1 ? (
                  <Tee2DFrontViewer lot={lot} zoom={zoom} />
                ) : i === 2 ? (
                  <Tee2DBackViewer lot={lot} zoom={zoom} />
                ) : (
                  <ModelSlide n={i - 2} count={modelCount} zoom={zoom} />
                )}
              </div>
            );
          })}
        </div>

        <div className="drag-hint" style={{ opacity: interacted ? 0 : 0.9 }}>
          <span>✦</span> {view === 0 ? 'drag to rotate 3D shirt · scroll to zoom' : 'drag to swipe · scroll to zoom'}
        </div>

        <div className="zoom-controls" onMouseDown={(e) => e.stopPropagation()}>
          <button className="zoom-btn" onClick={() => bumpZoom(0.25)} aria-label="Zoom in">+</button>
          <button className="zoom-btn" onClick={() => bumpZoom(-0.25)} aria-label="Zoom out">−</button>
          <button className="zoom-btn small" onClick={reset} aria-label="Reset view">⟳</button>
        </div>
      </div>

      <div className="rail">
        <button className="rail-nav" onClick={() => go(-1)} disabled={view === 0} aria-label="Previous">‹</button>
        
        {/* 3D Viewer Thumb */}
        <button className={'thumb' + (view === 0 ? ' on' : '')} onClick={() => goTo(0)}>
          <div className="tball" />
          <span className="badge">3D</span>
        </button>

        {/* 2D Front Viewer Thumb */}
        <button className={'thumb' + (view === 1 ? ' on' : '')} onClick={() => goTo(1)}>
          <div className="tball flat" style={{ borderRadius: '4px' }} />
          <span className="badge">2D F</span>
        </button>

        {/* 2D Back Viewer Thumb */}
        <button className={'thumb' + (view === 2 ? ' on' : '')} onClick={() => goTo(2)}>
          <div className="tball flat" style={{ borderRadius: '4px' }} />
          <span className="badge">2D B</span>
        </button>

        {/* Model thumbs */}
        {Array.from({ length: modelCount }).map((_, i) => (
          <button
            key={i}
            className={'thumb model-thumb' + (view === i + 3 ? ' on' : '')}
            onClick={() => goTo(i + 3)}
          >
            <span className="tlabel">0{i + 1}</span>
          </button>
        ))}

        <button className="rail-nav" onClick={() => go(1)} disabled={view === total - 1} aria-label="Next">›</button>
      </div>
    </div>
  );
}
