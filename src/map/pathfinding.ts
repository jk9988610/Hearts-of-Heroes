import type { GeneratedMap } from '../types/index.ts'

/** 四向 BFS 寻路，返回含起点与终点的 tile id 序列 */
export function findTilePath(
  map: GeneratedMap,
  fromTileId: string,
  toTileId: string,
): string[] | null {
  if (fromTileId === toTileId) return [fromTileId]

  const from = map.tileById[fromTileId]
  const to = map.tileById[toTileId]
  if (!from || !to) return null

  const queue: string[] = [fromTileId]
  const prev = new Map<string, string>()
  prev.set(fromTileId, '')

  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur === toTileId) break

    for (const nid of map.tileById[cur]?.neighbors ?? []) {
      if (prev.has(nid)) continue
      prev.set(nid, cur)
      queue.push(nid)
    }
  }

  if (!prev.has(toTileId)) return null

  const path: string[] = []
  let node: string | undefined = toTileId
  while (node) {
    path.unshift(node)
    const parent = prev.get(node)
    if (parent === '') break
    node = parent
  }

  return path.length >= 2 ? path : null
}
