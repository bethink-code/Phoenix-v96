import { Switch, Route, Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";
import TermsModal from "@/components/TermsModal";

export default function App() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <>
      {isAuthenticated && user && !user.termsAcceptedAt && <TermsModal />}
      <Switch>
        <Route path="/">
          {isAuthenticated ? <Dashboard /> : <Landing />}
        </Route>
        <Route path="/admin">
          {isAuthenticated && user?.isAdmin ? <Admin /> : <Redirect to="/" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}
