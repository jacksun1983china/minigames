import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import GameCenter from "./pages/GameCenter";
import GamePlay from "./pages/GamePlay";
import Dashboard from "./pages/Dashboard";
import TenantSetup from "./pages/TenantSetup";
import ApiDocs from "./pages/ApiDocs";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import GameDetail from "./pages/GameDetail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/games" component={GameCenter} />
      <Route path="/play/:slug" component={GamePlay} />
      <Route path="/game/:slug" component={GameDetail} />
      <Route path="/admin" component={Dashboard} />
      <Route path="/admin/:tenantSlug" component={Dashboard} />
      <Route path="/setup" component={TenantSetup} />
      <Route path="/docs" component={ApiDocs} />
      <Route path="/login" component={Login} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" position="top-right" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
