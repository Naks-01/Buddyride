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

export function BottomSheet({ children, snapPoint, onSnapChange, theme = 'light', fitToSnap = true }: BottomSheetProps) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStartRef = useRef<{ y: number; height: number } | null>(null)
  const liveHeightRef = useRef<number>(snapPoint)
  const isDark = theme === 'dark'
  // FIX: Blue Lite - light = white, dark = navy (was #121212 black, broke Lite)
  const surface = isDark ? '#0A2540' : '#ffffff'
  const text = isDark ? '#ffffff' : '#111827'
  const border = isDark ? '#1e293b' : '#E4E7EC'
  const handle = isDark ? '#B2CCFF' : '#D0D5DD'

  const height = dragHeight ?? snapPoint
  liveHeightRef.current = height

  function clampHeight(h: number) {
    return Math.max(25, Math.min(90, h))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStartRef.current = {
      y: event.clientY,
      height: liveHeightRef.current,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {}
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    event.preventDefault()
    const delta = dragStartRef.current.y - event.clientY
    const h = clampHeight(dragStartRef.current.height + (delta / window.innerHeight) * 100)
    liveHeightRef.current = h
    setDragHeight(h)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    const h = liveHeightRef.current
    const nearestSnap = SNAP_POINTS.reduce((closest, point) =>
      Math.abs(point - h) < Math.abs(closest - h) ? point : closest,
    SNAP_POINTS[0])
    dragStartRef.current = null
    setDragHeight(null)
    liveHeightRef.current = nearestSnap
    onSnapChange(nearestSnap)
  }

  function onPointerCancel() {
    dragStartRef.current = null
    setDragHeight(null)
    liveHeightRef.current = snapPoint
  }

  // FIX: No more 90dvh + translateY trick - height IS the snap height
  // Old: height 90dvh + translateY = huge invisible white sheet = double button look

  return (
    <section
      className={`uber-bottom-sheet uber-bottom-sheet--${theme}`}
      style={{
        position: 'absolute',
        inset: 'auto 0 0',
        zIndex: 60,
        height: `${height}dvh`,
        transform: 'none',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: surface,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: '28px 28px 0 0',
        boxShadow: isDark ? '0 -8px 32px rgba(10,37,64,.4)' : '0 -8px 32px rgba(0,0,0,.12)',
        backdropFilter: 'blur(24px)',
        transition: dragHeight === null
          ? `height 400ms cubic-bezier(.32,.72,0,1)`
          : 'none',
        touchAction: 'pan-y',
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        .uber-bottom-sheet button { border-radius: 14px; }
        .uber-bottom-sheet--dark .ride-card,
        .uber-bottom-sheet--dark .ride-status,
        .uber-bottom-sheet--dark .fare-card {
          background: #1e293b !important;
          border-color: #334155 !important;
        }
        .uber-bottom-sheet--light .ride-card,
        .uber-bottom-sheet--light .ride-status,
        .uber-bottom-sheet--light .fare-card {
          background: #F2F4F7 !important;
          border-color: #E4E7EC !important;
        }
      `}</style>
      <div
        aria-label="Resize ride details"
        role="slider"
        aria-valuemin={25}
        aria-valuemax={90}
        aria-valuenow={Math.round(height)}
        aria-valuetext={`${Math.round(height)} percent open`}
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onKeyDown={event => {
          const index = SNAP_POINTS.indexOf(snapPoint)
          if (event.key === 'ArrowUp') { event.preventDefault(); onSnapChange(SNAP_POINTS[Math.min(index + 1, SNAP_POINTS.length - 1)]) }
          if (event.key === 'ArrowDown') { event.preventDefault(); onSnapChange(SNAP_POINTS[Math.max(index - 1, 0)]) }
          if (event.key === 'Home') { event.preventDefault(); onSnapChange(25) }
          if (event.key === 'End') { event.preventDefault(); onSnapChange(90) }
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