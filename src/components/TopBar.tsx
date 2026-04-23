import { Search, Calendar, Bell, PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10">
      {/* Search */}
      <div className="relative max-w-md w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar..."
          className="w-full pl-10 pr-20 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
          <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono border border-border">⌘</kbd>
          <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono border border-border">F</kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Link to="/calendario" className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary">
          <Calendar className="h-5 w-5" />
        </Link>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full" />
        </button>
        <Link to="/crm/empresas" className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary">
          <PlusCircle className="h-5 w-5" />
        </Link>

        <div className="h-8 w-px bg-border mx-1" />

        {/* Avatar */}
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">PD</span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-foreground leading-tight">PIPA Driven</p>
            <p className="text-xs text-muted-foreground">Negócios</p>
          </div>
        </div>
      </div>
    </header>
  );
}
