import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestPayload {
  assignment_id: string
}

function normalizeDepartment(deptStr: string): string[] {
  if (!deptStr) return []
  const clean = deptStr.toLowerCase().trim()

  if (clean.includes('computer science') || clean.includes('cse')) {
    return ['cse', 'computer science', 'computer science & engineering']
  }
  if (clean.includes('data science') || clean.includes('ai & ds') || clean.includes('aids') || clean.includes('ai & data science')) {
    return ['aids', 'ai & ds', 'data science', 'artificial intelligence & data science']
  }
  if (clean.includes('machine learning') || clean.includes('ai & ml') || clean.includes('aiml') || clean.includes('ai & machine learning')) {
    return ['aiml', 'ai & ml', 'ai & machine learning', 'artificial intelligence & machine learning']
  }
  if (clean.includes('information technology') || clean === 'it') {
    return ['it', 'information technology']
  }
  if (clean.includes('electronics & communication') || clean === 'ece') {
    return ['ece', 'electronics & communication']
  }
  if (clean.includes('electrical') || clean === 'eee') {
    return ['eee', 'electrical & electronics']
  }
  if (clean.includes('mechanical') || clean === 'mech') {
    return ['mech', 'mechanical engineering']
  }
  if (clean.includes('civil')) {
    return ['civil', 'civil engineering']
  }
  return [clean]
}

