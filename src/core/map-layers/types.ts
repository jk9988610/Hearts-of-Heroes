export type MapLayerId = 'military' | 'terrain' | 'resource'

export const MAP_LAYERS: { id: MapLayerId; label: string }[] = [
  { id: 'military', label: '军情' },
  { id: 'terrain', label: '地形' },
  { id: 'resource', label: '资源' },
]

export const DEFAULT_MAP_LAYER: MapLayerId = 'military'
