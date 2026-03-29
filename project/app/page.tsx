import { getUsers } from "@/database/db"
import { getProjects } from "@/database/db"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  const today = new Date().toISOString().slice(0, 10)

  const users = getUsers()
  const allProjects = getProjects().filter((p) => !p.archived && p.start_date !== null)

  const activeProjects = allProjects.filter(
    (p) => p.end_date !== null && p.start_date! <= today && today <= p.end_date,
  )

  const futureProjects = allProjects
    .filter((p) => p.start_date! > today)
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!))

  const userCards = users
    .map((user) => {
      const assigned = activeProjects.filter((p) => p.assignee_ids.includes(user.id))
      const next = futureProjects.find((p) => p.assignee_ids.includes(user.id)) ?? null
      return { user, assigned, next }
    })
    .sort((a, b) => b.assigned.length - a.assigned.length)

  return (
    <div className="main">
      <div className="p-10">
        <h2 className="text-3xl mb-10 font-bold">ダッシュボード</h2>

        <section>
          <h3 className="text-xl font-semibold mb-5">現在の状況</h3>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {userCards.map(({ user, assigned, next }) => (
              <li key={user.id}>
                <Card className="h-full">
                  <CardHeader className="border-b">
                    <CardTitle>{user.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    {assigned.length === 0 ? (
                      <p className="text-sm text-muted-foreground">アサイン中の案件なし</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {assigned.map((project) => (
                          <li key={project.id} className="flex items-start gap-2">
                            <Badge variant="outline" className="shrink-0">
                              作業中
                            </Badge>
                            <span className="text-sm leading-snug">
                              {project.volume !== null && (
                                <span className="mr-1 text-muted-foreground">【Lv.{project.volume}】</span>
                              )}
                              <span className="font-bold">{project.name}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {next && (
                      <div className="mt-3 border-t pt-3">
                        <div className="flex items-start gap-2 mb-3">
                          <Badge variant="secondary" className="shrink-0">
                            次の案件
                          </Badge>
                          <span className="text-sm leading-snug text-muted-foreground">
                            <span className="mr-1">【開始日：{next.start_date!.slice(5, 7).replace(/^0/, "")}/{next.start_date!.slice(8, 10).replace(/^0/, "")}】</span>
                            {next.volume !== null && (
                              <span className="mr-1">【Lv.{next.volume}】</span>
                            )}
                            {/* {next.name} */}
                          </span>
                        </div>
                        <p className="font-bold">{next.name}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
