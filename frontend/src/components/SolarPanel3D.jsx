import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// Volumetric Sunbeam component that points from a light source to a target using a Fresnel shader
const RayBeam = ({ from, to, intensity, radiusBottom = 0.3, radiusTop = 3.5, opacityScale = 0.25, powFactor = 2.0 }) => {
  const groupRef = useRef();
  
  // Update rotation to face the target on every frame, ensuring perfect tracking of the moving sun
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.lookAt(new THREE.Vector3(...to));
    }
  });

  const distance = useMemo(() => {
    const vFrom = new THREE.Vector3(...from);
    const vTo = new THREE.Vector3(...to);
    return vFrom.distanceTo(vTo);
  }, [from, to]);

  const uniforms = useMemo(() => ({
    color: { value: new THREE.Color("#fef08a") },
    opacity: { value: opacityScale * intensity },
    powFactor: { value: powFactor }
  }), [powFactor]);

  // Update uniforms when intensity changes
  uniforms.opacity.value = opacityScale * intensity;

  return (
    <group ref={groupRef} position={from}>
      {/* Rotate cylinder by 90 degrees on X to align height with local Z-axis (direction of lookAt) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, distance / 2]}>
        <cylinderGeometry args={[radiusTop, radiusBottom, distance, 32, 1, true]} />
        <shaderMaterial 
          vertexShader={`
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              vNormal = normalize(normalMatrix * normal);
              vViewPosition = -mvPosition.xyz;
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={`
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            uniform vec3 color;
            uniform float opacity;
            uniform float powFactor;
            void main() {
              vec3 normal = normalize(vNormal);
              vec3 viewDir = normalize(vViewPosition);
              // Fresnel effect: dot product of normal and view direction
              float dotProduct = abs(dot(normal, viewDir));
              float intensityVal = pow(dotProduct, powFactor);
              gl_FragColor = vec4(color, opacity * intensityVal);
            }
          `}
          uniforms={uniforms}
          transparent 
          side={THREE.DoubleSide} 
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

const SolarPanel = ({ temp, hasFins }) => {
  const materialRef = useRef();
  
  // Base colors
  const baseColor = useMemo(() => new THREE.Color("#101c3c"), []); // Dark PV navy blue
  const hotColor = useMemo(() => new THREE.Color("#dc2626"), []);  // Hot red
  const currentTempRef = useRef(25);

  useFrame(() => {
    if (materialRef.current) {
      // Smoothly interpolate temperature to avoid color jumps
      currentTempRef.current += (temp - currentTempRef.current) * 0.05;
      
      // Calculate lerp factor (0 at 25°C, 1 at 55°C)
      const t = Math.max(0, Math.min(1, (currentTempRef.current - 25) / 30));
      
      // Interpolate PV cell color
      materialRef.current.color.lerpColors(baseColor, hotColor, t);
    }
  });

  return (
    <group rotation={[0.25, 0, 0]}>
      {/* 1. Aluminum Frame (Silver borders) */}
      {/* Left border */}
      <mesh position={[-1.52, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.08, 2.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Right border */}
      <mesh position={[1.52, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.08, 2.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Top border */}
      <mesh position={[0, 0, -1.02]} castShadow receiveShadow>
        <boxGeometry args={[3.08, 0.08, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Bottom border */}
      <mesh position={[0, 0, 1.02]} castShadow receiveShadow>
        <boxGeometry args={[3.08, 0.08, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
      </mesh>
      
      {/* Backing sheet */}
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[3.0, 0.02, 2.0]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* 2. PV Silicon Cells Active Surface */}
      <mesh position={[0, 0.01, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.0, 0.03, 2.0]} />
        <meshStandardMaterial ref={materialRef} color="#101c3c" metalness={0.85} roughness={0.1} />
      </mesh>

      {/* 3. Photovoltaic Grid lines (Silver solder wires) */}
      {/* Vertical lines */}
      {[-1.0, -0.5, 0, 0.5, 1.0].map((x, i) => (
        <mesh key={`v-${i}`} position={[x, 0.026, 0]}>
          <boxGeometry args={[0.008, 0.002, 1.98]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* Horizontal lines */}
      {[-0.66, -0.33, 0, 0.33, 0.66].map((z, i) => (
        <mesh key={`h-${i}`} position={[0, 0.026, z]}>
          <boxGeometry args={[2.98, 0.002, 0.008]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* 4. Passive Cooling Fins (Underside heatsink) */}
      {hasFins && (
        <group position={[0, -0.1, 0]}>
          {[-1.4, -1.2, -1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4].map((x, i) => (
            <mesh key={`fin-${i}`} position={[x, 0, 0]} castShadow>
              <boxGeometry args={[0.015, 0.12, 1.94]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.1} />
            </mesh>
          ))}
          {/* Support crossbar connecting the fins */}
          <mesh position={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[2.9, 0.02, 0.1]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
        </group>
      )}

      {/* 5. Support Stand & Legs */}
      {/* Back legs (Taller) */}
      {[-1.3, 1.3].map((x, i) => (
        <mesh key={`bl-${i}`} position={[x, -0.55, -0.7]} rotation={[-0.25, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 1.0]} />
          <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {/* Front legs (Shorter) */}
      {[-1.3, 1.3].map((x, i) => (
        <mesh key={`fl-${i}`} position={[x, -0.32, 0.7]} rotation={[-0.25, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.54]} />
          <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {/* Base mounting pads */}
      {[-1.3, 1.3].map((x, i) => (
        <group key={`pad-${i}`}>
          <mesh position={[x, -1.04, -0.7]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.1, 0.01, 0.1]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[x, -0.58, 0.7]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.1, 0.01, 0.1]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </group>
      ))}

      {/* 6. Panel Description HUD */}
      <Html position={[0, 0.15, -1.15]} center distanceFactor={7}>
        <div className={`px-2 py-0.5 text-[8px] font-bold font-sans uppercase tracking-widest rounded-lg border shadow-lg whitespace-nowrap flex items-center gap-1 ${hasFins ? 'bg-indigo-950/95 text-indigo-300 border-indigo-500/50' : 'bg-slate-950/95 text-slate-300 border-slate-800'}`}>
          {hasFins ? (
            <>
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></span>
              Cooled
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
              Normal
            </>
          )}
        </div>
      </Html>
    </group>
  );
};

export default function SolarPanel3D({ temp = 25, cooledTemp = 25, cloudCover = 0, sunAngle = 90 }) {
  // Lighting scales with cloud cover (0% cloud = bright sun, 100% cloud = dim)
  const sunIntensity = 2.2 * (1 - (cloudCover / 100)) + 0.3;
  // Settle at a minimum of 40% intensity even under full cloud cover so sunbeams are always visible
  const rayIntensity = 0.6 * (1 - (cloudCover / 100)) + 0.4;

  // Symmetrical Sun position relative to both panels calculated using sunAngle (sunrise to sunset orbit)
  const sunPosition = useMemo(() => {
    const radAngle = (sunAngle * Math.PI) / 180;
    const sunR = 8.0;
    const sunX = Math.cos(radAngle) * sunR;
    const sunY = Math.sin(radAngle) * sunR;
    const sunZ = 1.5; // Slightly forward depth for visual representation
    return [sunX, sunY, sunZ];
  }, [sunAngle]);

  // Centers of the two panels in world space (positioned closer together at x = -1.25 and x = 1.25 for guaranteed screen visibility)
  const normalPanelCenter = [-1.25, 0.3, 0];
  const cooledPanelCenter = [1.25, 0.3, 0];

  return (
    <div className="w-full h-full min-h-[380px] cursor-grab active:cursor-grabbing">
      <Canvas shadows camera={{ position: [0, 3.2, 5.2], fov: 45 }}>
        <ambientLight intensity={0.35} />
        
        {/* Symmetrical Directional Sun Light */}
        <directionalLight 
          position={sunPosition} 
          intensity={sunIntensity} 
          castShadow 
          shadow-mapSize-width={1024} 
          shadow-mapSize-height={1024} 
          shadow-bias={-0.001}
        />

        {/* 3D Visual glowing Sun core */}
        <mesh position={sunPosition}>
          <sphereGeometry args={[0.3, 32, 32]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>

        {/* Dynamic Sun corona glow */}
        <mesh position={sunPosition}>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshBasicMaterial 
            color="#f59e0b" 
            transparent 
            opacity={0.35 * rayIntensity} 
            blending={THREE.AdditiveBlending} 
          />
        </mesh>

        {/* Symmetrical Dual-Layered Volumetric Sunbeam covering both panels from the single Sun */}
        {rayIntensity > 0.05 && (
          <group>
            {/* Outer soft light shaft */}
            <RayBeam 
              from={sunPosition} 
              to={[0, 0.3, 0]} 
              intensity={rayIntensity} 
              radiusBottom={0.3} 
              radiusTop={3.5} 
              opacityScale={0.12} 
              powFactor={1.5}
            />
            {/* Inner hot core beam */}
            <RayBeam 
              from={sunPosition} 
              to={[0, 0.3, 0]} 
              intensity={rayIntensity} 
              radiusBottom={0.15} 
              radiusTop={2.2} 
              opacityScale={0.18} 
              powFactor={2.5}
            />
          </group>
        )}
        
        {/* Render both panels side-by-side */}
        {/* Normal Panel on the left */}
        <group position={normalPanelCenter}>
          <SolarPanel temp={temp} hasFins={false} />
        </group>

        {/* Fin-Cooled Panel on the right */}
        <group position={cooledPanelCenter}>
          <SolarPanel temp={cooledTemp} hasFins={true} />
        </group>
        
        <OrbitControls 
          enablePan={false}
          minDistance={3.5}
          maxDistance={9}
          maxPolarAngle={Math.PI / 2 - 0.05} // Keep camera above ground
        />
        
        {/* Ground grid/plane */}
        <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
        
        <gridHelper args={[20, 20, '#475569', '#334155']} position={[0, -0.59, 0]} />
      </Canvas>
    </div>
  );
}
