const DRAG_THRESHOLD_PX = 10
const LONG_PRESS_MS = 500
const MIN_SCALE = 0.65
const MAX_SCALE = 2.5
const ZOOM_STEP = 0.1

export interface MapViewportOptions {
  viewport: HTMLElement
  /** 接收指针事件的容器（通常为 #map-stack） */
  interactionRoot: HTMLElement
  canvas: HTMLCanvasElement
  /** 与主图同尺寸的叠加层（军棋、地名等） */
  overlayElements?: HTMLElement[]
  onTap: (clientX: number, clientY: number) => void
  /** 触屏长按，等价右键 */
  onLongPress?: (clientX: number, clientY: number) => void
  onContextMenu?: (clientX: number, clientY: number) => void
  onScaleChange?: (scale: number) => void
}

export interface MapViewportController {
  getScale(): number
  centerHorizontally(): void
}

/** 地图视口：拖拽滚动、滚轮/双指缩放、短按/长按/右键 */
export function bindMapViewport(options: MapViewportOptions): MapViewportController {
  const {
    viewport,
    interactionRoot,
    canvas,
    overlayElements = [],
    onTap,
    onLongPress,
    onContextMenu,
    onScaleChange,
  } = options
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let startScrollLeft = 0
  let startScrollTop = 0
  let pointerDownMs = 0
  let dragging = false
  let scale = 1

  const pointers = new Map<number, { x: number; y: number }>()
  let pinchStartDist = 0
  let pinchStartScale = 1

  interactionRoot.style.touchAction = 'none'

  function applyScale(): void {
    const w = `${canvas.width * scale}px`
    const h = `${canvas.height * scale}px`
    canvas.style.width = w
    canvas.style.height = h
    for (const el of overlayElements) {
      el.style.width = w
      el.style.height = h
    }
    onScaleChange?.(scale)
  }

  function zoomAt(clientX: number, clientY: number, newScale: number): void {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale))
    if (clamped === scale) return

    const rect = viewport.getBoundingClientRect()
    const offsetX = clientX - rect.left + viewport.scrollLeft
    const offsetY = clientY - rect.top + viewport.scrollTop
    const ratio = clamped / scale

    scale = clamped
    applyScale()

    viewport.scrollLeft = offsetX * ratio - (clientX - rect.left)
    viewport.scrollTop = offsetY * ratio - (clientY - rect.top)
  }

  applyScale()

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      zoomAt(e.clientX, e.clientY, scale + delta)
    },
    { passive: false },
  )

  interactionRoot.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    onContextMenu?.(e.clientX, e.clientY)
  })

  interactionRoot.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size === 2) {
      const pts = [...pointers.values()]
      pinchStartDist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
      pinchStartScale = scale
      dragging = false
      pointerId = null
      return
    }

    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startScrollLeft = viewport.scrollLeft
    startScrollTop = viewport.scrollTop
    pointerDownMs = performance.now()
    dragging = false
    interactionRoot.setPointerCapture(e.pointerId)
  })

  interactionRoot.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (pointers.size === 2) {
      const pts = [...pointers.values()]
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
      if (pinchStartDist > 0) {
        const midX = (pts[0]!.x + pts[1]!.x) / 2
        const midY = (pts[0]!.y + pts[1]!.y) / 2
        zoomAt(midX, midY, pinchStartScale * (dist / pinchStartDist))
      }
      return
    }

    if (pointerId !== e.pointerId) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      dragging = true
    }
    if (dragging) {
      viewport.scrollLeft = startScrollLeft - dx
      viewport.scrollTop = startScrollTop - dy
    }
  })

  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId)

    if (pointers.size === 1) {
      pinchStartDist = 0
    }

    if (pointerId !== e.pointerId) return
    if (!dragging) {
      const held = performance.now() - pointerDownMs
      if (held >= LONG_PRESS_MS && onLongPress) {
        onLongPress(e.clientX, e.clientY)
      } else {
        onTap(e.clientX, e.clientY)
      }
    }
    dragging = false
    pointerId = null
    try {
      interactionRoot.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  interactionRoot.addEventListener('pointerup', endPointer)
  interactionRoot.addEventListener('pointercancel', endPointer)

  function centerHorizontally(): void {
    const contentW = canvas.width * scale
    const viewW = viewport.clientWidth
    if (contentW <= viewW) {
      viewport.scrollLeft = 0
    } else {
      viewport.scrollLeft = Math.max(0, (contentW - viewW) / 2)
    }
  }

  centerHorizontally()
  window.addEventListener('resize', centerHorizontally)

  return {
    getScale: () => scale,
    centerHorizontally,
  }
}
