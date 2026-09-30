import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Hammer, Lightbulb, LogOut } from "lucide-react";
import { IdeaListPage } from "@/pages/IdeaListPage";
import { IdeaDetailPage } from "@/pages/IdeaDetailPage";
import { DevelopedPage } from "@/pages/DevelopedPage";
import { ComparePage } from "@/pages/ComparePage";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// Grup 3'te buraya /settings, /cron-runs eklenecek. /compare bir nav öğesi
// değil — seçim/dropdown üzerinden erişiliyor.
const NAV_ITEMS = [
  { to: "/ideas", label: "Fikirler", icon: Lightbulb },
  { to: "/developed", label: "Geliştirilenler", icon: Hammer },
];

function App() {
  const location = useLocation();

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
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-16">
          <Routes>
            {/* Grup 3 sonunda "/" dashboard olacak; şimdilik /ideas'a yönlendiriyor. */}
            <Route path="/" element={<Navigate to="/ideas" replace />} />
            <Route path="/ideas" element={<IdeaListPage />} />
            <Route path="/ideas/:id" element={<IdeaDetailPage />} />
            <Route path="/developed" element={<DevelopedPage />} />
            <Route path="/compare" element={<ComparePage />} />
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
