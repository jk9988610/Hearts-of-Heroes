import type { FactionId, GameSave } from '../types/index.ts'

export type DiplomaticStatus = 'peace' | 'war'

const PLAYABLE: FactionId[] = ['wei', 'shu', 'wu']

export function relationKey(a: FactionId, b: FactionId): string {
  return [a, b].sort().join(':')
}

export function ensureDiplomacy(save: GameSave): void {
  if (!save.diplomacy) {
    save.diplomacy = {}
    for (let i = 0; i < PLAYABLE.length; i++) {
      for (let j = i + 1; j < PLAYABLE.length; j++) {
        save.diplomacy[relationKey(PLAYABLE[i]!, PLAYABLE[j]!)] = 'war'
      }
    }
  }
}

export function getRelation(
  save: GameSave,
  a: FactionId,
  b: FactionId,
): DiplomaticStatus {
  if (a === b) return 'peace'
  if (a === 'neutral' || b === 'neutral') return 'peace'
  ensureDiplomacy(save)
  return save.diplomacy![relationKey(a, b)] ?? 'war'
}

export function isAtWar(save: GameSave, a: FactionId, b: FactionId): boolean {
  return getRelation(save, a, b) === 'war'
}

export function setRelation(
  save: GameSave,
  a: FactionId,
  b: FactionId,
  status: DiplomaticStatus,
): void {
  if (a === b || a === 'neutral' || b === 'neutral') return
  ensureDiplomacy(save)
  save.diplomacy![relationKey(a, b)] = status
}

export function declareWar(
  save: GameSave,
  a: FactionId,
  b: FactionId,
): { ok: boolean; message: string } {
  if (getRelation(save, a, b) === 'war') {
    return { ok: false, message: '两国已在交战' }
  }
  setRelation(save, a, b, 'war')
  return { ok: true, message: '已宣战' }
}

export function ceaseFire(
  save: GameSave,
  a: FactionId,
  b: FactionId,
): { ok: boolean; message: string } {
  if (getRelation(save, a, b) === 'peace') {
    return { ok: false, message: '两国已处于和平' }
  }
  setRelation(save, a, b, 'peace')
  return { ok: true, message: '已停战' }
}

export function getAlliedFactions(save: GameSave, faction: FactionId): FactionId[] {
  ensureDiplomacy(save)
  return PLAYABLE.filter(
    (other) => other !== faction && getRelation(save, faction, other) === 'peace',
  )
}

/** 行军路径是否可通行（和平时不可进入敌国领土） */
export function canMarchToTile(
  save: GameSave,
  battalionFaction: FactionId,
  tileId: string,
): boolean {
  const owner = save.tiles[tileId]?.owner ?? 'neutral'
  if (owner === battalionFaction || owner === 'neutral') return true
  return isAtWar(save, battalionFaction, owner)
}
