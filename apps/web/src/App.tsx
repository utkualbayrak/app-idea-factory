import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Combine, FlaskConical, Hammer, History, Lightbulb, LayoutDashboard, LogOut, Rocket, Settings, SquareKanban } from "lucide-react";
import { DashboardPage } from "@/pages/DashboardPage";
import { IdeaListPage } from "@/pages/IdeaListPage";
import { IdeaDetailPage } from "@/pages/IdeaDetailPage";
import { DevelopPage } from "@/pages/DevelopPage";
import { DevReportPage } from "@/pages/DevReportPage";
import { NewIdeaPage } from "@/pages/NewIdeaPage";
import { KanbanPage } from "@/pages/KanbanPage";
import { TestPlanPage } from "@/pages/TestPlanPage";
import { TestResultPage } from "@/pages/TestResultPage";
import { DevelopedPage, ReadyPage, TestingPage } from "@/pages/StatusListPage";
import { ComparePage } from "@/pages/ComparePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { CronRunsPage } from "@/pages/CronRunsPage";
import { ProposalsPage } from "@/pages/ProposalsPage";
import { ArchivePage } from "@/pages/ArchivePage";
import { fetchProposals } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// /compare bir nav öğesi değil — seçim/dropdown üzerinden erişiliyor.
const NAV_ITEMS = [
  { to: "/", label: "Gösterge paneli", icon: LayoutDashboard },
  { to: "/ideas", label: "Fikirler", icon: Lightbulb },
  { to: "/board", label: "Kanban", icon: SquareKanban },
  { to: "/developed", label: "Geliştirilenler", icon: Hammer },
  { to: "/testing", label: "Test", icon: FlaskConical },
  { to: "/ready", label: "Dağıtıma hazır", icon: Rocket },
  { to: "/proposals", label: "Öneriler", icon: Combine },
  { to: "/cron-runs", label: "Çalışma geçmişi", icon: History },
  { to: "/settings", label: "Ayarlar", icon: Settings },
];

// Sidebar'daki "Öneriler" rozeti: onay bekleyen öneri sayısı. Her sayfa
// geçişinde tazelenir (öneriyi onaylayıp başka sayfaya geçince düşsün).
function usePendingProposalCount(pathname: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetchProposals("pending")
      .then((res) => setCount(res.proposals.length))
      .catch(() => {});
  }, [pathname]);
  return count;
}

function App() {
  const location = useLocation();
  const pendingProposals = usePendingProposalCount(location.pathname);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2 px-2 py-1 text-[1.05rem] font-bold">
            <Lightbulb className="size-5 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">App Idea Factory</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.to} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.to === "/proposals" && pendingProposals > 0 && (
                      <SidebarMenuBadge>{pendingProposals}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* Cloudflare Access'in kendi logout endpoint'i — tüm Zero Trust
                  oturumunu kapatır, tek kullanıcılı uygulamada sorun değil. */}
              <SidebarMenuButton asChild tooltip="Çıkış yap">
                <a href="/cdn-cgi/access/logout">
                  <LogOut />
                  <span>Çıkış yap</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-16 has-[[data-fill-viewport]]:pb-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/ideas" element={<IdeaListPage />} />
            <Route path="/ideas/:id" element={<IdeaDetailPage />} />
            <Route path="/ideas/new" element={<NewIdeaPage />} />
            <Route path="/ideas/archive" element={<ArchivePage />} />
            <Route path="/ideas/:id/develop" element={<DevelopPage />} />
            <Route path="/ideas/:id/developed" element={<DevReportPage />} />
            <Route path="/ideas/:id/test/start" element={<TestPlanPage />} />
            <Route path="/ideas/:id/test/result" element={<TestResultPage />} />
            <Route path="/board" element={<KanbanPage />} />
            <Route path="/developed" element={<DevelopedPage />} />
            <Route path="/testing" element={<TestingPage />} />
            <Route path="/ready" element={<ReadyPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/cron-runs" element={<CronRunsPage />} />
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
