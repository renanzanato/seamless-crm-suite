import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  MessageSquare,
  Package,
  FileText,
  BarChart3,
  Zap,
  Settings,
  Shield,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const generalItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Payment", url: "/payment", icon: CreditCard },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Message", url: "/message", icon: MessageSquare, badge: 8 },
];

const toolsItems = [
  { title: "Product", url: "/product", icon: Package },
  { title: "Invoice", url: "/invoice", icon: FileText },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Automation", url: "/automation", icon: Zap, betaBadge: true },
];

const supportItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Security", url: "/security", icon: Shield },
  { title: "Help", url: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const isActive = (url: string) => location.pathname === url;

  const renderItem = (item: typeof generalItems[0] & { badge?: number; betaBadge?: boolean }) => (
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
        <span className="ml-auto text-xs bg-primary/20 text-primary-foreground rounded-full px-2 py-0.5">
          {item.badge}
        </span>
      )}
      {!collapsed && item.betaBadge && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent rounded-full px-2 py-0.5">
          Beta
        </span>
      )}
    </Link>
  );

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="h-screen sticky top-0 flex flex-col shrink-0 overflow-hidden"
      style={{ background: "hsl(var(--sidebar-bg))" }}
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
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold" style={{ color: "hsl(var(--sidebar-active))" }}>
              Nexus
            </span>
          </motion.div>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md hover:bg-sidebar-accent transition-colors"
          style={{ color: "hsl(var(--sidebar-fg))" }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <div>
          {!collapsed && (
            <p className="text-[11px] font-semibold uppercase tracking-wider px-3 mb-2" style={{ color: "hsl(var(--sidebar-fg) / 0.5)" }}>
              General
            </p>
          )}
          <div className="space-y-0.5">{generalItems.map(renderItem)}</div>
        </div>

        <div>
          {!collapsed && (
            <p className="text-[11px] font-semibold uppercase tracking-wider px-3 mb-2" style={{ color: "hsl(var(--sidebar-fg) / 0.5)" }}>
              Tools
            </p>
          )}
          <div className="space-y-0.5">{toolsItems.map(renderItem)}</div>
        </div>

        <div>
          {!collapsed && (
            <p className="text-[11px] font-semibold uppercase tracking-wider px-3 mb-2" style={{ color: "hsl(var(--sidebar-fg) / 0.5)" }}>
              Support
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
          className="p-3 mx-3 mb-3 rounded-lg flex items-center gap-3 cursor-pointer"
          style={{ background: "hsl(var(--sidebar-hover))" }}
        >
          <div className="h-9 w-9 rounded-lg bg-primary/30 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs" style={{ color: "hsl(var(--sidebar-fg))" }}>Team</p>
            <p className="text-sm font-semibold truncate" style={{ color: "hsl(var(--sidebar-active))" }}>Marketing</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--sidebar-fg))" }} />
        </motion.div>
      )}
    </motion.aside>
  );
}
