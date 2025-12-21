import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import NotFound from "./pages/not-found";
import Home from "@/pages/Home";
import Footer from "./components/footer";
import Header from "./components/header";


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <main className="flex-1">
            <Router />
          </main>
          <Footer />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}