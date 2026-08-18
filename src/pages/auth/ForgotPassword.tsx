import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function ForgotPassword() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link to="/login" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to login
      </Link>
      
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-2">Reset password</h2>
        <p className="text-muted-foreground">Enter your email and we'll send you a link to reset your password</p>
      </div>

      <Card className="border-none shadow-lg">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="email">
              College Email
            </label>
            <Input 
              id="email" 
              type="email" 
              placeholder="name@college.edu" 
              className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all"
              required
            />
          </div>
          
          <Button className="w-full h-12 text-base font-semibold rounded-2xl shadow-sm hover:shadow-md transition-all">
            Send Reset Link
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center border-t p-6">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
