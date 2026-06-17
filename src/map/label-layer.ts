import type { GeneratedMap } from '../types/index.ts'
import { getMapLayout } from './generator.ts'

/** 屏幕空间固定字号（px），不随地图缩放变化 */
export const LABEL_FONT_PX = 14

/** 关键城池显示权重：缩小时优先保留高权重地名 */
const CITY_WEIGHTS: Record<string, number> = {
  changan: 100,
  yecheng: 100,
  chengdu: 100,
  jianye: 100,
  xuchang: 85,
  xiangyang: 85,
  xuzhou: 80,
  hanzhong: 75,
  puyang: 65,
  chenliu: 60,
  xiaopei: 55,
  jiangling: 55,
}

export function getCityLabelWeight(tileId: string, isKeyCity: boolean): number {
  if (!isKeyCity) return 0
  return CITY_WEIGHTS[tileId] ?? 50
}

/** 视口缩放越小，阈值越高，显示的地名越少 */
export function minWeightForScale(viewportScale: number): number {
  return Math.max(0, Math.ceil(110 / viewportScale - 45))
}

export function renderLabelLayer(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  viewportScale: number,
): void {
  const layout = getMapLayout(canvas, map)
  const { cell, offsetX, offsetY } = layout
  const threshold = minWeightForScale(viewportScale)
  const fontPx = LABEL_FONT_PX / viewportScale

  container.replaceChildren()

  for (const tile of map.tiles) {
    const weight = getCityLabelWeight(tile.id, tile.isKeyCity)
    if (weight < threshold) continue

    const cx = offsetX + tile.gridX * cell + cell / 2
    const cy = offsetY + tile.gridY * cell + cell / 2

    const el = document.createElement('span')
    el.className = 'map-city-label'
    el.textContent = tile.name
    el.style.left = `${cx}px`
    el.style.top = `${cy}px`
    el.style.fontSize = `${fontPx}px`
    container.appendChild(el)
  }
}
