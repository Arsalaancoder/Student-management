/**
 * Helper utility to verify if an assignment is targeted to a student's academic profile
 * (Branch, Year, and Section / all_sections).
 */
export function isAssignmentTargetedToStudent(
  assignment: {
    target_branch?: string | null
    target_year?: number | null
    all_sections?: boolean | null
    assignment_sections?: { section: string }[] | null
  },
  studentProfile: {
    department?: string | null
    year?: number | null
    section?: string | null
  } | null
): boolean {
  if (!studentProfile) return false

  // 1. Branch check: if target_branch is specified on assignment and student has department
  if (assignment.target_branch && studentProfile.department && studentProfile.department.trim()) {
    const targetB = assignment.target_branch.trim().toLowerCase()
    const studentD = studentProfile.department.trim().toLowerCase()
    const isMatch = targetB === studentD || 
                    targetB.includes(studentD) || 
                    studentD.includes(targetB) ||
                    (targetB.includes("computer science") && studentD.includes("computer science")) ||
                    (targetB.includes("cse") && studentD.includes("cse")) ||
                    (targetB.includes("data science") && studentD.includes("data science")) ||
                    (targetB.includes("ai") && studentD.includes("ai"))

    if (!isMatch) {
      return false
    }
  }

  // 2. Year check: if target_year is specified on assignment and student has year
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

