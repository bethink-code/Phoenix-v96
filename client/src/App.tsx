import { Switch, Route, Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import Settings from "@/pages/Settings";
import Experiments from "@/pages/Experiments";
import SessionDetail from "@/pages/SessionDetail";
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
        <Route path="/settings">
          {isAuthenticated ? <Settings /> : <Redirect to="/" />}
        </Route>
        <Route path="/experiments">
          {isAuthenticated ? <Experiments /> : <Redirect to="/" />}
        </Route>
        {/* Per-session detail page. Opened in a new tab from History
            cards so the operator can compare multiple sessions side
            by side. Renders the same SessionDetailView as the Live
            tab — same identity card, same sub-tabs, same components. */}
        <Route path="/experiments/sessions/:id">
          {isAuthenticated ? <SessionDetail /> : <Redirect to="/" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}
