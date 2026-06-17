import type { Battalion, FactionId, GameSave, GeneratedMap, MapTile } from '../types/index.ts'
import {
  findBattalionOnTile,
  getCombatHoursLeft,
  getMarchHoursLeft,
} from '../core/combat.ts'
import { countBattalionTroops } from '../core/organization/helpers.ts'
import { listAllArmies } from '../map/army-display.ts'
import { LOCAL_VERSION } from '../core/version.ts'
import { getFactionLabel } from '../core/factions.ts'
import { formatGameTime, formatHoursBrief } from '../core/time-scale.ts'

export interface GameReportContext {
  save: GameSave
  map: GeneratedMap
  playerFaction: FactionId
  selectedTileId?: string
  getNeighborTiles: (tile: MapTile) => MapTile[]
  formatTileBrief: (tile: MapTile) => string
}

function formatBattalion(battalion: Battalion | null): string {
  if (!battalion) return '无'
  const troops = countBattalionTroops(battalion)
  const parts = [`${battalion.designation}队 ${troops}人 @${battalion.tileId}`]
  const marchH = getMarchHoursLeft(battalion)
  if (marchH !== undefined && battalion.targetTileId) {
    parts.push(`行军→${battalion.targetTileId} 剩${formatHoursBrief(marchH)}`)
  }
  const combatH = getCombatHoursLeft(battalion)
  if (battalion.inCombat && combatH !== undefined) {
    parts.push(`战斗剩${formatHoursBrief(combatH)}`)
  }
  return parts.join(' · ')
}

export function buildGameSnapshot(ctx: GameReportContext): string[] {
  const { save, map, playerFaction, selectedTileId, getNeighborTiles, formatTileBrief } =
    ctx

  const lines: string[] = [
    `时间: ${formatGameTime(save.date, save.hour ?? 0)}`,
    `存档版本: ${save.version}`,
    `客户端: ${LOCAL_VERSION.version} (${LOCAL_VERSION.buildTime})`,
    `操控势力: ${playerFaction} (${getFactionLabel(playerFaction)})`,
    `地图: ${map.gridSize}×${map.gridSize} = ${map.tiles.length} 地块`,
    `粮食: ${save.factions[playerFaction]?.food.toFixed(1) ?? 0}`,
  ]

  if (selectedTileId && map.tileById[selectedTileId]) {
    const tile = map.tileById[selectedTileId]
    const state = save.tiles[tile.id]
    const neighbors = getNeighborTiles(tile)
    const battalion = findBattalionOnTile(save, tile.id)

    lines.push(
      '--- 选中地块 ---',
      `名称: ${tile.name} (${tile.id})`,
      `坐标: (${tile.gridX}, ${tile.gridY})`,
      `地形: ${tile.type}`,
      `归属: ${state?.owner ?? 'neutral'}`,
      `屯田: ${state?.hasTuntian ? '是' : '否'}`,
      `驻军: ${formatBattalion(battalion)}`,
      `邻接(${neighbors.length}): ${neighbors.map(formatTileBrief).join('、') || '无'}`,
    )
  } else {
    lines.push('选中地块: 无')
  }

  lines.push('--- 千人队一览 ---')
  for (const battalion of listAllArmies(save)) {
    lines.push(`${battalion.faction} ${battalion.id}: ${formatBattalion(battalion)}`)
  }

  lines.push('--- 势力概况 ---')
  for (const [fid, faction] of Object.entries(save.factions)) {
    const troops = faction.battalions.reduce((s, b) => s + countBattalionTroops(b), 0)
    lines.push(
      `${fid}: 粮=${faction.food.toFixed(1)} 队=${faction.battalions.length}支/${troops}人 军=${faction.corps.length} 策=[${faction.policies.join(',')}]`,
    )
  }

  return lines
}

export interface TickLogInput {
  day: number
  hour: number
  ai: { faction: string; type: string; detail: string; mode?: string }[]
  marches: string[]
  battles: string[]
}

export function formatTickEvents(input: TickLogInput): {
  tick?: string
  battle: string[]
} {
  const battle: string[] = []

  for (const ai of input.ai) {
    const tag = ai.mode === 'lite' ? '[简]' : ''
    battle.push(`AI${tag}[${ai.faction}] ${ai.type}: ${ai.detail}`)
  }
  battle.push(...input.marches, ...input.battles)

  const tick =
    input.hour === 0
      ? formatGameTime(input.day, 0)
      : input.hour % 6 === 0
        ? formatGameTime(input.day, input.hour)
        : undefined

  return { tick, battle }
}

export interface TileSelectInfo {
  tile: MapTile
  owner: string
  army: Battalion | null
  neighbors: MapTile[]
  formatTileBrief: (tile: MapTile) => string
}

export function formatTileSelect(info: TileSelectInfo): string[] {
  const { tile, owner, army, neighbors, formatTileBrief } = info
  const marchH = army ? getMarchHoursLeft(army) : undefined
  const troops = army ? countBattalionTroops(army) : 0
  const marchHint =
    marchH !== undefined && army?.targetTileId
      ? ` 行→${army.targetTileId}(${formatHoursBrief(marchH)})`
      : ''
  const label = army ? `${army.designation}队${troops}人` : ''
  return [
    `选中 ${tile.name}(${tile.gridX},${tile.gridY}) 归属=${owner}${army ? ` ${label}${marchHint}` : ''}`,
    `邻接 ${neighbors.length} 格: ${neighbors.map(formatTileBrief).join('、')}`,
  ]
}
