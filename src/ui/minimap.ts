import { getMapLayout } from '../map/generator.ts'
import type { GameSave, GeneratedMap } from '../types/index.ts'

const FACTION_COLORS: Record<string, string> = {
  wei: '#4a5d6c',
  shu: '#8b3a3a',
  wu: '#3a6b5c',
  neutral: '#9a9080',
}

export interface MinimapOptions {
  canvas: HTMLCanvasElement
  mainCanvas: HTMLCanvasElement
  viewport: HTMLElement
  map: GeneratedMap
  getSave: () => GameSave | null
  getHighlightTileId: () => string | undefined
}

export function bindMinimap(options: MinimapOptions): () => void {
  const { canvas, mainCanvas, viewport, map, getSave, getHighlightTileId } = options
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const size = 140
  canvas.width = size
  canvas.height = size

  const draw = (): void => {
    const save = getSave()
    if (!save) return

    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#e8e0d0'
    ctx.fillRect(0, 0, size, size)

    const cell = size / map.gridSize

    for (const tile of map.tiles) {
      const owner = save.tiles[tile.id]?.owner ?? 'neutral'
      ctx.fillStyle = FACTION_COLORS[owner] ?? FACTION_COLORS.neutral
      ctx.fillRect(tile.gridX * cell, tile.gridY * cell, cell, cell)
    }

    const hi = getHighlightTileId()
    if (hi) {
      const t = map.tileById[hi]
      if (t) {
        ctx.strokeStyle = '#ffd700'
        ctx.lineWidth = 2
        ctx.strokeRect(t.gridX * cell + 1, t.gridY * cell + 1, cell - 2, cell - 2)
      }
    }

    const mainLayout = getMapLayout(mainCanvas, map)
    const mapW = mainLayout.cell * map.gridSize
    const mapH = mapW
    const rect = mainCanvas.getBoundingClientRect()
    const scaleX = rect.width / mainCanvas.width
    const scaleY = rect.height / mainCanvas.height

    const vx = (viewport.scrollLeft / scaleX / mapW) * size
    const vy = (viewport.scrollTop / scaleY / mapH) * size
    const vw = (viewport.clientWidth / scaleX / mapW) * size
    const vh = (viewport.clientHeight / scaleY / mapH) * size

    ctx.strokeStyle = '#c44'
    ctx.lineWidth = 2
    ctx.strokeRect(vx, vy, Math.max(4, vw), Math.max(4, vh))
  }

  const scrollToMinimap = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const cell = size / map.gridSize
    const gx = Math.floor(x / cell)
    const gy = Math.floor(y / cell)
    if (gx < 0 || gy < 0 || gx >= map.gridSize || gy >= map.gridSize) return

    const mainLayout = getMapLayout(mainCanvas, map)
    const mapRect = mainCanvas.getBoundingClientRect()
    const scaleX = mapRect.width / mainCanvas.width
    const scaleY = mapRect.height / mainCanvas.height
    const px = (mainLayout.offsetX + gx * mainLayout.cell) * scaleX
    const py = (mainLayout.offsetY + gy * mainLayout.cell) * scaleY

    viewport.scrollLeft = px - viewport.clientWidth / 2
    viewport.scrollTop = py - viewport.clientHeight / 2
    draw()
  }

  canvas.addEventListener('click', (e) => scrollToMinimap(e.clientX, e.clientY))
  viewport.addEventListener('scroll', draw, { passive: true })
  window.addEventListener('resize', draw)

  return draw
}
