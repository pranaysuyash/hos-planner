import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CorridorItineraryPlan } from '../engine/types';

interface Realtime3DCorridorProps {
  plan: CorridorItineraryPlan;
  activeTimeHours: number;
  onTimeChange: (hours: number) => void;
}

export const Realtime3DCorridor: React.FC<Realtime3DCorridorProps> = ({
  plan,
  activeTimeHours,
  onTimeChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [followTruck, setFollowTruck] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const truckRef = useRef<THREE.Group | null>(null);
  const curveRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ theta: Math.PI / 4, phi: Math.atan(1 / Math.SQRT2) });
  const radiusRef = useRef(75);

  // Total transit duration
  const totalHours = Math.max(1, plan.totalTransitHours);
  const progressRatio = Math.max(0, Math.min(1, activeTimeHours / totalHours));

  // Initialize Three.js WebGL Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 880;
    const height = 400;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.012);

    // 2. Isometric Orthographic Camera
    const aspect = width / height;
    const d = 34;
    const camera = new THREE.OrthographicCamera(
      -d * aspect,
      d * aspect,
      d,
      -d,
      1,
      1000
    );
    cameraRef.current = camera;

    const updateCameraPosition = () => {
      const r = radiusRef.current;
      const x = r * Math.sin(rotRef.current.phi) * Math.cos(rotRef.current.theta);
      const y = r * Math.cos(rotRef.current.phi);
      const z = r * Math.sin(rotRef.current.phi) * Math.sin(rotRef.current.theta);
      camera.position.set(x, y + 8, z);
      camera.lookAt(0, 0, 0);
    };
    updateCameraPosition();

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight.position.set(40, 60, 30);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const purpleLight = new THREE.DirectionalLight(0xc084fc, 0.8);
    purpleLight.position.set(-40, 30, -30);
    scene.add(purpleLight);

    // 5. Holographic Cyber Terrain Grid
    const grid = new THREE.GridHelper(160, 32, 0x38bdf8, 0x1e293b);
    grid.position.y = -0.1;
    scene.add(grid);

    // 6. Generate 3D S-Curve Interstate Highway Ribbon
    const curvePoints = [
      new THREE.Vector3(-45, 0, -25), // Origin (e.g. Chicago)
      new THREE.Vector3(-25, 0, -15),
      new THREE.Vector3(-8, 0, -2),   // 30m Break stop
      new THREE.Vector3(10, 0, 8),    // 10h Sleeper Layover
      new THREE.Vector3(28, 0, 18),
      new THREE.Vector3(45, 0, 25),   // Destination (e.g. Dallas)
    ];

    const highwayCurve = new THREE.CatmullRomCurve3(curvePoints);
    curveRef.current = highwayCurve;

    // Tube Highway Geometry
    const tubeGeo = new THREE.TubeGeometry(highwayCurve, 120, 2.2, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.4,
    });
    const highwayMesh = new THREE.Mesh(tubeGeo, tubeMat);
    highwayMesh.scale.set(1, 0.15, 1); // Flatten into a ribbon
    highwayMesh.receiveShadow = true;
    scene.add(highwayMesh);

    // Highway Glowing Edge Lines
    const edgePoints = highwayCurve.getPoints(120);
    const edgeGeoL = new THREE.BufferGeometry().setFromPoints(
      edgePoints.map(p => new THREE.Vector3(p.x, 0.2, p.z - 1.2))
    );
    const edgeGeoR = new THREE.BufferGeometry().setFromPoints(
      edgePoints.map(p => new THREE.Vector3(p.x, 0.2, p.z + 1.2))
    );
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
    scene.add(new THREE.Line(edgeGeoL, edgeMat));
    scene.add(new THREE.Line(edgeGeoR, edgeMat));

    // 7. Interactive 3D Waypoint Beacons along the corridor
    const beaconGroup = new THREE.Group();
    scene.add(beaconGroup);

    const waypointsCount = plan.waypoints.length;
    plan.waypoints.forEach((wp, idx) => {
      const t = idx / Math.max(1, waypointsCount - 1);
      const pos = highwayCurve.getPointAt(t);

      const beacon = new THREE.Group();
      beacon.position.set(pos.x, 0, pos.z);

      let beaconColor = 0x38bdf8;
      if (wp.type === 'MANDATORY_30M_BREAK') beaconColor = 0xfbbf24;
      else if (wp.type === 'SLEEPER_10H_REST') beaconColor = 0xc084fc;
      else if (wp.type === 'DESTINATION_DROPOFF') beaconColor = 0x34d399;

      // Vertical Laser Light Beam
      const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 16, 12);
      const beamMat = new THREE.MeshBasicMaterial({
        color: beaconColor,
        transparent: true,
        opacity: 0.6,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 8;
      beacon.add(beam);

      // Rotating beacon ring
      const ringGeo = new THREE.RingGeometry(1.2, 1.6, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: beaconColor, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.2;
      beacon.add(ring);

      // Sphere beacon head
      const sphereGeo = new THREE.SphereGeometry(0.8, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: beaconColor,
        emissive: beaconColor,
        emissiveIntensity: 0.5,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.y = 16;
      beacon.add(sphere);

      beaconGroup.add(beacon);
    });

    // 8. 3D Miniature Commercial Semi-Truck
    const truck = new THREE.Group();
    truckRef.current = truck;

    // Cab
    const cabGeo = new THREE.BoxGeometry(2.4, 2.0, 1.6);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3, metalness: 0.7 });
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 1.2, 0.8);
    cab.castShadow = true;
    truck.add(cab);

    // 53ft Trailer Box
    const trailerGeo = new THREE.BoxGeometry(2.4, 2.6, 6.4);
    const trailerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.3 });
    const trailer = new THREE.Mesh(trailerGeo, trailerMat);
    trailer.position.set(0, 1.5, -3.2);
    trailer.castShadow = true;
    truck.add(trailer);

    // Headlights (Spot beams)
    const headlightR = new THREE.SpotLight(0xffffff, 4, 25, Math.PI / 6, 0.4);
    headlightR.position.set(0.8, 1.0, 1.8);
    headlightR.target.position.set(0.8, 0, 12);
    truck.add(headlightR);
    truck.add(headlightR.target);

    const headlightL = new THREE.SpotLight(0xffffff, 4, 25, Math.PI / 6, 0.4);
    headlightL.position.set(-0.8, 1.0, 1.8);
    headlightL.target.position.set(-0.8, 0, 12);
    truck.add(headlightL);
    truck.add(headlightL.target);

    // Truck ground cyan underglow
    const truckGlow = new THREE.PointLight(0x38bdf8, 2.0, 12);
    truckGlow.position.set(0, 0.5, 0);
    truck.add(truckGlow);

    scene.add(truck);

    // 9. Mouse Orbit Controls
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      rotRef.current.theta -= dx * 0.008;
      rotRef.current.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, rotRef.current.phi - dy * 0.008));
      updateCameraPosition();
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radiusRef.current = Math.max(30, Math.min(120, radiusRef.current + e.deltaY * 0.05));
      updateCameraPosition();
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // 10. Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Pulse beacon rings
      beaconGroup.children.forEach((b, i) => {
        b.rotation.y += 0.02 + i * 0.005;
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = 400;
      const asp = w / h;
      cameraRef.current.left = -d * asp;
      cameraRef.current.right = d * asp;
      cameraRef.current.top = d;
      cameraRef.current.bottom = -d;
      cameraRef.current.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [plan]);

  // Update Truck Position along Highway Curve based on Active Timeline Scrub
  useEffect(() => {
    if (!truckRef.current || !curveRef.current) return;

    const curve = curveRef.current;
    const t = Math.max(0, Math.min(0.999, progressRatio));
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);

    truckRef.current.position.set(pos.x, 0.1, pos.z);

    // Orient truck along tangent vector
    const angle = Math.atan2(tangent.x, tangent.z);
    truckRef.current.rotation.y = angle;

    // Follow Camera mode
    if (followTruck && cameraRef.current) {
      cameraRef.current.position.set(pos.x + 25, 25, pos.z + 25);
      cameraRef.current.lookAt(pos.x, 0, pos.z);
    }
  }, [progressRatio, followTruck]);

  // Autoplay playback loop for timeline simulation
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const next = activeTimeHours + 0.4;
      if (next >= totalHours) {
        setIsPlaying(false);
        onTimeChange(totalHours);
      } else {
        onTimeChange(Number(next.toFixed(1)));
      }
    }, 60);

    return () => clearInterval(interval);
  }, [isPlaying, activeTimeHours, totalHours, onTimeChange]);

  const snapIsometric = () => {
    rotRef.current = { theta: Math.PI / 4, phi: Math.atan(1 / Math.SQRT2) };
    radiusRef.current = 75;
    if (cameraRef.current) {
      const r = radiusRef.current;
      const x = r * Math.sin(rotRef.current.phi) * Math.cos(rotRef.current.theta);
      const y = r * Math.cos(rotRef.current.phi);
      const z = r * Math.sin(rotRef.current.phi) * Math.sin(rotRef.current.theta);
      cameraRef.current.position.set(x, y + 8, z);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 24, padding: 18, background: '#0b1120', border: '1px solid #1e293b' }}>
      {/* 3D Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="hud-tag">REALTIME 3D ISOMETRIC INTERSTATE CORRIDOR</span>
          <span className="live-pulse" />
          <span className="mono" style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>
            {plan.origin} &rarr; {plan.destination} ({plan.totalDistanceMiles} MILES)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={snapIsometric}
            title="Snap to CAD Isometric Angle"
          >
            Isometric Lock
          </button>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 11, padding: '4px 10px', color: followTruck ? '#38bdf8' : '#cbd5e1' }}
            onClick={() => setFollowTruck(f => !f)}
            title="Lock camera tracking directly onto the truck"
          >
            {followTruck ? 'Free Camera' : 'Track Truck'}
          </button>
          <button
            type="button"
            className="btn primary"
            style={{ fontSize: 11, padding: '4px 12px' }}
            onClick={() => {
              if (activeTimeHours >= totalHours) onTimeChange(0);
              setIsPlaying(p => !p);
            }}
          >
            {isPlaying ? 'Pause Scrub' : 'Play Transit Simulation'}
          </button>
        </div>
      </div>

      {/* Three.js Canvas */}
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: 400,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #1e293b',
          background: '#070b14',
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
        }}
      />

      {/* Interactive Transit Time Scrubbing Slider */}
      <div style={{ marginTop: 14, padding: '12px 16px', background: '#070b14', borderRadius: 8, border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            FMCSA Corridor Transit Scrubbing: <strong className="mono" style={{ color: '#38bdf8' }}>T+{activeTimeHours.toFixed(1)} Hours</strong> / {totalHours}h
          </span>
          <span className="mono" style={{ color: '#34d399', fontWeight: 700 }}>
            {Math.round(progressRatio * 100)}% Transit Completed
          </span>
        </div>
        <input
          type="range"
          aria-label="Corridor transit simulation scrub time in hours"
          min="0"
          max={totalHours}
          step="0.1"
          value={activeTimeHours}
          onChange={e => onTimeChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#38bdf8', cursor: 'ew-resize' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
          <span>DEPARTURE ({plan.origin})</span>
          <span>10H SLEEPER / 30M REST BEACONS</span>
          <span>ARRIVAL ETA ({plan.destination})</span>
        </div>
      </div>
    </div>
  );
};
