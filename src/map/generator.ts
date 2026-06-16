import type {
  GeneratedMap,
  MapTile,
  TerrainConfig,
  TerrainType,
} from '../types/index.ts'

const TERRAIN_TYPES: TerrainType[] = ['plain', 'mountain', 'river']

const TERRAIN_NAMES: Record<TerrainType, string> = {
  plain: '原野',
  mountain: '山地',
  river: '河畔',
}

function gridIndex(gridSize: number, gx: number, gy: number): number {
  return gy * gridSize + gx
}

/** 四向网格邻接：格 = 地块，上下左右各一格（最多 4 个） */
export function computeGridNeighbors(map: GeneratedMap, tile: MapTile): MapTile[] {
  const deltas: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]
  const neighbors: MapTile[] = []
  for (const [dx, dy] of deltas) {
    const nx = tile.gridX + dx
    const ny = tile.gridY + dy
    if (nx < 0 || nx >= map.gridSize || ny < 0 || ny >= map.gridSize) continue
    const idx = gridIndex(map.gridSize, nx, ny)
    const neighbor = map.tiles[idx]
    if (neighbor) neighbors.push(neighbor)
  }
  return neighbors
}

function seededType(seed: number): TerrainType {
  return TERRAIN_TYPES[seed % TERRAIN_TYPES.length]!
}

export async function loadTerrainConfig(): Promise<TerrainConfig> {
  const res = await fetch('/config/terrain.json')
  if (!res.ok) throw new Error(`无法加载 terrain.json: ${res.status}`)
  return (await res.json()) as TerrainConfig
}

export function generateMap(config: TerrainConfig): GeneratedMap {
  const { gridSize, keyTiles } = config
  const tiles: MapTile[] = []
  const tileById: Record<string, MapTile> = {}
  const keyByGrid = new Map<string, (typeof keyTiles)[0]>()

  for (const key of keyTiles) {
    keyByGrid.set(`${key.x},${key.y}`, key)
  }

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const key = keyByGrid.get(`${gx},${gy}`)
      const id = key?.id ?? `tile_${gx}_${gy}`
      const type = key?.type ?? seededType(gx * gridSize + gy)
      const name = key?.name ?? `${TERRAIN_NAMES[type]}${gx + 1}-${gy + 1}`

      const tile: MapTile = {
        id,
        name,
        type,
        x: key?.x ?? gx,
        y: key?.y ?? gy,
        gridX: gx,
        gridY: gy,
        neighbors: [],
        isKeyCity: Boolean(key),
      }
      tiles.push(tile)
      tileById[id] = tile
    }
  }

  for (const tile of tiles) {
    tile.neighbors = computeGridNeighbors({ gridSize, tiles, tileById }, tile).map(
      (t) => t.id,
    )
  }

  return { gridSize, tiles, tileById }
}

export function getInitialOwners(map: GeneratedMap): Record<string, string> {
  const owners: Record<string, string> = {}
  for (const tile of map.tiles) {
    owners[tile.id] = 'neutral'
  }
  return owners
}

export function applyKeyCityOwners(
  config: TerrainConfig,
  owners: Record<string, string>,
): void {
  for (const key of config.keyTiles) {
    owners[key.id] = key.owner
  }
}

const TERRAIN_COLORS: Record<TerrainType, string> = {
  plain: '#d4c9b3',
  mountain: '#a89986',
  river: '#8ba5b5',
}

const FACTION_COLORS: Record<string, string> = {
  wei: '#4a5d6c',
  shu: '#8b3a3a',
  wu: '#3a6b5c',
  neutral: '#9a9080',
}

export interface TileOverlay {
  troops?: number
  status?: string
}

export function drawMapPreview(
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  owners: Record<string, string>,
  highlightId?: string,
  neighborIds?: string[],
  overlays?: Record<string, TileOverlay>,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cell = Math.floor(Math.min(canvas.width, canvas.height) / map.gridSize)
  const offsetX = (canvas.width - cell * map.gridSize) / 2
  const offsetY = (canvas.height - cell * map.gridSize) / 2

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (const tile of map.tiles) {
    const px = offsetX + tile.gridX * cell
    const py = offsetY + tile.gridY * cell
    const owner = owners[tile.id] ?? 'neutral'
    const isNeighbor = neighborIds?.includes(tile.id)

    ctx.fillStyle = TERRAIN_COLORS[tile.type]
    ctx.fillRect(px, py, cell, cell)

    ctx.fillStyle = FACTION_COLORS[owner] ?? FACTION_COLORS.neutral
    ctx.globalAlpha = 0.45
    ctx.fillRect(px, py, cell, cell)
    ctx.globalAlpha = 1

    if (isNeighbor) {
      ctx.strokeStyle = '#2d6a4f'
      ctx.lineWidth = 3
      ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4)
    }

    if (tile.id === highlightId) {
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 3
      ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2)
    } else {
      ctx.strokeStyle = '#5c4f3a'
      ctx.lineWidth = 1
      ctx.strokeRect(px, py, cell, cell)
    }

    if (tile.isKeyCity) {
      ctx.fillStyle = '#1a1208'
      ctx.font = `${Math.max(10, cell * 0.22)}px "Noto Serif SC", serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tile.name, px + cell / 2, py + cell / 2 - (overlays?.[tile.id]?.troops ? 6 : 0))
    }

    const overlay = overlays?.[tile.id]
    if (overlay?.troops) {
      ctx.fillStyle = '#1a1208'
      ctx.font = `bold ${Math.max(9, cell * 0.18)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(overlay.troops), px + cell / 2, py + cell - 3)
    }
    if (overlay?.status) {
      ctx.fillStyle = '#8b2500'
      ctx.font = `${Math.max(8, cell * 0.15)}px ui-monospace, monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(overlay.status, px + 3, py + 3)
    }
  }
}

export function hitTestTile(
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  clientX: number,
  clientY: number,
): MapTile | null {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (clientX - rect.left) * scaleX
  const y = (clientY - rect.top) * scaleY

  const cell = Math.floor(Math.min(canvas.width, canvas.height) / map.gridSize)
  const offsetX = (canvas.width - cell * map.gridSize) / 2
  const offsetY = (canvas.height - cell * map.gridSize) / 2

  const gx = Math.floor((x - offsetX) / cell)
  const gy = Math.floor((y - offsetY) / cell)
  if (gx < 0 || gy < 0 || gx >= map.gridSize || gy >= map.gridSize) return null

  return map.tiles.find((t) => t.gridX === gx && t.gridY === gy) ?? null
}
