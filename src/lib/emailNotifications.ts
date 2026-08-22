import { supabase } from "./supabase"

export interface EmailNotificationResult {
  success: boolean
  total_eligible: number
  sent_count: number
  failed_count: number
  already_notified_count: number
  message: string
}

/**
 * Triggers the server-side Supabase Edge Function to send email notifications
 * for a newly posted assignment to all eligible registered students.
 * 
 * Safety Guarantee: Email failure will NEVER throw an unhandled exception or break assignment creation.
 */
export async function triggerAssignmentEmailNotification(
  assignmentId: string
): Promise<EmailNotificationResult> {
  console.log(`Assignment created: ${assignmentId}`)
  console.log("Starting assignment email notification...")
  console.log("Finding eligible students...")

  try {
    const { data, error } = await supabase.functions.invoke('send-assignment-notification', {
      body: { assignment_id: assignmentId }
    })

    if (error) {
      console.warn("Email failed: function invocation error —", error.message || error)
      return {
        success: false,
        total_eligible: 0,
        sent_count: 0,
        failed_count: 0,
        already_notified_count: 0,
        message: error.message || "Email notification service temporary error."
      }
    }

    const eligibleCount = data?.total_eligible ?? 0
    console.log(`Eligible students found: ${eligibleCount}`)
    console.log("Sending emails...")

    if (data?.sent_count > 0) {
      console.log(`Email sent: ${data.sent_count} student(s) notified successfully.`)
    }

    if (data?.failed_count > 0) {
      console.warn(`Email failed: ${data.failed_count} email notification(s) failed — ${data.message}`)
    }

    return {
      success: true,
      total_eligible: eligibleCount,
      sent_count: data?.sent_count ?? 0,
      failed_count: data?.failed_count ?? 0,
      already_notified_count: data?.already_notified_count ?? 0,
      message: data?.message || "Email notifications processed."
    }
  } catch (err: any) {
    console.error(`Email failed: network or execution exception — ${err.message || String(err)}`)
    return {
      success: false,
      total_eligible: 0,
      sent_count: 0,
      failed_count: 0,
      already_notified_count: 0,
      message: err.message || "Could not reach email notification service."
    }
  }
}
