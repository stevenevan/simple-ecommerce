import Database from 'better-sqlite3'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const DB_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/app.db')

declare global {
  var __app_db: Database.Database | undefined
}

export function getDb(): Database.Database {
  if (globalThis.__app_db) return globalThis.__app_db
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  globalThis.__app_db = db
  return db
}
