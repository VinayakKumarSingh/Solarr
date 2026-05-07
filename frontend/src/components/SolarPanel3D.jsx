import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const SolarPanel = ({ temp }) => {
  const materialRef = useRef();
  
  // Base colors
  const coldColor = useMemo(() => new THREE.Color("#1e3a8a"), []); // Deep Blue (<= 25C)
  const hotColor = useMemo(() => new THREE.Color("#ef4444"), []);  // Bright Red (> 50C)

  useFrame(() => {
    if (materialRef.current) {
      // Calculate lerp factor t (0 at 25C, 1 at 50C)
      const t = Math.max(0, Math.min(1, (temp - 25) / 25));
      
      // Interpolate color smoothly
      materialRef.current.color.lerpColors(coldColor, hotColor, t);
    }
  });

  return (
    <mesh castShadow receiveShadow position={[0, 0, 0]}>
      {/* width: 4, height: 0.2, depth: 3 */}
      <boxGeometry args={[4, 0.2, 3]} />
      {/* Start with deep blue */}
      <meshStandardMaterial ref={materialRef} color="#1e3a8a" metalness={0.5} roughness={0.2} />
    </mesh>
  );
};

export default function SolarPanel3D({ temp = 25, cloudCover = 0 }) {
  // Lighting scales with cloud cover (0% cloud = bright sun, 100% cloud = dim)
  // Max intensity: 2.5, Min intensity: 0.5
  const sunIntensity = 2.0 * (1 - (cloudCover / 100)) + 0.5;

  return (
    <div className="w-full h-full min-h-[300px] cursor-grab active:cursor-grabbing">
      <Canvas shadows camera={{ position: [0, 4, 6], fov: 50 }}>
        <ambientLight intensity={0.4} />
        
        <directionalLight 
          position={[5, 10, 5]} 
          intensity={sunIntensity} 
          castShadow 
          shadow-mapSize-width={1024} 
          shadow-mapSize-height={1024} 
        />
        
        <SolarPanel temp={temp} />
        
        <OrbitControls 
          enablePan={false}
          minDistance={3}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2 - 0.05} // Keep camera above ground
        />
        
        {/* Simple Ground Plane for shadows */}
        <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </Canvas>
    </div>
  );
}
