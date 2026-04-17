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
    CREATE TABLE IF NOT EXISTS project_stakeholders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_key_dates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      label      TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS project_links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label      TEXT NOT NULL DEFAULT '',
      url        TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS custom_holidays (
      date TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS user_paid_leaves (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      PRIMARY KEY (user_id, date)
    );
  `)

  // status カラムが未追加の場合のみ追加（既存DBへの後方互換マイグレーション）
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT '相談中'")
  } catch {
    // 既にカラムが存在する場合は無視
  }

  // parent_id カラムが未追加の場合のみ追加（既存DBへの後方互換マイグレーション）
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN parent_id INTEGER REFERENCES projects(id) ON DELETE SET NULL")
  } catch {
    // 既にカラムが存在する場合は無視
  }

  // client_name カラムが未追加の場合のみ追加（既存DBへの後方互換マイグレーション）
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN client_name TEXT")
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
export type ProjectLink = { label: string; url: string }
export type Stakeholder = { id: number; name: string }

export type ProjectStatus = "相談中" | "受注済"

export type Project = {
  id: number
  name: string
  status: ProjectStatus
  client_name: string | null
  assignee_ids: number[]
  assignee_names: string[]
  stakeholders: Stakeholder[]
  start_date: string | null
  end_date: string | null
  memo: string | null
  volume: number | null
  key_dates: KeyDate[]
  links: ProjectLink[]
  created_at: string
  archived: boolean
  parent_id: number | null
  has_children: boolean
}

type RawProject = {
  id: number
  name: string
  status: string
  client_name: string | null
  assignee_ids_str: string | null
  assignee_names_str: string | null
  stakeholders_str: string | null
  start_date: string | null
  end_date: string | null
  memo: string | null
  volume: number | null
  key_dates_str: string | null
  links_str: string | null
  created_at: string
  archived: number
  parent_id: number | null
  has_children: number
}

export async function getProjects(): Promise<Project[]> {
  const db = await getClient()
  const { rows } = await db.execute(`
    SELECT
      p.id, p.name, p.status, p.client_name, p.start_date, p.end_date, p.memo, p.volume, p.archived, p.created_at,
      p.parent_id,
      (SELECT COUNT(*) FROM projects c WHERE c.parent_id = p.id) AS has_children,
      (SELECT GROUP_CONCAT(pa.user_id)
       FROM project_assignees pa WHERE pa.project_id = p.id) AS assignee_ids_str,
      (SELECT GROUP_CONCAT(u.name, '|||')
       FROM project_assignees pa JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = p.id) AS assignee_names_str,
      (SELECT json_group_array(json_object('id', s.id, 'name', s.name))
       FROM project_stakeholders s WHERE s.project_id = p.id) AS stakeholders_str,
      (SELECT GROUP_CONCAT(kd.date || '|||' || kd.label, '~~~')
       FROM (SELECT date, label FROM project_key_dates WHERE project_id = p.id ORDER BY date ASC) kd) AS key_dates_str,
      (SELECT GROUP_CONCAT(pl.label || '|||' || pl.url, '~~~')
       FROM (SELECT label, url FROM project_links WHERE project_id = COALESCE(p.parent_id, p.id) ORDER BY id ASC) pl) AS links_str
    FROM projects p
    ORDER BY p.id ASC
  `)

  return (rows as unknown as RawProject[]).map((row) => ({
    id: row.id,
    name: row.name,
    status: (row.status === "受注済" ? "受注済" : "相談中") as ProjectStatus,
    client_name: row.client_name,
    assignee_ids: row.assignee_ids_str ? row.assignee_ids_str.split(",").map(Number) : [],
    assignee_names: row.assignee_names_str ? row.assignee_names_str.split("|||") : [],
    stakeholders: row.stakeholders_str ? JSON.parse(row.stakeholders_str) : [],
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
    links: row.links_str
      ? row.links_str.split("~~~").map((s) => {
          const sep = s.indexOf("|||")
          return { label: s.slice(0, sep), url: s.slice(sep + 3) }
        })
      : [],
    created_at: row.created_at,
    archived: row.archived === 1,
    parent_id: row.parent_id,
    has_children: row.has_children > 0,
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

async function replaceLinks(db: typeof client, projectId: number | bigint, links: ProjectLink[]) {
  await db.execute({ sql: "DELETE FROM project_links WHERE project_id=?", args: [projectId] })
  for (const link of links) {
    if (link.url) {
      await db.execute({
        sql: "INSERT INTO project_links (project_id, label, url) VALUES (?, ?, ?)",
        args: [projectId, link.label, link.url],
      })
    }
  }
}

async function replaceKeyDates(db: typeof client, projectId: number | bigint, keyDates: KeyDate[]) {
  await db.execute({ sql: "DELETE FROM project_key_dates WHERE project_id=?", args: [projectId] })
  const sorted = [...keyDates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
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
  clientName: string | null,
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: ProjectStatus = "相談中",
  links: ProjectLink[] = [],
): Promise<void> {
  const db = await getClient()
  const result = await db.execute({
    sql: "INSERT INTO projects (name, status, client_name, start_date, end_date, memo, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [name, status, clientName, startDate, endDate, memo, volume],
  })
  const newId = result.lastInsertRowid!
  await insertJunction(db, "project_assignees", newId, assigneeIds)
  await replaceKeyDates(db, newId, keyDates)
  await replaceLinks(db, newId, links)
}

export async function addChildProject(
  parentId: number,
  name: string,
  assigneeIds: number[],
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: ProjectStatus = "相談中",
  links: ProjectLink[] = [],
): Promise<void> {
  const db = await getClient()
  const result = await db.execute({
    sql: "INSERT INTO projects (name, status, start_date, end_date, memo, volume, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [name, status, startDate, endDate, memo, volume, parentId],
  })
  const newId = result.lastInsertRowid!
  await insertJunction(db, "project_assignees", newId, assigneeIds)
  await replaceKeyDates(db, newId, keyDates)
  // リンクは親単位で管理
  await replaceLinks(db, parentId, links)
}

export async function updateProject(
  id: number,
  name: string,
  assigneeIds: number[],
  clientName: string | null,
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
  volume: number | null,
  keyDates: KeyDate[] = [],
  status: ProjectStatus = "相談中",
  links: ProjectLink[] = [],
): Promise<void> {
  const db = await getClient()
  await db.execute({
    sql: "UPDATE projects SET name=?, status=?, client_name=?, start_date=?, end_date=?, memo=?, volume=? WHERE id=?",
    args: [name, status, clientName, startDate, endDate, memo, volume, id],
  })
  await db.execute({ sql: "DELETE FROM project_assignees WHERE project_id=?", args: [id] })
  await insertJunction(db, "project_assignees", id, assigneeIds)
  await replaceKeyDates(db, id, keyDates)
  // リンクは親単位で管理（子タスクの場合は親IDに保存）
  const { rows: parentRows } = await db.execute({ sql: "SELECT parent_id FROM projects WHERE id=?", args: [id] })
  const parentId = (parentRows[0] as unknown as { parent_id: number | null })?.parent_id ?? null
  await replaceLinks(db, parentId ?? id, links)
}

export async function addStakeholder(projectId: number, name: string): Promise<Stakeholder> {
  const db = await getClient()
  const result = await db.execute({
    sql: "INSERT INTO project_stakeholders (project_id, name) VALUES (?, ?)",
    args: [projectId, name],
  })
  return { id: Number(result.lastInsertRowid!), name }
}

export async function removeStakeholder(id: number): Promise<void> {
  const db = await getClient()
  await db.execute({ sql: "DELETE FROM project_stakeholders WHERE id=?", args: [id] })
}

export async function updateProjectDates(
  id: number,
  startDate: string | null,
  endDate: string | null,
): Promise<void> {
  const db = await getClient()
  await db.execute({
    sql: "UPDATE projects SET start_date=?, end_date=? WHERE id=?",
    args: [startDate, endDate, id],
  })
}

export async function deleteProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")

  // 子タスクのIDを取得（関連データ削除に必要）
  const { rows: childRows } = await db.execute({
    sql: `SELECT id FROM projects WHERE parent_id IN (${placeholders})`,
    args: ids,
  })
  const childIds = (childRows as unknown as { id: number }[]).map((r) => r.id)
  const allIds = [...ids, ...childIds]
  const allPlaceholders = allIds.map(() => "?").join(", ")

  if (allIds.length > 0) {
    await db.execute({ sql: `DELETE FROM project_assignees   WHERE project_id IN (${allPlaceholders})`, args: allIds })
    await db.execute({ sql: `DELETE FROM project_key_dates   WHERE project_id IN (${allPlaceholders})`, args: allIds })
    await db.execute({ sql: `DELETE FROM project_links       WHERE project_id IN (${allPlaceholders})`, args: allIds })
    await db.execute({ sql: `DELETE FROM project_stakeholders WHERE project_id IN (${allPlaceholders})`, args: allIds })
  }

  await db.execute({ sql: `DELETE FROM projects WHERE parent_id IN (${placeholders})`, args: ids })
  await db.execute({ sql: `DELETE FROM projects WHERE id IN (${placeholders})`, args: ids })
}

export async function archiveProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")
  await db.execute({ sql: `UPDATE projects SET archived=1 WHERE id IN (${placeholders})`, args: ids })
  // 子タスクも同時にアーカイブ
  await db.execute({ sql: `UPDATE projects SET archived=1 WHERE parent_id IN (${placeholders})`, args: ids })
}

export async function unarchiveProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")
  await db.execute({ sql: `UPDATE projects SET archived=0 WHERE id IN (${placeholders})`, args: ids })
  // 子タスクも同時に復帰
  await db.execute({ sql: `UPDATE projects SET archived=0 WHERE parent_id IN (${placeholders})`, args: ids })
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

// ── User Paid Leaves ───────────────────────────────────────

export async function getUserPaidLeaves(): Promise<Record<number, string[]>> {
  const db = await getClient()
  const { rows } = await db.execute("SELECT user_id, date FROM user_paid_leaves ORDER BY user_id, date ASC")
  const result: Record<number, string[]> = {}
  for (const row of rows as unknown as { user_id: number; date: string }[]) {
    if (!result[row.user_id]) result[row.user_id] = []
    result[row.user_id].push(row.date)
  }
  return result
}

export async function setUserPaidLeaves(userId: number, dates: string[]): Promise<void> {
  const db = await getClient()
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  await db.execute({ sql: "DELETE FROM user_paid_leaves WHERE user_id=?", args: [userId] })
  for (const date of valid) {
    await db.execute({ sql: "INSERT OR IGNORE INTO user_paid_leaves (user_id, date) VALUES (?, ?)", args: [userId, date] })
  }
}
