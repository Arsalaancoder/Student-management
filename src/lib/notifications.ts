import { supabase } from "./supabase"

export type NotificationType = 
  | 'new_assignment' 
  | 'assignment_reminder' 
  | 'submission_confirmation' 
  | 'assignment_returned' 
  | 'assignment_approved'
  | 'grade_published' 
  | 'new_submission' 
  | 'resubmission'

/**
 * Create a notification for a single user.
 */
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType
): Promise<boolean> => {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      is_read: false
    })

    if (error) {
      console.error("Error creating notification:", error)
      return false
    }

    return true
  } catch (err) {
    console.error("Exception creating notification:", err)
    return false
  }
}

/**
 * Create a notification for all students enrolled in a subject.
 * Returns { success: boolean, sentCount: number, enrolledCount: number }
 */
export const createNotificationForSubject = async (
  subjectId: string,
  title: string,
  message: string,
  type: NotificationType,
  targetYear?: number | null,
  deduplicationKey?: { assignmentId: string } // used to prevent duplicate notifications
): Promise<{ success: boolean; sentCount: number; enrolledCount: number }> => {
  try {
    // Fetch enrolled students for this subject
    const { data: allEnrollments, error: enrollErr } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('subject_id', subjectId)

    if (enrollErr) {
      console.error("Error fetching enrollments for notification:", enrollErr)
      return { success: false, sentCount: 0, enrolledCount: 0 }
    }

    const enrolledCount = allEnrollments?.length ?? 0

    if (enrolledCount === 0) {
      console.warn(
        `[Notifications] No students enrolled in subject ${subjectId}. ` +
        `No notifications sent for "${title}". Students need to enroll first.`
      )
      return { success: true, sentCount: 0, enrolledCount: 0 }
    }

    let studentIds = (allEnrollments || []).map(e => e.student_id).filter(Boolean) as string[]

    // If targetYear is specified, filter for students matching that year
    if (targetYear && studentIds.length > 0) {
      const { data: matchingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .in('id', studentIds)
        .eq('year', targetYear)

      const eligibleSet = new Set(matchingProfiles?.map(p => p.id) ?? [])
      studentIds = studentIds.filter(id => eligibleSet.has(id))
    }

    if (studentIds.length === 0) {
      console.log(`[Notifications] No enrolled students found for year ${targetYear}. Skipping notifications.`)
      return { success: true, sentCount: 0, enrolledCount }
    }

    // If deduplication key provided, remove students who already have this notification
    if (deduplicationKey?.assignmentId) {
      const { data: existingNotifs } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('type', type)
        .in('user_id', studentIds)
        .ilike('message', `%${deduplicationKey.assignmentId.slice(0, 8)}%`)

      const alreadyNotified = new Set(existingNotifs?.map(n => n.user_id) ?? [])
      studentIds = studentIds.filter(id => !alreadyNotified.has(id))

      if (studentIds.length === 0) {
        console.log(`[Notifications] All eligible students already notified. Skipping duplicates.`)
        return { success: true, sentCount: 0, enrolledCount }
      }
    }

    // Build notification records
    const notifications = studentIds.map(student_id => ({
      user_id: student_id,
      title,
      message,
      type,
      is_read: false,
    }))

    const { error: insertError } = await supabase.from('notifications').insert(notifications)

    if (insertError) {
      console.error("Error creating bulk notifications:", insertError)
      return { success: false, sentCount: 0, enrolledCount }
    }

    console.log(`[Notifications] Sent "${title}" to ${studentIds.length} student(s) for subject ${subjectId} (Target Year: ${targetYear || 'All'}).`)
    return { success: true, sentCount: studentIds.length, enrolledCount }
  } catch (err) {
    console.error("Exception creating bulk notifications:", err)
    return { success: false, sentCount: 0, enrolledCount: 0 }
  }
}

/**
 * Mark a single notification as read.
 */
export const markAsRead = async (notificationId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) throw error
}

/**
 * Mark all unread notifications for a user as read.
 */
export const markAllAsRead = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
}

/**
 * Create a notification for all students matching target criteria (Branch/Department, Year, Section / Sections array).
 */
export const createNotificationForTargetGroup = async (
  targetBranch: string | null,
  targetYear: number | null,
  targetSection: string | null,
  title: string,
  message: string,
  type: NotificationType,
  targetSections?: string[] | null
): Promise<{ success: boolean; sentCount: number }> => {
  try {
    let query = supabase.from('profiles').select('id').eq('role', 'student')
    if (targetBranch) {
      query = query.eq('department', targetBranch)
    }
    if (targetYear) {
      query = query.eq('year', targetYear)
    }
    if (targetSections && targetSections.length > 0) {
      query = query.in('section', targetSections)
    } else if (targetSection) {
      query = query.eq('section', targetSection)
    }
    const { data: students, error: fetchErr } = await query
    if (fetchErr) {
      console.error("Error fetching students for notification:", fetchErr)
      return { success: false, sentCount: 0 }
    }
    if (!students || students.length === 0) {
      return { success: true, sentCount: 0 }
    }

    // Deduplication check: filter out students who already received this notification
    const studentIds = students.map(s => s.id)
    const { data: existingNotifs } = await supabase
      .from('notifications')
      .select('user_id')
      .in('user_id', studentIds)
      .eq('title', title)
      .eq('message', message)

    const existingUserIdSet = new Set((existingNotifs || []).map(n => n.user_id))

    const newNotifications = students
      .filter(s => !existingUserIdSet.has(s.id))
      .map(s => ({
        user_id: s.id,
        title,
        message,
        type,
        is_read: false,
      }))

    if (newNotifications.length === 0) {
      return { success: true, sentCount: 0 }
    }

    const { error: insertErr } = await supabase.from('notifications').insert(newNotifications)
    if (insertErr) {
      console.error("Error inserting notifications:", insertErr)
      return { success: false, sentCount: 0 }
    }

    return { success: true, sentCount: newNotifications.length }
  } catch (err) {
    console.error("Exception creating notifications for target group:", err)
    return { success: false, sentCount: 0 }
  }
}

/**
 * Backward-compatible helper for single year targeting.
 */
export const createNotificationForTargetYear = async (
  targetYear: number | null,
  title: string,
  message: string,
  type: NotificationType
): Promise<{ success: boolean; sentCount: number }> => {
  return createNotificationForTargetGroup(null, targetYear, null, title, message, type)
}
