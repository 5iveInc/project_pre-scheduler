import { createClient } from "@libsql/client"

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

async function initSchema() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      memo TEXT,
      volume INTEGER,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project_assignees (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS project_supports (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS project_key_dates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      label      TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS custom_holidays (
      date TEXT PRIMARY KEY
    );
  `)

  // status カラムが未追加の場合のみ追加（既存DBへの後方互換マイグレーション）
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT '相談中'")
  } catch {
    // 既にカラムが存在する場合は無視
  }

  const { rows } = await client.execute("SELECT COUNT(*) as count FROM users")
  const count = rows[0].count as number
  if (count === 0) {
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
      await client.execute({
        sql: "INSERT INTO users (name, email) VALUES (?, ?)",
        args: [user.name, user.email],
      })
    }
  }
}

let _initPromise: Promise<void> | null = null
async function getClient() {
  if (!_initPromise) {
    _initPromise = initSchema()
  }
  await _initPromise
  return client
}

// ── Users ──────────────────────────────────────────────────

export type User = {
  id: number
  name: string
  email: string
  created_at: string
}

export async function getUsers(): Promise<User[]> {
  const db = await getClient()
  const { rows, columns } = await db.execute("SELECT * FROM users ORDER BY id ASC")
  return rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]]))) as unknown as User[]
}

export async function addUser(name: string, email: string): Promise<void> {
  const db = await getClient()
  await db.execute({ sql: "INSERT INTO users (name, email) VALUES (?, ?)", args: [name, email] })
}

export async function updateUser(id: number, name: string, email: string): Promise<void> {
  const db = await getClient()
  await db.execute({ sql: "UPDATE users SET name=?, email=? WHERE id=?", args: [name, email, id] })
}

export async function deleteUsers(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")
  await db.execute({ sql: `DELETE FROM users WHERE id IN (${placeholders})`, args: ids })
}

// ── Projects ──────────────────────────────────────────────

export type KeyDate = { date: string; label: string }

export type ProjectStatus = "相談中" | "受注済"

export type Project = {
  id: number
  name: string
  status: ProjectStatus
  assignee_ids: number[]
  assignee_names: string[]
  support_ids: number[]
  support_names: string[]
  start_date: string | null
  end_date: string | null
  memo: string | null
  volume: number | null
  key_dates: KeyDate[]
  created_at: string
  archived: boolean
}

type RawProject = {
  id: number
  name: string
  status: string
  assignee_ids_str: string | null
  assignee_names_str: string | null
  support_ids_str: string | null
  support_names_str: string | null
  start_date: string | null
  end_date: string | null
  memo: string | null
  volume: number | null
  key_dates_str: string | null
  created_at: string
  archived: number
}

export async function getProjects(): Promise<Project[]> {
  const db = await getClient()
  const { rows } = await db.execute(`
    SELECT
      p.id, p.name, p.status, p.start_date, p.end_date, p.memo, p.volume, p.archived, p.created_at,
      (SELECT GROUP_CONCAT(pa.user_id)
       FROM project_assignees pa WHERE pa.project_id = p.id) AS assignee_ids_str,
      (SELECT GROUP_CONCAT(u.name, '|||')
       FROM project_assignees pa JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = p.id) AS assignee_names_str,
      (SELECT GROUP_CONCAT(ps.user_id)
       FROM project_supports ps WHERE ps.project_id = p.id) AS support_ids_str,
      (SELECT GROUP_CONCAT(u.name, '|||')
       FROM project_supports ps JOIN users u ON u.id = ps.user_id
       WHERE ps.project_id = p.id) AS support_names_str,
      (SELECT GROUP_CONCAT(kd.date || '|||' || kd.label, '~~~')
       FROM (SELECT date, label FROM project_key_dates WHERE project_id = p.id ORDER BY date ASC) kd) AS key_dates_str
    FROM projects p
    ORDER BY p.id ASC
  `)

  return (rows as unknown as RawProject[]).map((row) => ({
    id: row.id,
    name: row.name,
    status: (row.status === "受注済" ? "受注済" : "相談中") as ProjectStatus,
    assignee_ids: row.assignee_ids_str ? row.assignee_ids_str.split(",").map(Number) : [],
    assignee_names: row.assignee_names_str ? row.assignee_names_str.split("|||") : [],
    support_ids: row.support_ids_str ? row.support_ids_str.split(",").map(Number) : [],
    support_names: row.support_names_str ? row.support_names_str.split("|||") : [],
    start_date: row.start_date,
    end_date: row.end_date,
    memo: row.memo,
    volume: row.volume,
    key_dates: row.key_dates_str
      ? row.key_dates_str.split("~~~").map((s) => {
          const sep = s.indexOf("|||")
          return { date: s.slice(0, sep), label: s.slice(sep + 3) }
        })
      : [],
    created_at: row.created_at,
    archived: row.archived === 1,
  }))
}

async function insertJunction(db: typeof client, table: string, projectId: number | bigint, userIds: number[]) {
  for (const userId of userIds) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO ${table} (project_id, user_id) VALUES (?, ?)`,
      args: [projectId, userId],
    })
  }
}

