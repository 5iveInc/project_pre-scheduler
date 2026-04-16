import { getProjects, getUsers, getCustomHolidays, getUserPaidLeaves } from "@/database/db"
import { TimelineView } from "@/app/timeline/_components/timeline-view"

async function fetchHolidays(year: number): Promise<string[]> {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/JP`, {
      next: { revalidate: 60 * 60 * 24 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data as { date: string }[]).map((h) => h.date)
  } catch {
    return []
  }
}

export default async function TimelinePage() {
  const [projects, users, customHolidays, userPaidLeaves] = await Promise.all([
    getProjects(),
    getUsers(),
    getCustomHolidays(),
    getUserPaidLeaves(),
  ])
  const activeProjects = projects.filter((p) => !p.archived)

  const today = new Date()
  const currentYear = today.getFullYear()
  const years = [currentYear]
  if (today.getMonth() >= 9) years.push(currentYear + 1) // 10月以降は翌年分も取得

  const holidayArrays = await Promise.all(years.map(fetchHolidays))
  const holidays = holidayArrays.flat()

  return (
    <div className="main">
      <div className="bg-background p-8">
        <div className="mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">タイムライン</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              案件のスケジュールをタイムラインで確認できます。バーをクリックすると編集できます。
            </p>
          </div>

          <TimelineView projects={activeProjects} users={users} holidays={holidays} customHolidays={customHolidays} userPaidLeaves={userPaidLeaves} />
        </div>
      </div>
    </div>
  )
}
