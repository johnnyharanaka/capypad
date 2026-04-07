import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const CONNECTION_DISTANCE = 1.8

function Network({ count = 60, dark }: { count?: number; dark: boolean }) {
  const pointsRef = useRef<THREE.Points>(null!)
  const linesRef = useRef<THREE.LineSegments>(null!)

  const basePositions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10
      pos[i * 3 + 1] = (Math.random() - 0.5) * 7
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3
    }
    return pos
  }, [count])

  const positions = useMemo(() => new Float32Array(basePositions), [basePositions])

  // Pre-allocate max possible line segments
  const maxLines = count * count
  const linePositions = useMemo(() => new Float32Array(maxLines * 6), [maxLines])
  const lineColors = useMemo(() => new Float32Array(maxLines * 6), [maxLines])

  const color = dark ? [0.65, 0.55, 0.98] : [0.66, 0.33, 0.97]

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // Animate points
    const posAttr = pointsRef.current.geometry.getAttribute('position')
    for (let i = 0; i < count; i++) {
      const ix = i * 3
      posAttr.array[ix] = basePositions[ix] + Math.sin(t * 0.2 + i * 1.2) * 0.4
      posAttr.array[ix + 1] = basePositions[ix + 1] + Math.cos(t * 0.15 + i * 0.8) * 0.4
      posAttr.array[ix + 2] = basePositions[ix + 2] + Math.sin(t * 0.1 + i * 0.5) * 0.2
    }
    posAttr.needsUpdate = true

    // Build connections
    let lineIdx = 0
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const ix = i * 3, jx = j * 3
        const dx = posAttr.array[ix] - posAttr.array[jx]
        const dy = posAttr.array[ix + 1] - posAttr.array[jx + 1]
        const dz = posAttr.array[ix + 2] - posAttr.array[jx + 2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist < CONNECTION_DISTANCE) {
          const alpha = 1 - dist / CONNECTION_DISTANCE
          const li = lineIdx * 6

          linePositions[li] = posAttr.array[ix]
          linePositions[li + 1] = posAttr.array[ix + 1]
          linePositions[li + 2] = posAttr.array[ix + 2]
          linePositions[li + 3] = posAttr.array[jx]
          linePositions[li + 4] = posAttr.array[jx + 1]
          linePositions[li + 5] = posAttr.array[jx + 2]

          lineColors[li] = color[0]
          lineColors[li + 1] = color[1]
          lineColors[li + 2] = color[2]
          lineColors[li + 3] = color[0]
          lineColors[li + 4] = color[1]
          lineColors[li + 5] = color[2]

          // Fade alpha via color intensity
          for (let k = 0; k < 6; k++) {
            lineColors[li + k] *= alpha * 0.5
          }

          lineIdx++
        }
      }
    }

    // Zero out unused lines
    for (let i = lineIdx * 6; i < linePositions.length; i++) {
      linePositions[i] = 0
      lineColors[i] = 0
    }

    const lineGeo = linesRef.current.geometry
    lineGeo.getAttribute('position').needsUpdate = true
    lineGeo.getAttribute('color').needsUpdate = true
    lineGeo.setDrawRange(0, lineIdx * 2)
  })

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={dark ? '#a78bfa' : '#a855f7'}
          size={0.06}
          transparent
          opacity={dark ? 0.8 : 0.6}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[lineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={dark ? 0.6 : 0.4} depthWrite={false} />
      </lineSegments>
    </>
  )
}

export default function Background({ dark }: { dark: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', pointerEvents: 'none' }}
        eventSource={undefined as any}
        events={() => ({ enabled: false, priority: 0, compute: () => {} } as any)}
      >
        <Network dark={dark} />
      </Canvas>
    </div>
  )
}
