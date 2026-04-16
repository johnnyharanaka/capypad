import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const CONNECTION_DISTANCE = 1.8

function Network({ count = 60, dark }: { count?: number; dark: boolean }) {
  const pointsRef = useRef<THREE.Points>(null!)
  const linesRef = useRef<THREE.LineSegments>(null!)

  const [basePositions] = useState(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10
      pos[i * 3 + 1] = (Math.random() - 0.5) * 7
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3
    }
    return pos
  })

  const [positions] = useState(() => new Float32Array(basePositions))

  const maxLines = count * count
  const [linePositions] = useState(() => new Float32Array(maxLines * 6))
  const [lineColors] = useState(() => new Float32Array(maxLines * 6))

  const color = dark ? [0.65, 0.55, 0.98] : [0.66, 0.33, 0.97]

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute
    const posArr = posAttr.array as Float32Array
    for (let i = 0; i < count; i++) {
      const ix = i * 3
      posArr[ix] = basePositions[ix] + Math.sin(t * 0.2 + i * 1.2) * 0.4
      posArr[ix + 1] = basePositions[ix + 1] + Math.cos(t * 0.15 + i * 0.8) * 0.4
      posArr[ix + 2] = basePositions[ix + 2] + Math.sin(t * 0.1 + i * 0.5) * 0.2
    }
    posAttr.needsUpdate = true

    const lineGeo = linesRef.current.geometry
    const linePosAttr = lineGeo.getAttribute('position') as THREE.BufferAttribute
    const lineColorAttr = lineGeo.getAttribute('color') as THREE.BufferAttribute
    const linePosArr = linePosAttr.array as Float32Array
    const lineColorArr = lineColorAttr.array as Float32Array

    let lineIdx = 0
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const ix = i * 3, jx = j * 3
        const dx = posArr[ix] - posArr[jx]
        const dy = posArr[ix + 1] - posArr[jx + 1]
        const dz = posArr[ix + 2] - posArr[jx + 2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist < CONNECTION_DISTANCE) {
          const alpha = 1 - dist / CONNECTION_DISTANCE
          const li = lineIdx * 6

          linePosArr[li] = posArr[ix]
          linePosArr[li + 1] = posArr[ix + 1]
          linePosArr[li + 2] = posArr[ix + 2]
          linePosArr[li + 3] = posArr[jx]
          linePosArr[li + 4] = posArr[jx + 1]
          linePosArr[li + 5] = posArr[jx + 2]

          lineColorArr[li] = color[0]
          lineColorArr[li + 1] = color[1]
          lineColorArr[li + 2] = color[2]
          lineColorArr[li + 3] = color[0]
          lineColorArr[li + 4] = color[1]
          lineColorArr[li + 5] = color[2]

          for (let k = 0; k < 6; k++) {
            lineColorArr[li + k] *= alpha * 0.5
          }

          lineIdx++
        }
      }
    }

    for (let i = lineIdx * 6; i < linePosArr.length; i++) {
      linePosArr[i] = 0
      lineColorArr[i] = 0
    }

    linePosAttr.needsUpdate = true
    lineColorAttr.needsUpdate = true
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
      >
        <Network dark={dark} />
      </Canvas>
    </div>
  )
}
