import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { motion } from "framer-motion";
import {
  Users,
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  Megaphone,
  Calendar,
  Filter,
  ChevronDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { useTheme } from "@/hooks/use-theme";

// Funil de conversão
const funnelData = [
  { etapa: "Fez Contato", valor: 6527, pct: "100%", convPct: "" },
  { etapa: "Consulta Agendada", valor: 515, pct: "7,9%", convPct: "7,9% de Fez Contato converteram" },
  { etapa: "Comprou", valor: 294, pct: "4,5%", convPct: "57,1% de Consulta Agendada converteram" },
  { etapa: "Renovação", valor: 230, pct: "3,5%", convPct: "78,2% de Comprou converteram" },
];

// Leads por canal
const channelData = [
  { canal: "Google Ads", leads: 2450, color: "#FF8A00" },
  { canal: "Meta Ads", leads: 1890, color: "#FFA940" },
  { canal: "Orgânico", leads: 1120, color: "#CC6E00" },
  { canal: "Indicação", leads: 780, color: "#A0A0A0" },
  { canal: "Outros", leads: 287, color: "#2A2A2A" },
];

// Lead time entre etapas
const leadTimeData = [
  { de: "Fez Contato", para: "Consulta Agendada", media: "11,3 dias", mediana: "1,5 dias", min: "0,0", max: "316,6 dias", base: 371 },
  { de: "Consulta Agendada", para: "Comprou", media: "14,4 dias", mediana: "10,4 dias", min: "0,2", max: "134,8 dias", base: 222 },
  { de: "Fez Contato", para: "Comprou", media: "23,2 dias", mediana: "13,5 dias", min: "0,0", max: "280,6 dias", base: 226 },
];

// Evolução mensal de leads
const monthlyLeads = [
  { mes: "Jan", leads: 480 },
  { mes: "Fev", leads: 520 },
  { mes: "Mar", leads: 610 },
  { mes: "Abr", leads: 580 },
  { mes: "Mai", leads: 720 },
  { mes: "Jun", leads: 690 },
  { mes: "Jul", leads: 810 },
  { mes: "Ago", leads: 750 },
  { mes: "Set", leads: 890 },
  { mes: "Out", leads: 920 },
  { mes: "Nov", leads: 1050 },
  { mes: "Dez", leads: 980 },
];

export default function MarketingPage() {
  const { theme } = useTheme();
  const gridColor = theme === "dark" ? "#2A2A2A" : "#E0DDD8";
  const tickColor = theme === "dark" ? "#A0A0A0" : "#6B6B6B";
  const tooltipBg = theme === "dark" ? "#1C1C1C" : "#FFFFFF";
  const tooltipBorder = theme === "dark" ? "#2A2A2A" : "#E0DDD8";
  const tooltipColor = theme === "dark" ? "#FFFFFF" : "#003D2B";
  const areaFill = theme === "dark" ? "rgba(255,138,0,0.15)" : "rgba(255,138,30,0.1)";

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Marketing</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Calendar className="h-4 w-4" />
            18 Out - 18 Nov
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtrar
          </button>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Leads Gerados" value="6.527" change={12.4} icon={Users} delay={0} />
        <StatCard title="Leads por Origem" value="4 canais" change={0} icon={Megaphone} delay={0.05} />
        <StatCard title="CPL Médio" value="42,30" change={-8.2} icon={MousePointerClick} prefix="R$ " delay={0.1} />
        <StatCard title="Investimento em Mídia" value="276K" change={5.4} icon={TrendingUp} prefix="R$ " delay={0.15} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Taxa de Qualificação" value="7,9%" change={1.8} icon={Target} delay={0.2} />
        <StatCard title="Leads Qualificados" value="515" change={7.9} icon={Eye} delay={0.25} />
        <StatCard title="Campanhas Ativas" value="29" change={15.0} icon={TrendingUp} delay={0.3} />
      </div>

      {/* Funil de Conversão + Lead Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Funil */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
            Funil de Conversão
          </h3>
          <div className="flex flex-col items-center gap-1">
            {funnelData.map((step, i) => {
              const widthPct = Math.max(30, 100 - i * 20);
              return (
                <motion.div
                  key={step.etapa}
                  initial={{ opacity: 0, scaleX: 0.5 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.4 + i * 0.15, duration: 0.4 }}
                  className="flex flex-col items-center w-full"
                >
                  <div
                    className="rounded-lg py-3 px-4 text-center"
                    style={{
                      width: `${widthPct}%`,
                      background: i === 0 ? "#FF8A00" : i === 1 ? "#CC6E00" : i === 2 ? "#A0A0A0" : "#666666",
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{step.etapa}</p>
                    <p className="text-2xl font-bold text-white">{step.valor.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-white/70">{step.pct} de Fez Contato</p>
                  </div>
                  {step.convPct && (
                    <p className="text-[11px] text-muted-foreground mt-1 mb-1">{step.convPct}</p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Lead Time */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
            Lead Time entre Etapas
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {leadTimeData.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="p-4 rounded-lg border border-border bg-secondary/30"
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {item.de} → {item.para}
                </p>
                <p className="text-2xl font-bold text-foreground">{item.media}</p>
                <p className="text-xs text-muted-foreground">média</p>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  <span>Mediana: {item.mediana} | Min: {item.min} | Max: {item.max}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Base: {item.base} leads</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Evolução de Leads + Leads por Canal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Evolução mensal */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="chart-card col-span-2"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Evolução de Leads</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyLeads}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: tickColor }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: tickColor }} />
              <Tooltip
                contentStyle={{
                  background: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: tooltipColor,
                }}
              />
              <Area type="monotone" dataKey="leads" stroke="#FF8A00" fill={areaFill} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Leads por canal */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Leads por Canal</h3>
          <div className="space-y-3">
            {channelData.map((ch, i) => (
              <motion.div
                key={ch.canal}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.08 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{ch.canal}</span>
                  <span className="text-xs font-semibold text-foreground">{ch.leads.toLocaleString("pt-BR")}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(ch.leads / 2450) * 100}%` }}
                    transition={{ delay: 0.8 + i * 0.1, duration: 0.6 }}
                    className="h-full rounded-full"
                    style={{ background: ch.color }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
