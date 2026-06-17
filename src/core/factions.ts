import type { FactionId } from '../types/index.ts'

export const FACTION_LABELS: Record<FactionId, string> = {
  wei: '魏',
  shu: '蜀',
  wu: '吴',
  neutral: '—',
}

export const FACTION_CAPITAL: Record<FactionId, string> = {
  wei: 'xuchang',
  shu: 'chengdu',
  wu: 'jianye',
  neutral: '',
}

export const PLAYABLE_FACTIONS: FactionId[] = ['wei', 'shu', 'wu']

export interface FactionStartInfo {
  capitalId: string
  capitalName: string
  heroName: string
  startTroops: number
  blurb: string
}

export const FACTION_START_INFO: Record<Exclude<FactionId, 'neutral'>, FactionStartInfo> = {
  wei: {
    capitalId: 'xuchang',
    capitalName: '许昌',
    heroName: '曹操',
    startTroops: 1500,
    blurb: '中原腹地，粮多兵广',
  },
  shu: {
    capitalId: 'chengdu',
    capitalName: '成都',
    heroName: '刘备',
    startTroops: 1500,
    blurb: '益州天险，易守难攻',
  },
  wu: {
    capitalId: 'jianye',
    capitalName: '建业',
    heroName: '孙权',
    startTroops: 1500,
    blurb: '江东水师，扼守长江',
  },
}

export function getFactionLabel(faction: FactionId): string {
  return FACTION_LABELS[faction] ?? faction
}