function checkBranchMatch(targetBranch: string | null | undefined, studentDept: string | null | undefined): boolean {
  if (!targetBranch || !targetBranch.trim()) return true // No branch targeting means all branches eligible
  if (!studentDept || !studentDept.trim()) return false

  const targetTokens = normalizeDepartment(targetBranch)
  const studentTokens = normalizeDepartment(studentDept)

  return targetTokens.some(t => studentTokens.includes(t)) ||
    targetBranch.toLowerCase().trim() === studentDept.toLowerCase().trim() ||
    targetBranch.toLowerCase().includes(studentDept.toLowerCase().trim()) ||
    studentDept.toLowerCase().includes(targetBranch.toLowerCase().trim())
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[Email Notification] Error: Supabase configuration missing")
      return new Response(JSON.stringify({ error: 'Supabase configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Optional caller verification
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
      if (userErr || !user) {
        console.warn("[Email Notification] Warning: Unauthorized request caller")
      }
    }

    const { assignment_id }: RequestPayload = await req.json()

    if (!assignment_id) {
      return new Response(JSON.stringify({ error: 'assignment_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Assignment created: ${assignment_id}`)
    console.log(`Starting assignment email notification...`)

    // 1. Fetch Assignment details
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from('assignments')
      .select('*, assignment_sections(section)')
      .eq('id', assignment_id)
      .single()

    if (assignErr || !assignment) {
      console.error(`[Email Notification] Assignment not found: ${assignment_id}`, assignErr)
      return new Response(JSON.stringify({ error: 'Assignment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Fetch Professor details dynamically from existing authenticated professor profile
    let professorName = 'EduTrack Professor'
    if (assignment.created_by) {
      const { data: profProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', assignment.created_by)
        .single()
      if (profProfile?.full_name && profProfile.full_name.trim()) {
        professorName = profProfile.full_name.trim()
      }
    }

    const hasTitle = /^prof\b|^dr\b|^mr\b|^mrs\b|^ms\b/i.test(professorName)
    const subjectProfName = professorName.toLowerCase().startsWith('prof.')
      ? professorName
      : `Prof. ${professorName}`
    const postedByProfName = hasTitle ? professorName : `Prof. ${professorName}`
    const signOffProfName = hasTitle ? professorName : `Prof. ${professorName}`

    // 3. Query all student profiles to determine target audience
    console.log(`Finding eligible students...`)
    const { data: allStudents, error: studentErr } = await supabaseAdmin
      .from('profiles')
      .select('id, auth_user_id, email, full_name, department, year, section')
      .eq('role', 'student')

    if (studentErr) {
      console.error(`[Email Notification] Failed to fetch student profiles: ${studentErr.message}`)
      throw new Error(`Failed to fetch student profiles: ${studentErr.message}`)
    }

    if (!allStudents || allStudents.length === 0) {
      console.log(`Eligible students found: 0`)
      return new Response(JSON.stringify({
        success: true,
        assignment_id,
        total_eligible: 0,
        sent_count: 0,
        failed_count: 0,
        already_notified_count: 0,
        message: 'No registered student profiles found in system.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Target Sections array if specific sections were specified
    const targetSections = (assignment.assignment_sections || []).map((s: { section: string }) => s.section.trim().toUpperCase())
    const isAllSections = assignment.all_sections !== false

    // Filter eligible students
    const eligibleStudents = allStudents.filter(student => {
      // Must have valid registered email
      if (!student.email || !student.email.includes('@')) return false

      // Branch / Department check
      if (assignment.target_branch && !checkBranchMatch(assignment.target_branch, student.department)) {
        return false
      }

      // Year check
      if (assignment.target_year && student.year) {
        if (Number(assignment.target_year) !== Number(student.year)) return false
      }

      // Section check
      if (!isAllSections && targetSections.length > 0) {
        if (!student.section || !targetSections.includes(student.section.trim().toUpperCase())) {
          return false
        }
      }

      return true
    })

    console.log(`Eligible students found: ${eligibleStudents.length}`)

    if (eligibleStudents.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        assignment_id,
        total_eligible: 0,
        sent_count: 0,
        failed_count: 0,
        already_notified_count: 0,
        message: 'No students matched assignment eligibility criteria.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Fetch existing notification records for deduplication
    const eligibleStudentIds = eligibleStudents.map(s => s.id)
    const { data: existingNotifications } = await supabaseAdmin
      .from('assignment_notifications')
      .select('student_id, status')
      .eq('assignment_id', assignment_id)
      .in('student_id', eligibleStudentIds)

    const notifiedStudentSet = new Set(
      (existingNotifications || [])
        .filter(n => n.status === 'sent' || n.status === 'pending')
        .map(n => n.student_id)
    )

    const studentsToNotify = eligibleStudents.filter(s => !notifiedStudentSet.has(s.id))
    const alreadyNotifiedCount = eligibleStudents.length - studentsToNotify.length

    if (studentsToNotify.length === 0) {
      console.log(`All eligible students (${eligibleStudents.length}) have already been notified.`)
      return new Response(JSON.stringify({
        success: true,
        assignment_id,
        total_eligible: eligibleStudents.length,
        already_notified_count: alreadyNotifiedCount,
        sent_count: 0,
        failed_count: 0,
        message: 'All eligible students have already been notified for this assignment.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 5. Setup Email Provider (Resend API)
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'EduTrack <notifications@nbkrist.org>'
    const appUrl = Deno.env.get('APP_URL') || 'https://student-management-swart-one.vercel.app'
    const viewAssignmentUrl = `${appUrl}/student/assignments`

    if (!resendApiKey) {
      console.log(`Missing secret: RESEND_API_KEY`)
    }

    // Format Due Date cleanly
    const formattedDueDate = new Date(assignment.deadline).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const emailSubject = `New Assignment Posted by ${subjectProfName} – ${assignment.title}`

    console.log(`Sending emails...`)

    let sentCount = 0
    let failedCount = 0

    // 6. Process Recipients
    for (const student of studentsToNotify) {
      // Upsert tracking record as pending
      await supabaseAdmin
        .from('assignment_notifications')
        .upsert({
          assignment_id: assignment_id,
          student_id: student.id,
          email: student.email,
          status: 'pending',
          created_at: new Date().toISOString()
        }, { onConflict: 'assignment_id,student_id' })

      if (!resendApiKey) {
        const errorMsg = 'Missing secret: RESEND_API_KEY'
        console.log(`Email failed: ${student.email} — ${errorMsg}`)
        await supabaseAdmin
          .from('assignment_notifications')
          .update({
            status: 'failed',
            error_message: errorMsg
          })
          .eq('assignment_id', assignment_id)
          .eq('student_id', student.id)

        failedCount++
        continue
      }

      // Generate EduTrack Branded Email Template
      const studentName = student.full_name || 'Student'
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F7FE; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing:antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;">
    <tr>
      <td align="center" style="padding: 40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; background-color:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color:#0B1E43; padding:32px 40px; text-align:center;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <div style="display:inline-block; background-color:#1E5EFF; color:#ffffff; font-weight:bold; font-size:20px; width:44px; height:44px; line-height:44px; border-radius:12px; text-align:center;">E</div>
                    <span style="font-size:24px; font-weight:800; color:#ffffff; margin-left:12px; letter-spacing:-0.5px; vertical-align:middle;">EduTrack</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notification Alert Bar -->
          <tr>
            <td style="background-color:#1E5EFF; padding:12px 40px; text-align:center; color:#ffffff; font-size:14px; font-weight:600;">
              📢 New Assignment Posted by ${subjectProfName}
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:40px; color:#0B1E43;">
              <h2 style="font-size:20px; font-weight:700; margin:0 0 16px 0; color:#0B1E43;">Hello ${studentName},</h2>
              <p style="font-size:15px; line-height:1.6; color:#475569; margin:0 0 24px 0;">
                A new assignment has been posted on EduTrack.
              </p>

              <!-- Assignment Info Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:16px; padding:24px; margin-bottom:28px;">
                <tr>
                  <td style="padding-bottom:12px;">
                    <span style="font-size:12px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.5px;">Assignment:</span>
                    <div style="font-size:17px; font-weight:700; color:#0B1E43; margin-top:2px;">${assignment.title}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:12px;">
                    <span style="font-size:12px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.5px;">Subject:</span>
                    <div style="font-size:15px; font-weight:600; color:#1E5EFF; margin-top:2px;">${assignment.subject_name}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:12px;">
                    <span style="font-size:12px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.5px;">Posted By:</span>
                    <div style="font-size:15px; font-weight:700; color:#334155; margin-top:2px;">${postedByProfName}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:12px;">
                    <span style="font-size:12px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.5px;">Due Date:</span>
                    <div style="font-size:15px; font-weight:700; color:#E11D48; margin-top:2px;">📅 ${formattedDueDate}</div>
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid #E2E8F0; padding-top:12px;">
                    <span style="font-size:12px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.5px;">Description & Details:</span>
                    <div style="font-size:14px; color:#475569; margin-top:4px; line-height:1.5;">${assignment.description || assignment.instructions || 'A new assignment has been posted. Log in to EduTrack to view complete instructions and submit your work.'}</div>
                  </td>
                </tr>
              </table>

              <p style="font-size:15px; line-height:1.6; color:#475569; margin:0 0 24px 0;">
                Please log in to EduTrack to view the complete assignment and submit your work.
              </p>

              <!-- Call to Action Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="${viewAssignmentUrl}" target="_blank" style="background-color:#1E5EFF; color:#ffffff; display:inline-block; font-size:16px; font-weight:700; text-decoration:none; padding:14px 32px; border-radius:14px; box-shadow:0 4px 12px rgba(30,94,255,0.25);">
                      View Assignment
                    </a>
                  </td>
                </tr>
              </table>

              <div style="font-size:15px; color:#334155; line-height:1.6; border-top:1px solid #E2E8F0; padding-top:20px;">
                Regards,<br>
                <strong style="color:#0B1E43; font-size:16px;">${signOffProfName}</strong><br>
                <span style="color:#64748B; font-weight:600;">EduTrack</span>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F1F5F9; padding:20px 40px; text-align:center; border-top:1px solid #E2E8F0;">
              <p style="font-size:12px; color:#64748B; margin:0; font-weight:600;">
                EduTrack Academic Portal • <a href="${appUrl}" style="color:#1E5EFF; text-decoration:none;">${appUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `

      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [student.email],
            subject: emailSubject,
            html: emailHtml,
          })
        })

        const resendData = await resendRes.json()

        if (resendRes.ok && resendData?.id) {
          sentCount++
          console.log(`Email sent: ${student.email}`)
          await supabaseAdmin
            .from('assignment_notifications')
            .update({
              status: 'sent',
              provider_message_id: resendData.id,
              sent_at: new Date().toISOString(),
              error_message: null
            })
            .eq('assignment_id', assignment_id)
            .eq('student_id', student.id)
        } else {
          failedCount++
          const errorMsg = resendData?.message || resendData?.error || `Resend API returned status ${resendRes.status}`
          console.log(`Email failed: ${student.email} — ${errorMsg}`)
          await supabaseAdmin
            .from('assignment_notifications')
            .update({
              status: 'failed',
              error_message: String(errorMsg)
            })
            .eq('assignment_id', assignment_id)
            .eq('student_id', student.id)
        }

      } catch (sendErr: any) {
        failedCount++
        const errorMsg = sendErr.message || String(sendErr)
        console.log(`Email failed: ${student.email} — ${errorMsg}`)
        await supabaseAdmin
          .from('assignment_notifications')
          .update({
            status: 'failed',
            error_message: errorMsg
          })
          .eq('assignment_id', assignment_id)
          .eq('student_id', student.id)
      }
    }

    const message = !resendApiKey
      ? `Recorded ${studentsToNotify.length} eligible notification(s). Server RESEND_API_KEY secret pending configuration.`
      : `Email notifications processed: ${sentCount} sent, ${failedCount} failed out of ${studentsToNotify.length} recipient(s).`

    return new Response(JSON.stringify({
      success: true,
      assignment_id,
      total_eligible: eligibleStudents.length,
      already_notified_count: alreadyNotifiedCount,
      sent_count: sentCount,
      failed_count: failedCount,
      message
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Edge function send-assignment-notification exception:', error)
    return new Response(JSON.stringify({
      error: 'Internal edge function error',
      details: error.message || String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
