"use server"

import { revalidatePath } from "next/cache"
import { addProject, updateProject, deleteProjects } from "@/database/db"

export async function addProjectAction(formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
  const startDate = formData.get("startDate") as string | null
  const endDate = formData.get("endDate") as string | null

  if (!name) throw new Error("案件名は必須です")

  addProject(name, assigneeIds, startDate || null, endDate || null)
  revalidatePath("/project")
}

export async function updateProjectAction(
  id: number,
  name: string,
  assigneeIds: number[],
  startDate: string | null,
  endDate: string | null,
) {
  if (!name.trim()) return
  updateProject(id, name.trim(), assigneeIds, startDate || null, endDate || null)
  revalidatePath("/project")
}

export async function deleteProjectsAction(ids: number[]) {
  if (ids.length === 0) return
  deleteProjects(ids)
  revalidatePath("/project")
}
