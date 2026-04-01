import { getUsers } from "@/database/db"
import { getProjects } from "@/database/db"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10)

  const [users, projects] = await Promise.all([getUsers(), getProjects()])
  const allProjects = projects.filter((p) => !p.archived && p.start_date !== null)

  const activeProjects = allProjects.filter(
    (p) => p.end_date !== null && p.start_date! <= today && today <= p.end_date,
  )

  const futureProjects = allProjects
    .filter((p) => p.start_date! > today)
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!))

  const userCards = users
    .map((user) => {
      const assigned = activeProjects.filter((p) => p.assignee_ids.includes(user.id))
      const nextProjects = futureProjects.filter((p) => p.assignee_ids.includes(user.id))
      return { user, assigned, nextProjects }
    })
    .sort((a, b) => b.assigned.length - a.assigned.length)

  return (
    <div className="main">
      <div className="p-10">
        <h2 className="text-3xl mb-10 font-bold">ダッシュボード</h2>

        <section>
          <h3 className="text-xl font-semibold mb-5">アサイン状況</h3>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {userCards.map(({ user, assigned, nextProjects }) => (
              <li key={user.id}>
                <Card className="h-full">
                  <CardHeader className="border-b">
                    <CardTitle className="font-bold">{user.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 pt-3">
                    <div>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">作業中</p>
                      {assigned.length === 0 ? (
                        <p className="text-sm text-muted-foreground">なし</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {assigned.map((project) => (
                            <li key={project.id} className="text-sm leading-snug">
                              {project.volume !== null && (
                                <span className="mr-1 text-muted-foreground">【Lv.{project.volume}】</span>
                              )}
                              <span className="font-bold">{project.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="border-t pt-4">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">次の案件</p>
                      {nextProjects.length === 0 ? (
                        <p className="text-sm text-muted-foreground">なし</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {nextProjects.map((project) => (
                            <li key={project.id} className="text-sm leading-snug text-muted-foreground">
                              <div className="block">
                                <span className="mr-3">開始日：{project.start_date!.slice(5, 7).replace(/^0/, "")}/{project.start_date!.slice(8, 10).replace(/^0/, "")}</span>
                                {project.volume !== null && (
                                  <span className="mr-1">【Lv.{project.volume}】</span>
                                )}
                              </div>
                              <span className="font-bold text-foreground">{project.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
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
