import { openDB, type IDBPDatabase } from 'idb'
import {
  DB_NAME,
  DB_STORE,
  SAVE_KEY,
  SAVE_VERSION,
  type GameSave,
} from '../types/index.ts'

let dbPromise: Promise<IDBPDatabase> | null = null

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

/** Supabase 云端占位：Sprint 0 仅本地存档 */
export async function loadRemoteSave(
  _timeoutMs = 3000,
): Promise<GameSave | null> {
  return null
}

export async function syncRemoteSave(_save: GameSave): Promise<boolean> {
  return false
}

export function createNewGame(
  mapTileOwners: Record<string, string>,
  heroIdsByFaction: Record<string, string[]>,
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

  return {
    version: SAVE_VERSION,
    date: 0,
    factions,
    tiles,
  }
}
