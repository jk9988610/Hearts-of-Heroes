import type { Army, FactionId, GameSave, GeneratedMap, MapTile } from '../types/index.ts'
import { findArmyOnTile } from '../core/combat.ts'
import { listAllArmies } from '../map/army-display.ts'
import { LOCAL_VERSION } from '../core/version.ts'

export interface GameReportContext {
  save: GameSave
  map: GeneratedMap
  playerFaction: FactionId
  selectedTileId?: string
  getNeighborTiles: (tile: MapTile) => MapTile[]
  formatTileBrief: (tile: MapTile) => string
}

function formatArmy(army: Army | null): string {
  if (!army) return '无'
  const parts = [`${army.troops}兵 @${army.tileId}`]
  if (army.marchDaysLeft && army.targetTileId) {
    parts.push(`行军→${army.targetTileId} 剩${army.marchDaysLeft}天`)
  }
  if (army.inCombat) parts.push(`战斗剩${army.combatDaysLeft ?? 0}天`)
  return parts.join(' · ')
}

/** 游戏状态快照（供「打印详情」与复制） */
export function buildGameSnapshot(ctx: GameReportContext): string[] {
  const { save, map, playerFaction, selectedTileId, getNeighborTiles, formatTileBrief } =
    ctx

  const lines: string[] = [
    `游戏日: ${save.date}`,
    `存档版本: ${save.version}`,
    `客户端: ${LOCAL_VERSION.version} (${LOCAL_VERSION.buildTime})`,
    `地图: ${map.gridSize}×${map.gridSize} = ${map.tiles.length} 地块`,
    `玩家势力: ${playerFaction}`,
    `玩家粮食: ${save.factions[playerFaction]?.food.toFixed(1) ?? 0}`,
  ]

  if (selectedTileId && map.tileById[selectedTileId]) {
    const tile = map.tileById[selectedTileId]
    const state = save.tiles[tile.id]
    const neighbors = getNeighborTiles(tile)
    const army = findArmyOnTile(save, tile.id)

    lines.push(
      '--- 选中地块 ---',
      `名称: ${tile.name} (${tile.id})`,
      `坐标: (${tile.gridX}, ${tile.gridY})`,
      `地形: ${tile.type}`,
      `归属: ${state?.owner ?? 'neutral'}`,
      `屯田: ${state?.hasTuntian ? '是' : '否'}`,
      `驻军(逻辑格): ${formatArmy(army)}`,
      `邻接(${neighbors.length}): ${neighbors.map(formatTileBrief).join('、') || '无'}`,
    )
  } else {
    lines.push('选中地块: 无')
  }

  lines.push('--- 军队一览 ---')
  for (const army of listAllArmies(save)) {
    lines.push(`${army.faction} ${army.id}: ${formatArmy(army)}`)
  }

  lines.push('--- 势力概况 ---')
  for (const [fid, faction] of Object.entries(save.factions)) {
    const troops = faction.armies.reduce((s, a) => s + a.troops, 0)
    lines.push(
      `${fid}: 粮=${faction.food.toFixed(1)} 军=${faction.armies.length}支/${troops}兵 策=[${faction.policies.join(',')}]`,
    )
  }

  return lines
}

export interface TickLogInput {
  day: number
  ai?: { faction: string; type: string; detail: string }
  marches: string[]
  battles: string[]
}

/** 将 Tick 事件转为统一日志条目描述 */
export function formatTickEvents(input: TickLogInput): {
  tick?: string
  battle: string[]
} {
  const battle: string[] = []

  if (input.ai && input.ai.type !== 'idle') {
    battle.push(`AI[${input.ai.faction}] ${input.ai.type}: ${input.ai.detail}`)
  }
  battle.push(...input.marches, ...input.battles)

  const tick = input.day % 5 === 0 ? `第 ${input.day} 天` : undefined
  return { tick, battle }
}

export interface TileSelectInfo {
  tile: MapTile
  owner: string
  army: Army | null
  neighbors: MapTile[]
  formatTileBrief: (tile: MapTile) => string
}

/** 地块选中日志 */
export function formatTileSelect(info: TileSelectInfo): string[] {
  const { tile, owner, army, neighbors, formatTileBrief } = info
  const marchHint =
    army?.marchDaysLeft && army.targetTileId
      ? ` 行→${army.targetTileId}(${army.marchDaysLeft}天)`
      : ''
  return [
    `选中 ${tile.name}(${tile.gridX},${tile.gridY}) 归属=${owner}${army ? ` 兵${army.troops}${marchHint}` : ''}`,
    `邻接 ${neighbors.length} 格: ${neighbors.map(formatTileBrief).join('、')}`,
  ]
}
