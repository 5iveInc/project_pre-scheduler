import { createClient, type InStatement } from "@libsql/client"

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
    CREATE TABLE IF NOT EXISTS project_child_stakeholders (
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stakeholder_id INTEGER NOT NULL REFERENCES project_stakeholders(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, stakeholder_id)
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
    CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);
    CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects(parent_id);
    CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
    CREATE INDEX IF NOT EXISTS idx_projects_end_date ON projects(end_date);
    CREATE INDEX IF NOT EXISTS idx_project_assignees_project_id ON project_assignees(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_assignees_user_id ON project_assignees(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_child_stakeholders_project_id ON project_child_stakeholders(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_key_dates_project_id ON project_key_dates(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_links_project_id ON project_links(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_stakeholders_project_id ON project_stakeholders(project_id);
    CREATE INDEX IF NOT EXISTS idx_user_paid_leaves_user_id ON user_paid_leaves(user_id);
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

  // assignee_type カラムが未追加の場合のみ追加（既存DBへの後方互換マイグレーション）
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN assignee_type TEXT NOT NULL DEFAULT '5ive'")
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

async function batchWrite(db: typeof client, statements: InStatement[]): Promise<void> {
  if (statements.length === 0) return
  await db.batch(statements, "write")
}

// ── Projects ──────────────────────────────────────────────

export type KeyDate = { date: string; label: string }
export type ProjectLink = { label: string; url: string }
export type Stakeholder = { id: number; name: string }

export type ProjectStatus = "相談中" | "受注済"
export type AssigneeType = "5ive" | "client" | "stakeholder"

export type Project = {
  id: number
  name: string
  status: ProjectStatus
  client_name: string | null
  assignee_ids: number[]
  assignee_names: string[]
  assignee_type: AssigneeType
  stakeholder_assignee_ids: number[]
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
  assignee_type: string
  assignee_ids_str: string | null
  assignee_names_str: string | null
  stakeholder_assignee_ids_str: string | null
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

async function getProjectsByWhere(whereSql = "", args: Array<string | number> = []): Promise<Project[]> {
  const db = await getClient()
  const whereClause = whereSql ? `WHERE ${whereSql}` : ""
  const { rows } = await db.execute({
    sql: `
    SELECT
      p.id, p.name, p.status, p.client_name, p.start_date, p.end_date, p.memo, p.volume, p.archived, p.created_at,
      p.parent_id, p.assignee_type,
      (SELECT COUNT(*) FROM projects c WHERE c.parent_id = p.id) AS has_children,
      (SELECT GROUP_CONCAT(pa.user_id)
       FROM project_assignees pa WHERE pa.project_id = p.id) AS assignee_ids_str,
      CASE
        WHEN p.assignee_type = 'client' THEN 'クライアント'
        WHEN p.assignee_type = 'stakeholder' THEN (
          SELECT GROUP_CONCAT(s.name, '|||')
          FROM project_child_stakeholders pcs
          JOIN project_stakeholders s ON s.id = pcs.stakeholder_id
          WHERE pcs.project_id = p.id
        )
        ELSE (
          SELECT GROUP_CONCAT(u.name, '|||')
          FROM project_assignees pa JOIN users u ON u.id = pa.user_id
          WHERE pa.project_id = p.id
        )
      END AS assignee_names_str,
      (SELECT GROUP_CONCAT(pcs.stakeholder_id)
       FROM project_child_stakeholders pcs WHERE pcs.project_id = p.id) AS stakeholder_assignee_ids_str,
      (SELECT json_group_array(json_object('id', s.id, 'name', s.name))
       FROM project_stakeholders s WHERE s.project_id = p.id) AS stakeholders_str,
      (SELECT GROUP_CONCAT(kd.date || '|||' || kd.label, '~~~')
       FROM (SELECT date, label FROM project_key_dates WHERE project_id = p.id ORDER BY date ASC) kd) AS key_dates_str,
      (SELECT GROUP_CONCAT(pl.label || '|||' || pl.url, '~~~')
       FROM (SELECT label, url FROM project_links WHERE project_id = COALESCE(p.parent_id, p.id) ORDER BY id ASC) pl) AS links_str
    FROM projects p
    ${whereClause}
    ORDER BY p.id ASC
  `,
    args,
  })

  return (rows as unknown as RawProject[]).map((row) => ({
    id: row.id,
    name: row.name,
    status: (row.status === "受注済" ? "受注済" : "相談中") as ProjectStatus,
    client_name: row.client_name,
    assignee_type: (["5ive", "client", "stakeholder"].includes(row.assignee_type) ? row.assignee_type : "5ive") as AssigneeType,
    assignee_ids: row.assignee_ids_str ? row.assignee_ids_str.split(",").map(Number) : [],
    assignee_names: row.assignee_names_str ? row.assignee_names_str.split("|||") : [],
    stakeholder_assignee_ids: row.stakeholder_assignee_ids_str ? row.stakeholder_assignee_ids_str.split(",").map(Number) : [],
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

export async function getProjects(): Promise<Project[]> {
  return getProjectsByWhere()
}

export async function getActiveProjects(): Promise<Project[]> {
  return getProjectsByWhere("p.archived = 0")
}

async function insertJunction(db: typeof client, table: string, projectId: number | bigint, userIds: number[]) {
  await batchWrite(db, userIds.map((userId) => ({
    sql: `INSERT OR IGNORE INTO ${table} (project_id, user_id) VALUES (?, ?)`,
    args: [projectId, userId],
  })))
}

async function replaceChildStakeholders(db: typeof client, projectId: number | bigint, stakeholderIds: number[]) {
  await batchWrite(db, [
    { sql: "DELETE FROM project_child_stakeholders WHERE project_id=?", args: [projectId] },
    ...stakeholderIds.map((sid) => ({
      sql: "INSERT OR IGNORE INTO project_child_stakeholders (project_id, stakeholder_id) VALUES (?, ?)",
      args: [projectId, sid],
    })),
  ])
}

async function replaceLinks(db: typeof client, projectId: number | bigint, links: ProjectLink[]) {
  await batchWrite(db, [
    { sql: "DELETE FROM project_links WHERE project_id=?", args: [projectId] },
    ...links.filter((link) => link.url).map((link) => ({
      sql: "INSERT INTO project_links (project_id, label, url) VALUES (?, ?, ?)",
      args: [projectId, link.label, link.url],
    })),
  ])
}

async function replaceKeyDates(db: typeof client, projectId: number | bigint, keyDates: KeyDate[]) {
  const sorted = [...keyDates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  await batchWrite(db, [
    { sql: "DELETE FROM project_key_dates WHERE project_id=?", args: [projectId] },
    ...sorted.filter((kd) => kd.date).map((kd) => ({
      sql: "INSERT INTO project_key_dates (project_id, date, label) VALUES (?, ?, ?)",
      args: [projectId, kd.date, kd.label],
    })),
  ])
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
  assigneeType: AssigneeType = "5ive",
  stakeholderAssigneeIds: number[] = [],
): Promise<void> {
  const db = await getClient()
  const result = await db.execute({
    sql: "INSERT INTO projects (name, status, start_date, end_date, memo, volume, parent_id, assignee_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [name, status, startDate, endDate, memo, volume, parentId, assigneeType],
  })
  const newId = result.lastInsertRowid!
  if (assigneeType === "5ive") await insertJunction(db, "project_assignees", newId, assigneeIds)
  if (assigneeType === "stakeholder") await replaceChildStakeholders(db, newId, stakeholderAssigneeIds)
  await replaceKeyDates(db, newId, keyDates)
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
  assigneeType: AssigneeType = "5ive",
  stakeholderAssigneeIds: number[] = [],
): Promise<void> {
  const db = await getClient()
  const { rows: parentRows } = await db.execute({ sql: "SELECT parent_id FROM projects WHERE id=?", args: [id] })
  const parentId = (parentRows[0] as unknown as { parent_id: number | null })?.parent_id ?? null
  const sortedKeyDates = [...keyDates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  await batchWrite(db, [
    {
      sql: "UPDATE projects SET name=?, status=?, client_name=?, start_date=?, end_date=?, memo=?, volume=?, assignee_type=? WHERE id=?",
      args: [name, status, clientName, startDate, endDate, memo, volume, assigneeType, id],
    },
    { sql: "DELETE FROM project_assignees WHERE project_id=?", args: [id] },
    ...(
      assigneeType === "5ive"
        ? assigneeIds.map((userId) => ({
            sql: "INSERT OR IGNORE INTO project_assignees (project_id, user_id) VALUES (?, ?)",
            args: [id, userId],
          }))
        : []
    ),
    { sql: "DELETE FROM project_child_stakeholders WHERE project_id=?", args: [id] },
    ...(
      assigneeType === "stakeholder"
        ? stakeholderAssigneeIds.map((stakeholderId) => ({
            sql: "INSERT OR IGNORE INTO project_child_stakeholders (project_id, stakeholder_id) VALUES (?, ?)",
            args: [id, stakeholderId],
          }))
        : []
    ),
    { sql: "DELETE FROM project_key_dates WHERE project_id=?", args: [id] },
    ...sortedKeyDates.filter((kd) => kd.date).map((kd) => ({
      sql: "INSERT INTO project_key_dates (project_id, date, label) VALUES (?, ?, ?)",
      args: [id, kd.date, kd.label],
    })),
    // リンクは親案件のみで管理。子タスク編集時はリンクに触れない
    ...(parentId === null
      ? [
          { sql: "DELETE FROM project_links WHERE project_id=?", args: [id] },
          ...links.filter((link) => link.url).map((link) => ({
            sql: "INSERT INTO project_links (project_id, label, url) VALUES (?, ?, ?)",
            args: [id, link.label, link.url],
          })),
        ]
      : []),
  ])
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
  await batchWrite(db, [
    { sql: "DELETE FROM project_child_stakeholders WHERE stakeholder_id=?", args: [id] },
    { sql: "DELETE FROM project_stakeholders WHERE id=?", args: [id] },
  ])
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

  // 子タスク（フェーズ）のIDを取得
  const { rows: childRows } = await db.execute({
    sql: `SELECT id FROM projects WHERE parent_id IN (${placeholders})`,
    args: ids,
  })
  const childIds = (childRows as unknown as { id: number }[]).map((r) => r.id)

  // 孫タスク（ワーク）のIDを取得
  let grandchildIds: number[] = []
  if (childIds.length > 0) {
    const childPlaceholders = childIds.map(() => "?").join(", ")
    const { rows: grandchildRows } = await db.execute({
      sql: `SELECT id FROM projects WHERE parent_id IN (${childPlaceholders})`,
      args: childIds,
    })
    grandchildIds = (grandchildRows as unknown as { id: number }[]).map((r) => r.id)
  }

  const allIds = [...ids, ...childIds, ...grandchildIds]
  const allPlaceholders = allIds.map(() => "?").join(", ")

  await batchWrite(db, [
    { sql: `DELETE FROM project_assignees          WHERE project_id IN (${allPlaceholders})`, args: allIds },
    { sql: `DELETE FROM project_child_stakeholders WHERE project_id IN (${allPlaceholders})`, args: allIds },
    { sql: `DELETE FROM project_key_dates          WHERE project_id IN (${allPlaceholders})`, args: allIds },
    { sql: `DELETE FROM project_links              WHERE project_id IN (${allPlaceholders})`, args: allIds },
    { sql: `DELETE FROM project_stakeholders       WHERE project_id IN (${allPlaceholders})`, args: allIds },
    { sql: `DELETE FROM projects                   WHERE id         IN (${allPlaceholders})`, args: allIds },
  ])
}

export async function archiveProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")

  const { rows: childRows } = await db.execute({
    sql: `SELECT id FROM projects WHERE parent_id IN (${placeholders})`,
    args: ids,
  })
  const childIds = (childRows as unknown as { id: number }[]).map((r) => r.id)

  let grandchildIds: number[] = []
  if (childIds.length > 0) {
    const childPlaceholders = childIds.map(() => "?").join(", ")
    const { rows: grandchildRows } = await db.execute({
      sql: `SELECT id FROM projects WHERE parent_id IN (${childPlaceholders})`,
      args: childIds,
    })
    grandchildIds = (grandchildRows as unknown as { id: number }[]).map((r) => r.id)
  }

  const allIds = [...ids, ...childIds, ...grandchildIds]
  const allPlaceholders = allIds.map(() => "?").join(", ")
  await batchWrite(db, [
    { sql: `UPDATE projects SET archived=1 WHERE id IN (${allPlaceholders})`, args: allIds },
  ])
}

export async function unarchiveProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getClient()
  const placeholders = ids.map(() => "?").join(", ")

  const { rows: childRows } = await db.execute({
    sql: `SELECT id FROM projects WHERE parent_id IN (${placeholders})`,
    args: ids,
  })
  const childIds = (childRows as unknown as { id: number }[]).map((r) => r.id)

  let grandchildIds: number[] = []
  if (childIds.length > 0) {
    const childPlaceholders = childIds.map(() => "?").join(", ")
    const { rows: grandchildRows } = await db.execute({
      sql: `SELECT id FROM projects WHERE parent_id IN (${childPlaceholders})`,
      args: childIds,
    })
    grandchildIds = (grandchildRows as unknown as { id: number }[]).map((r) => r.id)
  }

  const allIds = [...ids, ...childIds, ...grandchildIds]
  const allPlaceholders = allIds.map(() => "?").join(", ")
  await batchWrite(db, [
    { sql: `UPDATE projects SET archived=0 WHERE id IN (${allPlaceholders})`, args: allIds },
  ])
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
  await batchWrite(db, [
    { sql: "DELETE FROM custom_holidays" },
    ...valid.map((date) => ({ sql: "INSERT OR IGNORE INTO custom_holidays (date) VALUES (?)", args: [date] })),
  ])
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
  await batchWrite(db, [
    { sql: "DELETE FROM user_paid_leaves WHERE user_id=?", args: [userId] },
    ...valid.map((date) => ({
      sql: "INSERT OR IGNORE INTO user_paid_leaves (user_id, date) VALUES (?, ?)",
      args: [userId, date],
    })),
  ])
}
