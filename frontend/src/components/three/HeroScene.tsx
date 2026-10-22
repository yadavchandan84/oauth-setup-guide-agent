import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox, Line, Sparkles, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { useInView } from '../../lib/useInView';

const CHIP_COLORS = [
  '#24292F', // github
  '#4A154B', // slack
  '#635BFF', // stripe
  '#5865F2', // discord
  '#0052CC', // jira
  '#2EB67D', // notion-ish
  '#F24E1E', // figma
  '#EA4335', // google
];

function Chips() {
  const group = useRef<THREE.Group>(null);
  const chips = useMemo(
    () =>
      CHIP_COLORS.map((color, i) => ({
        color,
        radius: i % 2 === 0 ? 2.6 : 3.3,
        tilt: i % 2 === 0 ? 0.35 : -0.5,
        speed: 0.25 + (i % 3) * 0.08,
        phase: (i / CHIP_COLORS.length) * Math.PI * 2,
      })),
    [],
  );
  const refs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame((_, delta) => {
    chips.forEach((chip, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      chip.phase += delta * chip.speed;
      const x = Math.cos(chip.phase) * chip.radius;
      const z = Math.sin(chip.phase) * chip.radius;
      const y = Math.sin(chip.phase) * chip.radius * chip.tilt;
      mesh.position.set(x, y, z);
      mesh.rotation.y += delta * 0.4;
    });
  });

  return (
    <group ref={group}>
      {chips.map((chip, i) => (
        <group key={i}>
          <RoundedBox
            ref={(el: THREE.Mesh | null) => {
              refs.current[i] = el;
            }}
            args={[0.55, 0.55, 0.12]}
            radius={0.08}
          >
            <meshStandardMaterial color={chip.color} metalness={0.3} roughness={0.25} />
          </RoundedBox>
        </group>
      ))}
      <ChipLines refs={refs} count={chips.length} />
    </group>
  );
}

function ChipLines({
  refs,
  count,
}: {
  refs: React.MutableRefObject<Array<THREE.Mesh | null>>;
  count: number;
}) {
  const lineRefs = useRef<Array<{ setPoints?: (p: THREE.Vector3[]) => void } | null>>([]);
  useFrame(() => {
    for (let i = 0; i < count; i++) {
      const mesh = refs.current[i];
      const line = lineRefs.current[i] as unknown as { material?: { dashOffset: number } } | null;
      if (line?.material) line.material.dashOffset -= 0.01;
      void mesh;
    }
  });
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <AnimatedLine key={i} source={refs} index={i} />
      ))}
    </>
  );
}

function AnimatedLine({
  source,
  index,
}: {
  source: React.MutableRefObject<Array<THREE.Mesh | null>>;
  index: number;
}) {
  const lineRef = useRef<THREE.Group>(null);
  const points = useRef<[number, number, number][]>([
    [0, 0, 0],
    [0, 0, 0],
  ]);
  const vec = useRef(new THREE.Vector3());
  const Comp = Line as unknown as (props: Record<string, unknown>) => JSX.Element;
  useFrame(() => {
    const mesh = source.current[index];
    if (!mesh) return;
    vec.current.copy(mesh.position);
    points.current = [
      [vec.current.x, vec.current.y, vec.current.z],
      [0, 0, 0],
    ];
  });
  return (
    <group ref={lineRef}>
      <Comp
        points={points.current}
        color="#8b5cf6"
        lineWidth={1}
        dashed
        dashScale={2}
        transparent
        opacity={0.5}
      />
    </group>
  );
}

function Vault() {
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.6}>
      <mesh>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshPhysicalMaterial
          transmission={1}
          thickness={1.5}
          roughness={0.12}
          ior={1.45}
          clearcoat={1}
          attenuationColor={new THREE.Color('#6366f1')}
          attenuationDistance={2}
          color="#c7d2fe"
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.45, 32, 32]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive={new THREE.Color('#22d3ee')}
          emissiveIntensity={2}
        />
      </mesh>
    </Float>
  );
}

function CameraRig() {
  useFrame((state) => {
    const { camera, pointer } = state;
    camera.position.x += (pointer.x * 0.4 - camera.position.x) * 0.05;
    camera.position.y += (pointer.y * 0.4 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene() {
  const [ref, inView] = useInView<HTMLDivElement>();

  const onLost = (e: Event) => {
    e.preventDefault();
  };

  return (
    <div ref={ref} className="h-full w-full">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 7], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        frameloop={inView ? 'always' : 'never'}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', onLost);
        }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[4, 5, 3]} intensity={1.1} />
        <Vault />
        <Chips />
        <Sparkles count={70} scale={9} size={2} speed={0.3} opacity={0.6} />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={3} position={[0, 4, 2]} scale={6} />
          <Lightformer form="rect" intensity={2} position={[-4, -2, 1]} scale={4} color="#818cf8" />
          <Lightformer form="rect" intensity={4} position={[4, 0, 2]} scale={4} color="#22d3ee" />
        </Environment>
        <CameraRig />
      </Canvas>
    </div>
  );
}
