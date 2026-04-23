import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Settings,
  HelpCircle,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Triangle,
  CalendarDays,
  Plug,
  Users,
  Building2,
  Briefcase,
  Zap,
  Workflow,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: '',
    items: [
      { title: "Comando do Dia", url: "/hoje",       icon: Zap },
      { title: "WhatsApp",       url: "/mensagens",  icon: MessageSquare },
      { title: "Calendário",     url: "/calendario", icon: CalendarDays },
      { title: "Painel",         url: "/dashboard",  icon: LayoutDashboard },
    ],
  },
  {
    label: 'CRM',
    items: [
      { title: "Contatos",  url: "/crm/contatos",  icon: Users },
      { title: "Empresas",  url: "/crm/empresas",  icon: Building2 },
      { title: "Pipeline",  url: "/crm/negocios",  icon: Briefcase },
    ],
  },
  {
    label: 'Admin',
    items: [
      { title: "Funis",       url: "/funis",       icon: GitBranch, adminOnly: true },
      { title: "Integrações", url: "/integracoes", icon: Plug,      adminOnly: true },
      { title: "Sequências",  url: "/sequencias",  icon: Workflow,  adminOnly: true },
    ],
  },
];

const supportItems: NavItem[] = [
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Ajuda",         url: "/help",     icon: HelpCircle },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { isAdmin } = useAuth();

  const isActive = (url: string) => location.pathname === url || location.pathname.startsWith(`${url}/`);

  const renderItem = (item: NavItem) => (
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
    </Link>
  );

  const renderSection = (section: NavSection) => {
    const visible = section.items.filter((item) => !item.adminOnly || isAdmin);
    if (visible.length === 0) return null;
    return (
      <div key={section.label}>
        {section.label && !collapsed && (
          <p className="text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 text-muted-foreground/50">
            {section.label}
          </p>
        )}
        <div className="space-y-0.5">{visible.map(renderItem)}</div>
      </div>
    );
  };

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
        {navSections.map(renderSection)}

        <div>
          {!collapsed && (
            <p className="text-[11px] font-semibold uppercase tracking-wider px-3 mb-2 text-muted-foreground/50">
              Suporte
            </p>
          )}
          <div className="space-y-0.5">
            {supportItems.map(renderItem)}
          </div>
        </div>
      </nav>
    </motion.aside>
  );
}
