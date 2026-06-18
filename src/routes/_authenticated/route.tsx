import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  CalendarCheck2,
  Users,
  HardHat,
  FileSpreadsheet,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck2 },
  { to: "/workers", label: "Workers", icon: Users },
  { to: "/projects", label: "Projects", icon: HardHat },
  { to: "/reports", label: "Reports", icon: FileSpreadsheet },
] as const;

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const title =
    NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)))?.label ??
    "SiteCrew";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 glass border-b">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <HardHat className="size-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
                SiteCrew
              </p>
              <h1 className="text-sm font-semibold leading-tight">{title}</h1>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 glass border-t pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-4xl grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center justify-center gap-0.5 py-2.5 tap-target text-[11px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`size-5 ${active ? "scale-110" : ""} transition-transform`} />
                <span className="font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
