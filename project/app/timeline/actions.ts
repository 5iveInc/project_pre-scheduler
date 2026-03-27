"use server"

import { revalidatePath } from "next/cache"
import { updateProject } from "@/database/db"

export async function updateProjectTimelineAction(
  id: number,
  name: string,
  assigneeIds: number[],
  supportIds: number[],
  startDate: string | null,
  endDate: string | null,
  memo: string | null,
) {
  if (!name.trim()) return
  updateProject(id, name.trim(), assigneeIds, supportIds, startDate || null, endDate || null, memo)
  revalidatePath("/timeline")
  revalidatePath("/project")
}
