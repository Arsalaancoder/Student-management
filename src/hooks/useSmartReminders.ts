import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { createNotification } from "@/lib/notifications"

export function useSmartReminders() {
  const { profile } = useAuth()
  const [remindersChecked, setRemindersChecked] = useState(false)

  useEffect(() => {
    if (!profile || profile.role !== 'student' || remindersChecked) return

    const checkReminders = async () => {
      try {
        // 1. Get student's subjects
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("subject_id, subjects(name)")
          .eq("student_id", profile.id)

        if (!enrollments || enrollments.length === 0) return

        const subjectIds = enrollments.map(e => e.subject_id)

        // 2. Get active assignments for those subjects
        const now = new Date()
        const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

        const { data: assignments } = await supabase
          .from("assignments")
          .select("id, title, deadline, subject_id")
          .in("subject_id", subjectIds)
          .gte("deadline", now.toISOString())
          .lte("deadline", fortyEightHoursFromNow.toISOString())

        if (!assignments || assignments.length === 0) {
          setRemindersChecked(true)
          return
        }

        // 3. Check if they have already submitted them
        const { data: submissions } = await supabase
          .from("submissions")
          .select("assignment_id, status")
          .eq("student_id", profile.id)
          .in("assignment_id", assignments.map(a => a.id))

        const submittedAssignmentIds = (submissions || [])
          .filter(s => s.status === 'submitted' || s.status === 'under_review' || s.status === 'approved' || s.status === 'graded')
          .map(s => s.assignment_id)

        const approachingAssignments = assignments.filter(a => !submittedAssignmentIds.includes(a.id))

        if (approachingAssignments.length === 0) {
          setRemindersChecked(true)
          return
        }

        // 4. Check if we already sent a reminder for these recently (to prevent spam)
        const { data: pastReminders } = await supabase
          .from("notifications")
          .select("message")
          .eq("user_id", profile.id)
          .eq("type", "assignment_reminder")

        for (const assign of approachingAssignments) {
          const subject = enrollments.find(e => e.subject_id === assign.subject_id)?.subjects?.name || 'a subject'
          
          // Basic spam check: if message contains the assignment title, skip it
          const alreadyReminded = (pastReminders || []).some(n => n.message.includes(assign.title))
          
          if (!alreadyReminded) {
            const timeDiff = new Date(assign.deadline).getTime() - now.getTime()
            const isTomorrow = timeDiff <= 24 * 60 * 60 * 1000

            await createNotification(
              profile.id,
              "Deadline Approaching",
              `Your ${subject} assignment "${assign.title}" is due ${isTomorrow ? 'tomorrow' : 'soon'}.`,
              "assignment_reminder"
            )
          }
        }

        setRemindersChecked(true)
      } catch (err) {
        console.error("Error checking smart reminders:", err)
      }
    }

    checkReminders()
  }, [profile, remindersChecked])

  return remindersChecked
}
