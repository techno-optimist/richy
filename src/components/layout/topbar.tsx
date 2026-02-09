"use client";

import { usePathname } from "next/navigation";
import { Menu, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/chat")) return "Chat";
  if (pathname.startsWith("/memory")) return "Memory";
  if (pathname.startsWith("/tasks")) return "Tasks";
  if (pathname.startsWith("/tools")) return "Tools";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Richy";
}

export function Topbar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-12 items-center gap-2 border-b px-3">
      {/* Mobile sidebar trigger */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Mobile logo */}
      <div className="flex items-center gap-2 md:hidden">
        <Bot className="h-5 w-5" />
        <span className="font-semibold">{title}</span>
      </div>

      <div className="flex-1" />

      <ThemeToggle />
    </header>
  );
}
