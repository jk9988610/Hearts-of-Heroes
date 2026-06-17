import { openDB, type IDBPDatabase } from 'idb'
import {
  DB_NAME,
  DB_STORE,
  SAVE_KEY,
  SAVE_VERSION,
  type FactionId,
  type GameSave,
} from '../types/index.ts'
import {
  createBattalion,
  createCorps,
  splitTroopsIntoBattalionChunks,
} from './organization/helpers.ts'
import { ensureOrganizationTiles, migrateArmiesToOrganization } from './organization/migrate.ts'

let dbPromise: Promise<IDBPDatabase> | null = null

const STARTER_CAPITALS: { faction: FactionId; tileId: string }[] = [
  { faction: 'wei', tileId: 'xuchang' },
  { faction: 'shu', tileId: 'chengdu' },
  { faction: 'wu', tileId: 'jianye' },
]

const STARTER_TROOPS = 1500

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

function addStarterOrganization(save: GameSave): void {
  for (const { faction, tileId } of STARTER_CAPITALS) {
    const f = save.factions[faction]
    if (!f || !save.tiles[tileId]) continue

    const corpsId = `corps_${faction}_${tileId}`
    if (f.corps.some((c) => c.id === corpsId)) continue

    const chunks = splitTroopsIntoBattalionChunks(STARTER_TROOPS)
    const battalions = chunks.map((troops, i) =>
      createBattalion(faction, tileId, troops, {
        id: `bat_${faction}_${tileId}_${i + 1}`,
        corpsId,
        designation: i + 1,
      }),
    )

    f.corps.push(
      createCorps(faction, tileId, {
        id: corpsId,
        standby: false,
        battalionIds: battalions.map((b) => b.id),
      }),
    )
    f.battalions.push(...battalions)
    save.tiles[tileId].battalionId = battalions[0]!.id
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
    wei: { food: 100, corps: [], battalions: [], policies: [], heroes: heroIdsByFaction.wei ?? [] },
    shu: { food: 100, corps: [], battalions: [], policies: [], heroes: heroIdsByFaction.shu ?? [] },
    wu: { food: 100, corps: [], battalions: [], policies: [], heroes: heroIdsByFaction.wu ?? [] },
  }

  const save: GameSave = {
    version: SAVE_VERSION,
    date: 0,
    hour: 0,
    playerFaction,
    factions,
    tiles,
  }

  addStarterOrganization(save)
  return save
}

export function migrateSave(save: GameSave): GameSave {
  if (!save.factions.wei) return save

  if (save.hour === undefined) save.hour = 0
  if (!save.playerFaction) save.playerFaction = 'wei'

  for (const faction of Object.values(save.factions)) {
    faction.corps = faction.corps ?? []
    faction.battalions = faction.battalions ?? []
  }

  migrateArmiesToOrganization(save)
  ensureOrganizationTiles(save)

  const totalBattalions = Object.values(save.factions).reduce(
    (n, f) => n + f.battalions.length,
    0,
  )
  if (totalBattalions === 0) addStarterOrganization(save)

  save.version = SAVE_VERSION
  return save
}