async function replaceKeyDates(db: typeof client, projectId: number | bigint, keyDates: KeyDate[]) {
  await db.execute({ sql: "DELETE FROM project_key_dates WHERE project_id=?", args: [projectId] })
  const sorted = [...keyDates].sort((a, b) => a.date.localeCompare(b.date))
  for (const kd of sorted) {
    if (kd.date) {
      await db.execute({
        sql: "INSERT INTO project_key_dates (project_id, date, label) VALUES (?, ?, ?)",
        args: [projectId, kd.date, kd.label],
      })
    }
  }
}

export async function addProject(
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: ProjectStatus = "相談中",
): Promise<void> {
  const db = await getClient()
  const result = await db.execute({
    sql: "INSERT INTO projects (name, status, start_date, end_date, memo, volume) VALUES (?, ?, ?, ?, ?, ?)",
    args: [name, status, startDate, endDate, memo, volume],
  })
  const newId = result.lastInsertRowid!
  await insertJunction(db, "project_assignees", newId, assigneeIds)
  await insertJunction(db, "project_supports", newId, supportIds)
  await replaceKeyDates(db, newId, keyDates)
}

export async function updateProject(
  id: number,
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: ProjectStatus = "相談中",
): Promise<void> {
  const db = await getClient()
  await db.execute({
    sql: "UPDATE projects SET name=?, status=?, start_date=?, end_date=?, memo=?, volume=? WHERE id=?",
    args: [name, status, startDate, endDate, memo, volume, id],
  })
  await db.execute({ sql: "DELETE FROM project_assignees WHERE project_id=?", args: [id] })
  await db.execute({ sql: "DELETE FROM project_supports WHERE project_id=?", args: [id] })
  await insertJunction(db, "project_assignees", id, assigneeIds)
  await insertJunction(db, "project_supports", id, supportIds)
  await replaceKeyDates(db, id, keyDates)
}

export async function deleteProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")
  await db.execute({ sql: `DELETE FROM projects WHERE id IN (${placeholders})`, args: ids })
}

export async function archiveProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")
  await db.execute({ sql: `UPDATE projects SET archived=1 WHERE id IN (${placeholders})`, args: ids })
}

export async function unarchiveProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")
  await db.execute({ sql: `UPDATE projects SET archived=0 WHERE id IN (${placeholders})`, args: ids })
}

// ── Custom Holidays ────────────────────────────────────────

export async function getCustomHolidays(): Promise<string[]> {
  const db = await getClient()
  const { rows } = await db.execute("SELECT date FROM custom_holidays ORDER BY date ASC")
  return (rows as unknown as { date: string }[]).map((r) => r.date)
}

export async function setCustomHolidays(dates: string[]): Promise<void> {
  const db = await getClient()
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  await db.execute("DELETE FROM custom_holidays")
  for (const date of valid) {
    await db.execute({ sql: "INSERT OR IGNORE INTO custom_holidays (date) VALUES (?)", args: [date] })
  }
}
