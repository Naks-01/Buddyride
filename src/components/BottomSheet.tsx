import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

export type BottomSheetSnapPoint = 25 | 50 | 80 | 90

type BottomSheetProps = {
  children: ReactNode
  snapPoint: BottomSheetSnapPoint
  onSnapChange: (snapPoint: BottomSheetSnapPoint) => void
}

const SNAP_POINTS: BottomSheetSnapPoint[] = [25, 50, 80, 90]

export function BottomSheet({ children, snapPoint, onSnapChange }: BottomSheetProps) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStartRef = useRef<{ y: number; height: number } | null>(null)

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
      className="uber-bottom-sheet"
      style={{
        position: 'absolute',
        inset: 'auto 0 0',
        zIndex: 60,
        height: '90dvh',
        transform: `translateY(${translateY}dvh)`,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: 'rgba(28,28,30,.96)',
        color: '#F5F5F7',
        borderRadius: '28px 28px 0 0',
        boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
        backdropFilter: 'blur(24px)',
        transition: dragHeight === null ? 'transform 400ms cubic-bezier(.32,.72,0,1)' : 'none',
        touchAction: 'pan-y',
      }}
    >
      <style>{`
        .uber-bottom-sheet { color: #F5F5F7 !important; }
        .uber-bottom-sheet * { color: #F5F5F7 !important; }
        .uber-bottom-sheet .ride-card, .uber-bottom-sheet .ride-status,
        .uber-bottom-sheet .fare-card { background: #2C2C2E !important; border-color: #3A3A3C !important; }
        .uber-bottom-sheet input { color: #F5F5F7 !important; background: #2C2C2E !important; border: 0 !important; }
        .uber-bottom-sheet button { border-radius: 14px; }
        .uber-bottom-sheet-handle { width: 40px; height: 5px; border-radius: 999px; background: #3A3A3C; margin: 0 auto; }
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
          background: '#1C1C1E',
          touchAction: 'none',
        }}
      >
        <div className="uber-bottom-sheet-handle" />
      </div>
      <div style={{ padding: '8px 16px 24px' }}>{children}</div>
    </section>
  )
}
