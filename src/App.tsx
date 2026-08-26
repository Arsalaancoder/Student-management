import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import EduTrackLogo from "@/components/EduTrackLogo"

// Contexts & Protection
import { AuthProvider } from "./contexts/AuthContext"
import ProtectedRoute from "./components/ProtectedRoute"

// Layouts
import AuthLayout from "./layouts/AuthLayout"
import DashboardLayout from "./layouts/DashboardLayout"

// Auth Pages
import Login from "./pages/auth/Login"
import Signup from "./pages/auth/Signup"
import ForgotPassword from "./pages/auth/ForgotPassword"
import ResetPassword from "./pages/auth/ResetPassword"

// Student Pages
import StudentDashboard from "./pages/student/Dashboard"
import StudentAssignments from "./pages/student/Assignments"
import StudentAssignmentDetails from "./pages/student/AssignmentDetails"
import StudentGrades from "./pages/student/Grades"
import StudentCredits from "./pages/student/Credits"
import StudentProfile from "./pages/student/Profile"
import StudentAnalytics from "./pages/student/Analytics"

// Professor Pages
import ProfessorDashboard from "./pages/professor/Dashboard"
import ProfessorClasses from "./pages/professor/Classes"
import ProfessorSubjects from "./pages/professor/Subjects"
import ProfessorSubjectDetail from "./pages/professor/SubjectDetail"
import ProfessorAssignments from "./pages/professor/Assignments"
import ProfessorCreateAssignment from "./pages/professor/CreateAssignment"
import ProfessorAssignmentSubmissions from "./pages/professor/AssignmentSubmissions"
import ProfessorAllSubmissions from "./pages/professor/AllSubmissions"
import ProfessorReviewSubmission from "./pages/professor/ReviewSubmission"
import SimilarityReport from "./pages/professor/SimilarityReport"
import PlagiarismMonitor from "./pages/professor/PlagiarismMonitor"
import ProfessorProfile from "./pages/professor/Profile"
import StudentProgress from "./pages/professor/StudentProgress"

import ErrorBoundary from "./components/ErrorBoundary"

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
          {/* Default route redirects to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Authentication Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>

          {/* Student Routes */}
          <Route element={<ProtectedRoute allowedRole="student" />}>
            <Route element={<DashboardLayout type="student" />}>
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/assignments" element={<StudentAssignments />} />
              <Route path="/student/assignments/:id" element={<StudentAssignmentDetails />} />
              <Route path="/student/grades" element={<StudentGrades />} />
              <Route path="/student/credits" element={<StudentCredits />} />
              <Route path="/student/analytics" element={<StudentAnalytics />} />
              <Route path="/student/profile" element={<StudentProfile />} />
            </Route>
          </Route>

          {/* Professor Routes */}
          <Route element={<ProtectedRoute allowedRole="professor" />}>
            <Route element={<DashboardLayout type="professor" />}>
              <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
              <Route path="/professor/classes" element={<ProfessorClasses />} />
              {/* Subjects — primary professor workflow */}
              <Route path="/professor/subjects" element={<ProfessorSubjects />} />
              <Route path="/professor/subjects/:subjectId" element={<ProfessorSubjectDetail />} />
              <Route path="/professor/subjects/:subjectId/assignments/create" element={<ProfessorCreateAssignment />} />
              {/* Assignments */}
              <Route path="/professor/assignments" element={<ProfessorAssignments />} />
              <Route path="/professor/assignments/create" element={<ProfessorCreateAssignment />} />
              <Route path="/professor/assignments/:id/submissions" element={<ProfessorAssignmentSubmissions />} />
              {/* Submissions */}
              <Route path="/professor/submissions" element={<ProfessorAllSubmissions />} />
              <Route path="/professor/submissions/:id/review" element={<ProfessorReviewSubmission />} />
              <Route path="/professor/submissions/:id/similarity" element={<SimilarityReport />} />
              <Route path="/professor/plagiarism" element={<PlagiarismMonitor />} />
              {/* Other */}
              <Route path="/professor/student-progress" element={<StudentProgress />} />
              <Route path="/professor/profile" element={<ProfessorProfile />} />
            </Route>
          </Route>

          {/* Catch-all 404 */}
          <Route path="*" element={
            <div className="flex h-screen flex-col items-center justify-center gap-4 text-center p-4 bg-[#F4F7FE]">
              <EduTrackLogo size="xl" />
              <h1 className="text-3xl font-extrabold text-[#0B1E43] mt-2">404 - Page Not Found</h1>
              <p className="text-muted-foreground max-w-sm">The page you are looking for does not exist or has been moved.</p>
              <Button asChild className="rounded-full px-8 font-bold bg-[#1E5EFF] mt-2">
                <Link to="/">Back to Home</Link>
              </Button>
            </div>
          } />
        </Routes>
        </AuthProvider>
        <Toaster />
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
