import type { GeneratedMap } from '../types/index.ts'
import { getMapLayout } from './generator.ts'

/** 屏幕空间固定字号（px），不随地图缩放变化 */
export const LABEL_FONT_PX = 14

export type CityTier = 'mega' | 'large' | 'small'

/** 关键城三级优先级：超大城市 > 大城市 > 小城市 */
const CITY_TIERS: Record<string, CityTier> = {
  changan: 'mega',
  yecheng: 'mega',
  chengdu: 'mega',
  jianye: 'mega',
  xuchang: 'large',
  xiangyang: 'large',
  xuzhou: 'large',
  hanzhong: 'large',
  puyang: 'small',
  chenliu: 'small',
  xiaopei: 'small',
  jiangling: 'small',
}

const TIER_ORDER: CityTier[] = ['mega', 'large', 'small']

export function getCityTier(tileId: string, isKeyCity: boolean): CityTier | null {
  if (!isKeyCity) return null
  return CITY_TIERS[tileId] ?? 'small'
}

/** 缩放越小，只显示更高优先级；同一优先级全部同时显示 */
export function visibleTiersForScale(viewportScale: number): Set<CityTier> {
  const visible = new Set<CityTier>()
  if (viewportScale >= 1.15) {
    for (const tier of TIER_ORDER) visible.add(tier)
  } else if (viewportScale >= 0.9) {
    visible.add('mega')
    visible.add('large')
  } else {
    visible.add('mega')
  }
  return visible
}

export function renderLabelLayer(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  viewportScale: number,
): void {
  const layout = getMapLayout(canvas, map)
  const { cell, offsetX, offsetY } = layout
  const visibleTiers = visibleTiersForScale(viewportScale)

  container.replaceChildren()

  for (const tile of map.tiles) {
    const tier = getCityTier(tile.id, tile.isKeyCity)
    if (!tier || !visibleTiers.has(tier)) continue

    const cx = offsetX + tile.gridX * cell + cell / 2
    const cy = offsetY + tile.gridY * cell + cell / 2

    const el = document.createElement('span')
    el.className = `map-city-label map-city-label--${tier}`
    el.textContent = tile.name
    el.style.left = `${cx * viewportScale}px`
    el.style.top = `${cy * viewportScale}px`
    el.style.fontSize = `${LABEL_FONT_PX}px`
    container.appendChild(el)
  }
}
