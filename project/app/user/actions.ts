"use server"

import { revalidatePath } from "next/cache"
import { addUser, deleteUsers } from "@/database/db"

export async function addUserAction(formData: FormData) {
  const name = (formData.get("name") as string).trim()
  const email = (formData.get("email") as string).trim()

  if (!name || !email) throw new Error("名前とメールアドレスは必須です")

  addUser(name, email)
  revalidatePath("/user")
}

export async function deleteUsersAction(ids: number[]) {
  if (ids.length === 0) return
  deleteUsers(ids)
  revalidatePath("/user")
}
