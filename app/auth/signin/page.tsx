import { signIn } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">GA4 Taxonomy</CardTitle>
          <CardDescription>
            Sign in with your Google account to manage your GA4 event taxonomy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/events' })
            }}
          >
            <Button type="submit" className="w-full" size="lg">
              Sign in with Google
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Requires access to Google Analytics and Google Sheets
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
