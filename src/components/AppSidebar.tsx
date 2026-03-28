import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Triangle,
} from "lucide-react";

const mainItems = [
  { title: "Visão Geral", url: "/", icon: LayoutDashboard },
  { title: "Marketing", url: "/marketing", icon: BarChart3 },
  { title: "Vendas", url: "/vendas", icon: CreditCard },
];

const supportItems = [
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Ajuda", url: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const isActive = (url: string) => location.pathname === url;

  const renderItem = (item: typeof mainItems[0] & { badge?: number; betaBadge?: boolean }) => (
    <Link
      key={item.title}
      to={item.url}
      className={`sidebar-item ${isActive(item.url) ? "sidebar-item-active" : ""}`}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="truncate"
          >
            {item.title}
          </motion.span>
        )}
      </AnimatePresence>
      {!collapsed && item.badge && (
        <span className="ml-auto text-xs bg-primary/20 text-primary rounded-full px-2 py-0.5 font-semibold">
          {item.badge}
        </span>
      )}
      {!collapsed && item.betaBadge && (
        <span className="pipa-badge ml-auto text-[10px]">
          Beta
        </span>
      )}
    </Link>
  );

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="h-screen sticky top-0 flex flex-col shrink-0 overflow-hidden bg-sidebar"
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-16">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Triangle className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-primary">PIPA</span>
              <span className="text-sm font-medium italic text-primary/80">Driven</span>
            </div>
          </motion.div>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <Triangle className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <div>
          <div className="space-y-0.5">{mainItems.map(renderItem)}</div>
        </div>

        <div>
          {!collapsed && (
            <p className="text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 text-muted-foreground/50">
              Suporte
            </p>
          )}
          <div className="space-y-0.5">{supportItems.map(renderItem)}</div>
        </div>
      </nav>

      {/* Team Selector */}
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 mx-3 mb-3 rounded-lg flex items-center gap-3 cursor-pointer bg-muted border border-border"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <Triangle className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Team</p>
            <p className="text-sm font-semibold truncate text-foreground">Marketing</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </motion.div>
      )}
    </motion.aside>
  );
}
