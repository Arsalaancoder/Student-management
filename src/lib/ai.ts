import { supabase } from "./supabase"

export type AIAction = 'explain_assignment' | 'review_submission' | 'feedback_summary' | 'class_summary'

export const invokeAIAssistant = async (action: AIAction, payload: any) => {
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { action, payload }
  })

  if (error) {
    console.error("AI Assistant Error:", error)
    throw new Error(error.message || "Failed to call AI Assistant")
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data.result
}
