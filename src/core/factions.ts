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

export function getFactionLabel(faction: FactionId): string {
  return FACTION_LABELS[faction] ?? faction
}
