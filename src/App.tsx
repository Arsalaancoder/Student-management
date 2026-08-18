import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"

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
import ProfessorAssignments from "./pages/professor/Assignments"
import ProfessorCreateAssignment from "./pages/professor/CreateAssignment"
import ProfessorAssignmentSubmissions from "./pages/professor/AssignmentSubmissions"
import ProfessorAllSubmissions from "./pages/professor/AllSubmissions"
import ProfessorReviewSubmission from "./pages/professor/ReviewSubmission"
import SimilarityReport from "./pages/professor/SimilarityReport"
import ProfessorProfile from "./pages/professor/Profile"
import ProfessorAnalytics from "./pages/professor/Analytics"

function App() {
  return (
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
              {/* Placeholders for other routes */}
              <Route path="/student/subjects" element={<div className="p-4">Subjects Placeholder</div>} />
            </Route>
          </Route>

          {/* Professor Routes */}
          <Route element={<ProtectedRoute allowedRole="professor" />}>
            <Route element={<DashboardLayout type="professor" />}>
              <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
              <Route path="/professor/classes" element={<ProfessorClasses />} />
              <Route path="/professor/assignments" element={<ProfessorAssignments />} />
              <Route path="/professor/assignments/create" element={<ProfessorCreateAssignment />} />
              <Route path="/professor/assignments/:id/submissions" element={<ProfessorAssignmentSubmissions />} />
              <Route path="/professor/submissions" element={<ProfessorAllSubmissions />} />
              <Route path="/professor/submissions/:id/review" element={<ProfessorReviewSubmission />} />
              <Route path="/professor/submissions/:id/similarity" element={<SimilarityReport />} />
              <Route path="/professor/analytics" element={<ProfessorAnalytics />} />
              <Route path="/professor/profile" element={<ProfessorProfile />} />
            </Route>
          </Route>

          {/* Catch-all 404 */}
          <Route path="*" element={<div className="flex h-screen items-center justify-center text-2xl font-bold">404 - Page Not Found</div>} />
        </Routes>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
