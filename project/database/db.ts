import Database from "better-sqlite3"
import path from "path"

const DB_PATH = path.join(process.cwd(), "database", "data.db")

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma("journal_mode = WAL")
    _db.pragma("foreign_keys = ON")
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_assignees (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_supports (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    )
  `)

  // migration: assignee_id 列が残っている場合は中間テーブルへ移行して削除
  const columns = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>
  if (columns.some((c) => c.name === "assignee_id")) {
    db.exec(`
      INSERT OR IGNORE INTO project_assignees (project_id, user_id)
      SELECT id, assignee_id FROM projects WHERE assignee_id IS NOT NULL
    `)
    db.exec(`ALTER TABLE projects DROP COLUMN assignee_id`)
  }

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

// ── Users ──────────────────────────────────────────────────

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

// ── Projects ──────────────────────────────────────────────

export type Project = {
  id: number
  name: string
  assignee_ids: number[]
  assignee_names: string[]
  support_ids: number[]
  support_names: string[]
  start_date: string | null
  end_date: string | null
  created_at: string
}

type RawProject = {
  id: number
  name: string
  assignee_ids_str: string | null
  assignee_names_str: string | null
  support_ids_str: string | null
  support_names_str: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
}

export function getProjects(): Project[] {
  const rows = getDb().prepare(`
    SELECT
      p.id, p.name, p.start_date, p.end_date, p.created_at,
      (SELECT GROUP_CONCAT(pa.user_id)
       FROM project_assignees pa WHERE pa.project_id = p.id) AS assignee_ids_str,
      (SELECT GROUP_CONCAT(u.name, '|||')
       FROM project_assignees pa JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = p.id) AS assignee_names_str,
      (SELECT GROUP_CONCAT(ps.user_id)
       FROM project_supports ps WHERE ps.project_id = p.id) AS support_ids_str,
      (SELECT GROUP_CONCAT(u.name, '|||')
       FROM project_supports ps JOIN users u ON u.id = ps.user_id
       WHERE ps.project_id = p.id) AS support_names_str
    FROM projects p
    ORDER BY p.id ASC
  `).all() as RawProject[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    assignee_ids: row.assignee_ids_str ? row.assignee_ids_str.split(",").map(Number) : [],
    assignee_names: row.assignee_names_str ? row.assignee_names_str.split("|||") : [],
    support_ids: row.support_ids_str ? row.support_ids_str.split(",").map(Number) : [],
    support_names: row.support_names_str ? row.support_names_str.split("|||") : [],
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
  }))
}

function insertJunction(
  db: Database.Database,
  table: string,
  projectId: number | bigint,
  userIds: number[],
) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO ${table} (project_id, user_id) VALUES (?, ?)`)
  for (const userId of userIds) stmt.run(projectId, userId)
}

export function addProject(
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
): void {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare("INSERT INTO projects (name, start_date, end_date) VALUES (?, ?, ?)")
    .run(name, startDate, endDate)
  insertJunction(db, "project_assignees", lastInsertRowid, assigneeIds)
  insertJunction(db, "project_supports", lastInsertRowid, supportIds)
}

export function updateProject(
  id: number,
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
): void {
  const db = getDb()
  db.prepare("UPDATE projects SET name=?, start_date=?, end_date=? WHERE id=?")
    .run(name, startDate, endDate, id)
  db.prepare("DELETE FROM project_assignees WHERE project_id=?").run(id)
  db.prepare("DELETE FROM project_supports WHERE project_id=?").run(id)
  insertJunction(db, "project_assignees", id, assigneeIds)
  insertJunction(db, "project_supports", id, supportIds)
}

export function deleteProjects(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => "?").join(", ")
  getDb().prepare(`DELETE FROM projects WHERE id IN (${placeholders})`).run(...ids)
}
