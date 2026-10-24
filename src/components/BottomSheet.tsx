import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

export type BottomSheetSnapPoint = 25 | 50 | 80 | 90

type BottomSheetProps = {
  children: ReactNode
  snapPoint: BottomSheetSnapPoint
  onSnapChange: (snapPoint: BottomSheetSnapPoint) => void
  theme?: 'dark' | 'light'
  fitToSnap?: boolean
}

const SNAP_POINTS: BottomSheetSnapPoint[] = [25, 50, 80, 90]

export function BottomSheet({ children, snapPoint, onSnapChange, theme = 'dark', fitToSnap = false }: BottomSheetProps) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStartRef = useRef<{ y: number; height: number } | null>(null)
  const isDark = theme === 'dark'
  const surface = isDark ? '#121212' : '#ffffff'
  const text = isDark ? '#ffffff' : '#000000'
  const border = isDark ? '#383838' : '#e5e5e5'
  const handle = isDark ? '#666666' : '#c7c7c7'

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStartRef.current = {
      y: event.clientY,
      height: dragHeight ?? snapPoint,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    const delta = dragStartRef.current.y - event.clientY
    const height = Math.max(25, Math.min(90, dragStartRef.current.height + delta / window.innerHeight * 100))
    setDragHeight(height)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    const delta = dragStartRef.current.y - event.clientY
    const height = Math.max(25, Math.min(90, dragStartRef.current.height + delta / window.innerHeight * 100))
    const nearestSnap = SNAP_POINTS.reduce((closest, point) =>
      Math.abs(point - height) < Math.abs(closest - height) ? point : closest,
    SNAP_POINTS[0])
    dragStartRef.current = null
    setDragHeight(null)
    onSnapChange(nearestSnap)
  }

  function onPointerCancel() {
    dragStartRef.current = null
    setDragHeight(null)
  }

  const height = dragHeight ?? snapPoint
  const translateY = 90 - height

  return (
    <section
      className={`uber-bottom-sheet uber-bottom-sheet--${theme}`}
      style={{
        position: 'absolute',
        inset: 'auto 0 0',
        zIndex: 60,
        height: fitToSnap ? `${height}dvh` : '90dvh',
        transform: fitToSnap ? 'none' : `translateY(${translateY}dvh)`,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: surface,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: '28px 28px 0 0',
        boxShadow: isDark ? '0 -8px 32px rgba(0,0,0,.4)' : '0 -8px 32px rgba(0,0,0,.12)',
        backdropFilter: 'blur(24px)',
        transition: dragHeight === null
          ? `${fitToSnap ? 'height' : 'transform'} 400ms cubic-bezier(.32,.72,0,1)`
          : 'none',
        touchAction: 'pan-y',
      }}
    >
      <style>{`
        .uber-bottom-sheet button { border-radius: 14px; }
        .uber-bottom-sheet--dark .ride-card,
        .uber-bottom-sheet--dark .ride-status,
        .uber-bottom-sheet--dark .fare-card {
          background: #2c2c2e !important;
          border-color: #3a3a3c !important;
        }
      `}</style>
      <div
        aria-label="Resize ride details"
        role="slider"
        aria-valuemin={25}
        aria-valuemax={90}
        aria-valuenow={Math.round(height)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={event => {
          const index = SNAP_POINTS.indexOf(snapPoint)
          if (event.key === 'ArrowUp') onSnapChange(SNAP_POINTS[Math.min(index + 1, SNAP_POINTS.length - 1)])
          if (event.key === 'ArrowDown') onSnapChange(SNAP_POINTS[Math.max(index - 1, 0)])
        }}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          background: surface,
          touchAction: 'none',
        }}
      >
        <div className="uber-bottom-sheet-handle" style={{ width: 40, height: 5, borderRadius: 999, background: handle }} />
      </div>
      <div style={{ padding: '8px 16px calc(24px + env(safe-area-inset-bottom))' }}>{children}</div>
    </section>
  )
}
