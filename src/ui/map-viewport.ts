const DRAG_THRESHOLD_PX = 10

export interface MapViewportOptions {
  viewport: HTMLElement
  canvas: HTMLCanvasElement
  onTap: (clientX: number, clientY: number) => void
}

/** 地图视口：拖拽滚动 + 区分点击 */
export function bindMapViewport(options: MapViewportOptions): void {
  const { viewport, canvas, onTap } = options
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let startScrollLeft = 0
  let startScrollTop = 0
  let dragging = false

  canvas.style.touchAction = 'none'

  canvas.addEventListener('pointerdown', (e) => {
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startScrollLeft = viewport.scrollLeft
    startScrollTop = viewport.scrollTop
    dragging = false
    canvas.setPointerCapture(e.pointerId)
  })

  canvas.addEventListener('pointermove', (e) => {
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
    if (pointerId !== e.pointerId) return
    if (!dragging) {
      onTap(e.clientX, e.clientY)
    }
    dragging = false
    pointerId = null
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
}
