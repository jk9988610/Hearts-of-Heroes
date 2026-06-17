export type TerrainType = 'plain' | 'mountain' | 'river'
export type FactionId = 'wei' | 'shu' | 'wu' | 'neutral'

export interface TerrainTileConfig {
  id: string
  name: string
  type: TerrainType
  x: number
  y: number
  owner: FactionId
}

export interface TerrainConfig {
  gridSize: number
  keyTiles: TerrainTileConfig[]
}

export interface HeroConfig {
  id: string
  name: string
  faction: FactionId
  attack: number
  defense: number
}

export interface PolicyEffect {
  type: string
  value: number
}

export interface PolicyConfig {
  id: string
  name: string
  cost: number
  effect: PolicyEffect
}

export interface Century {
  index: number
  troops: number
}

export interface Battalion {
  id: string
  faction: FactionId
  corpsId?: string
  designation: number
  centuries: Century[]
  tileId: string
  targetTileId?: string
  marchHoursLeft?: number
  inCombat?: boolean
  combatHoursLeft?: number
  /** 驻守筑壕（军棋右区实心） */
  dugIn?: boolean
  /** 组织度 0..100 */
  organization?: number
  /** 装备度 0..100 */
  equipment?: number
  /** @deprecated 旧档字段 */
  marchDaysLeft?: number
  combatDaysLeft?: number
}

export interface Corps {
  id: string
  faction: FactionId
  name?: string
  heroId?: string
  battalionIds: string[]
  tileId: string
  standby: boolean
}

/** @deprecated v0.8 起由 Battalion 替代，仅用于存档迁移 */
export interface Army {
  id: string
  faction: FactionId
  troops: number
  tileId: string
  targetTileId?: string
  /** 剩余行军小时数 */
  marchHoursLeft?: number
  inCombat?: boolean
  /** 剩余战斗小时数 */
  combatHoursLeft?: number
  /** @deprecated 旧档字段，迁移后删除 */
  marchDaysLeft?: number
  combatDaysLeft?: number
}

export interface TileState {
  owner: FactionId
  battalionId?: string
  /** @deprecated v0.8 迁移后删除 */
  armyId?: string
  hasTuntian?: boolean
  occupationDays?: number
}

export interface FactionState {
  food: number
  corps: Corps[]
  battalions: Battalion[]
  /** @deprecated v0.8 迁移后删除 */
  armies?: Army[]
  policies: string[]
  heroes: string[]
  starvingDays?: number
}

export interface GameSave {
  version: string
  date: number
  hour: number
  playerFaction: FactionId
  factions: Record<string, FactionState>
  tiles: Record<string, TileState>
}

export interface MapTile {
  id: string
  name: string
  type: TerrainType
  x: number
  y: number
  gridX: number
  gridY: number
  neighbors: string[]
  isKeyCity: boolean
}

export interface GeneratedMap {
  gridSize: number
  tiles: MapTile[]
  tileById: Record<string, MapTile>
}

export const SAVE_VERSION = '0.85.0'
export const DB_NAME = 'sanguo-save'
export const DB_STORE = 'saves'
export const SAVE_KEY = 'sanguo-save-v1'
