import Database from "better-sqlite3"
import path from "path"

const DB_PATH = path.join(process.cwd(), "database", "data.db")

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma("journal_mode = WAL")
    initSchema(_db)
  }
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const count = (db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count
  if (count === 0) {
    const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)")
    const seedUsers = [
      { name: "田中 太郎", email: "tanaka.taro@example.com" },
      { name: "佐藤 花子", email: "sato.hanako@example.com" },
      { name: "鈴木 一郎", email: "suzuki.ichiro@example.com" },
      { name: "山田 美咲", email: "yamada.misaki@example.com" },
      { name: "伊藤 健太", email: "ito.kenta@example.com" },
      { name: "渡辺 あい", email: "watanabe.ai@example.com" },
      { name: "中村 翔太", email: "nakamura.shota@example.com" },
      { name: "小林 さくら", email: "kobayashi.sakura@example.com" },
    ]
    for (const user of seedUsers) {
      insert.run(user.name, user.email)
    }
  }
}

export type User = {
  id: number
  name: string
  email: string
  created_at: string
}

export function getUsers(): User[] {
  return getDb().prepare("SELECT * FROM users ORDER BY id ASC").all() as User[]
}

export function addUser(name: string, email: string): void {
  getDb().prepare("INSERT INTO users (name, email) VALUES (?, ?)").run(name, email)
}

export function deleteUsers(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => "?").join(", ")
  getDb().prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids)
}
