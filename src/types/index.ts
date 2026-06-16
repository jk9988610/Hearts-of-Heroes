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

export interface Army {
  id: string
  faction: FactionId
  troops: number
  tileId: string
  targetTileId?: string
  marchDaysLeft?: number
  inCombat?: boolean
  combatDaysLeft?: number
}

export interface TileState {
  owner: FactionId
  armyId?: string
  hasTuntian?: boolean
  occupationDays?: number
}

export interface FactionState {
  food: number
  armies: Army[]
  policies: string[]
  heroes: string[]
}

export interface GameSave {
  version: string
  date: number
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

export const SAVE_VERSION = '0.2.0'
export const DB_NAME = 'sanguo-save'
export const DB_STORE = 'saves'
export const SAVE_KEY = 'sanguo-save-v1'
