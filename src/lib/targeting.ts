/**
 * Normalizes branch name to standard internal identifier for comparison.
 */
export function normalizeBranch(branch?: string | null): string {
  if (!branch) return ""
  const b = branch.trim().toLowerCase()
  if (b.includes("computer science") || b.includes("cse")) return "cse"
  if (b.includes("information technology") || b === "it" || b.includes("(it)")) return "it"
  if (b.includes("electronics & communication") || b.includes("ece")) return "ece"
  if (b.includes("electrical & electronics") || b.includes("eee")) return "eee"
  if (b.includes("mechanical") || b.includes("mech")) return "mech"
  if (b.includes("civil")) return "civil"
  if (b.includes("machine learning") || b.includes("ai & ml") || b.includes("ai&ml") || b.includes("aiml")) return "aiml"
  if (b.includes("data science") || b.includes("ai & ds") || b.includes("ai&ds") || b.includes("aids")) return "aids"
  return b
}

/**
 * Helper utility to verify if an assignment is targeted to a student's academic profile
 * (Branch, Year, Section / all_sections, or Enrolled Subjects).
 */
export function isAssignmentTargetedToStudent(
  assignment: {
    subject_id?: string | null
    subject_name?: string | null
    target_branch?: string | null
    target_year?: number | null
    all_sections?: boolean | null
    assignment_sections?: { section: string }[] | null
  },
  studentProfile: {
    department?: string | null
    year?: number | null
    section?: string | null
    enrolledSubjectIds?: string[] | null
    enrolledSubjectNames?: string[] | null
  } | null
): boolean {
  if (!studentProfile) return false

  // 0. If student is explicitly enrolled in the subject, always grant access
  if (assignment.subject_id && studentProfile.enrolledSubjectIds?.includes(assignment.subject_id)) {
    return true
  }
  if (assignment.subject_name && studentProfile.enrolledSubjectNames?.some(name => name && name.trim().toLowerCase() === assignment.subject_name?.trim().toLowerCase())) {
    return true
  }

  // 1. Branch check: if target_branch is specified on assignment and student has department set
  if (assignment.target_branch && assignment.target_branch.trim() && studentProfile.department && studentProfile.department.trim()) {
    const targetNorm = normalizeBranch(assignment.target_branch)
    const studentNorm = normalizeBranch(studentProfile.department)
    const rawTarget = assignment.target_branch.trim().toLowerCase()
    const rawStudent = studentProfile.department.trim().toLowerCase()

    const isMatch = (targetNorm && studentNorm && targetNorm === studentNorm) ||
                    rawTarget === rawStudent ||
                    rawTarget.includes(rawStudent) ||
                    rawStudent.includes(rawTarget)

    if (!isMatch) {
      return false
    }
  }

  // 2. Year check: if target_year is specified on assignment and student has year set
  if (assignment.target_year && studentProfile.year) {
    if (Number(assignment.target_year) !== Number(studentProfile.year)) {
      return false
    }
  }

  // 3. Section check: if all_sections is false, student section must exist in assignment_sections
  if (assignment.all_sections === false) {
    if (studentProfile.section && studentProfile.section.trim()) {
      const allowedSections = (assignment.assignment_sections || []).map(s => s.section.trim().toUpperCase())
      if (allowedSections.length > 0 && !allowedSections.includes(studentProfile.section.trim().toUpperCase())) {
        return false
      }
    }
  }

  return true
}
