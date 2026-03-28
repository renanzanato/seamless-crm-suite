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
  { etapa: "Leads", sub: "Total de contatos", valor: 6527, pct: "100%", convPct: "" },
  { etapa: "MQL", sub: "Qualificados pelo Marketing", valor: 2480, pct: "38%", convPct: "38% dos Leads" },
  { etapa: "SQL", sub: "Qualificados por Vendas", valor: 890, pct: "13,6%", convPct: "35,9% dos MQL" },
  { etapa: "Visitas Agendadas", sub: "", valor: 515, pct: "7,9%", convPct: "57,9% dos SQL" },
  { etapa: "Visitas Realizadas", sub: "", valor: 380, pct: "5,8%", convPct: "73,8% das Agendadas" },
  { etapa: "Comprou", sub: "", valor: 294, pct: "4,5%", convPct: "77,4% das Realizadas" },
];

// Leads por canal
const channelData = [
  { canal: "Google Ads", leads: 2450, color: "#FF8A00" },
  { canal: "Meta Ads", leads: 1890, color: "#FFA940" },
  { canal: "Orgânico", leads: 1120, color: "#CC6E00" },
  { canal: "Site", leads: 780, color: "#A0A0A0" },
  { canal: "E-mail", leads: 520, color: "#4A4A4A" },
  { canal: "SMS", leads: 340, color: "#6B6B6B" },
  { canal: "Indicação", leads: 287, color: "#8B8B8B" },
];

// Lead time entre etapas
const leadTimeData = [
  { de: "Fez Contato", para: "Consulta Agendada", media: "11,3 dias", mediana: "1,5 dias", min: "0,0", max: "316,6 dias", base: 371, change: -8.2 },
  { de: "Consulta Agendada", para: "Comprou", media: "14,4 dias", mediana: "10,4 dias", min: "0,2", max: "134,8 dias", base: 222, change: 3.1 },
  { de: "Fez Contato", para: "Comprou", media: "23,2 dias", mediana: "13,5 dias", min: "0,0", max: "280,6 dias", base: 226, change: -5.4 },
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Funil */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="chart-card lg:col-span-3"
        >
          <h3 className="text-sm font-semibold text-foreground mb-5 uppercase tracking-wider">
            Funil de Conversão
          </h3>
          <div className="flex flex-col items-center gap-0">
            {funnelData.map((step, i) => {
              const widthPct = Math.max(30, 100 - i * 12);
              const colors = ["#FF8A00", "#E07800", "#CC6E00", "#B06000", "#8A8A8A", "#707070"];
              return (
                <motion.div
                  key={step.etapa}
                  initial={{ opacity: 0, scaleX: 0.5 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.4 + i * 0.12, duration: 0.4 }}
                  className="flex flex-col items-center w-full"
                >
                  <div
                    className="rounded-lg py-3 px-4 text-center"
                    style={{
                      width: `${widthPct}%`,
                      background: colors[i] || "#666",
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{step.etapa}</p>
                    {step.sub && <p className="text-[9px] text-white/50">{step.sub}</p>}
                    <p className="text-xl font-bold text-white">{step.valor.toLocaleString("pt-BR")}</p>
                    <p className="text-[10px] text-white/70">{step.pct} dos Leads</p>
                  </div>
                  {step.convPct && (
                    <div className="flex items-center gap-1.5 my-2">
                      <svg width="12" height="16" viewBox="0 0 12 16" className="text-primary shrink-0">
                        <path d="M6 0 L6 12 M2 8 L6 14 L10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-[10px] text-muted-foreground">{step.convPct}</p>
                    </div>
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
          className="chart-card lg:col-span-2"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
            Lead Time entre Etapas
          </h3>
          <div className="grid grid-cols-1 gap-2.5">
            {leadTimeData.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="p-3 rounded-lg border border-border bg-secondary/30"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{item.de}</span>
                  <svg width="14" height="10" viewBox="0 0 14 10" className="text-primary shrink-0">
                    <path d="M0 5 L10 5 M7 1 L11 5 L7 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{item.para}</span>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-xl font-bold text-foreground leading-tight">{item.media}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${item.change < 0 ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
                    {item.change < 0 ? "↘" : "↗"} {Math.abs(item.change)}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">média</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                  <div>
                    <span className="block font-semibold text-foreground/70">Mediana</span>
                    {item.mediana}
                  </div>
                  <div>
                    <span className="block font-semibold text-foreground/70">Mín</span>
                    {item.min}
                  </div>
                  <div>
                    <span className="block font-semibold text-foreground/70">Máx</span>
                    {item.max}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Base: {item.base} leads</p>
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
                    animate={{ width: `${(ch.leads / channelData[0].leads) * 100}%` }}
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
