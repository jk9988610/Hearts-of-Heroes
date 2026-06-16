import { openDB, type IDBPDatabase } from 'idb'
import {
  DB_NAME,
  DB_STORE,
  SAVE_KEY,
  SAVE_VERSION,
  type FactionId,
  type GameSave,
} from '../types/index.ts'

let dbPromise: Promise<IDBPDatabase> | null = null

const STARTER_CAPITALS: { faction: FactionId; tileId: string }[] = [
  { faction: 'wei', tileId: 'xuchang' },
  { faction: 'shu', tileId: 'chengdu' },
  { faction: 'wu', tileId: 'jianye' },
]

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE)
        }
      },
    })
  }
  return dbPromise
}

export async function saveGame(save: GameSave): Promise<void> {
  const db = await getDb()
  const payload: GameSave = { ...save, version: SAVE_VERSION }
  await db.put(DB_STORE, payload, SAVE_KEY)
}

export async function loadGame(): Promise<GameSave | null> {
  const db = await getDb()
  const data = await db.get(DB_STORE, SAVE_KEY)
  if (!data) return null
  return data as GameSave
}

export async function deleteSave(): Promise<void> {
  const db = await getDb()
  await db.delete(DB_STORE, SAVE_KEY)
}

export async function loadRemoteSave(
  _timeoutMs = 3000,
): Promise<GameSave | null> {
  return null
}

export async function syncRemoteSave(_save: GameSave): Promise<boolean> {
  return false
}

function addStarterArmies(save: GameSave): void {
  for (const { faction, tileId } of STARTER_CAPITALS) {
    const f = save.factions[faction]
    if (!f || !save.tiles[tileId]) continue

    const armyId = `army_${faction}_${tileId}`
    if (f.armies.some((a) => a.id === armyId)) continue

    f.armies.push({
      id: armyId,
      faction,
      troops: 1500,
      tileId,
    })
    save.tiles[tileId].armyId = armyId
  }
}

export function createNewGame(
  mapTileOwners: Record<string, string>,
  heroIdsByFaction: Record<string, string[]>,
  playerFaction: FactionId = 'wei',
): GameSave {
  const tiles: GameSave['tiles'] = {}
  for (const [id, owner] of Object.entries(mapTileOwners)) {
    tiles[id] = { owner: owner as GameSave['tiles'][string]['owner'] }
  }

  const factions: GameSave['factions'] = {
    wei: { food: 100, armies: [], policies: [], heroes: heroIdsByFaction.wei ?? [] },
    shu: { food: 100, armies: [], policies: [], heroes: heroIdsByFaction.shu ?? [] },
    wu: { food: 100, armies: [], policies: [], heroes: heroIdsByFaction.wu ?? [] },
  }

  const save: GameSave = {
    version: SAVE_VERSION,
    date: 0,
    playerFaction,
    factions,
    tiles,
  }

  addStarterArmies(save)
  return save
}

/** 旧档迁移：补全初始军队 */
export function migrateSave(save: GameSave): GameSave {
  if (!save.factions.wei) return save
  const totalArmies = Object.values(save.factions).reduce(
    (n, f) => n + f.armies.length,
    0,
  )
  if (totalArmies === 0) {
    addStarterArmies(save)
  }
  if (!save.playerFaction) {
    save.playerFaction = 'wei'
  }
  save.version = SAVE_VERSION
  return save
}
