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

// Lead time entre etapas (alinhado ao funil)
const leadTimeData = [
  { de: "Leads", para: "MQL", media: "3,2 dias", mediana: "1,5 dias", min: "0,0", max: "42 dias", base: 2480, change: -12.4 },
  { de: "MQL", para: "SQL", media: "5,8 dias", mediana: "3,1 dias", min: "0,1", max: "89 dias", base: 890, change: -6.1 },
  { de: "SQL", para: "Visita Agendada", media: "4,1 dias", mediana: "2,3 dias", min: "0,0", max: "58 dias", base: 515, change: 2.3 },
  { de: "Visita Agendada", para: "Visita Realizada", media: "6,7 dias", mediana: "5,0 dias", min: "0,0", max: "45 dias", base: 380, change: -3.8 },
  { de: "Visita Realizada", para: "Comprou", media: "14,4 dias", mediana: "10,4 dias", min: "0,2", max: "134 dias", base: 294, change: -8.2 },
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

      {/* Funil de Conversão com Lead Time integrado */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="chart-card mb-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Funil de Conversão
          </h3>
          <span className="text-xs text-muted-foreground">Lead time entre etapas</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Funil visual */}
          <div className="flex flex-col items-center">
            {funnelData.map((step, i) => {
              const widthPct = Math.max(32, 100 - i * 13);
              const colors = [
                "hsl(var(--primary))",
                "hsl(32, 90%, 45%)",
                "hsl(32, 80%, 38%)",
                "hsl(32, 60%, 32%)",
                "hsl(0, 0%, 45%)",
                "hsl(0, 0%, 38%)",
              ];
              const lt = leadTimeData[i];
              return (
                <motion.div
                  key={step.etapa}
                  initial={{ opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
                  className="flex flex-col items-center w-full"
                >
                  <div
                    className="rounded-lg py-3 px-4 text-center transition-all"
                    style={{ width: `${widthPct}%`, background: colors[i] }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{step.etapa}</p>
                    {step.sub && <p className="text-[9px] text-white/50 mt-0.5">{step.sub}</p>}
                    <p className="text-2xl font-bold text-white mt-1">{step.valor.toLocaleString("pt-BR")}</p>
                    <p className="text-[10px] text-white/60">{step.pct} dos Leads</p>
                  </div>

                  {step.convPct && (
                    <div className="flex items-center gap-2 my-3">
                      <svg width="10" height="20" viewBox="0 0 10 20" className="text-primary shrink-0 opacity-60">
                        <path d="M5 0 L5 15 M1 12 L5 18 L9 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[10px] text-muted-foreground">{step.convPct}</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Lead times coluna lateral */}
          <div className="flex flex-col gap-2 justify-center">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Tempo entre etapas</h4>
            {leadTimeData.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="p-2.5 rounded-lg border border-border bg-secondary/20"
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[9px] text-muted-foreground truncate">{item.de}</span>
                  <svg width="10" height="8" viewBox="0 0 10 8" className="text-primary shrink-0 opacity-60">
                    <path d="M0 4 L7 4 M5 1 L8 4 L5 7" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[9px] text-muted-foreground truncate">{item.para}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-foreground">{item.media}</span>
                  <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${item.change < 0 ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
                    {item.change < 0 ? "↘" : "↗"} {Math.abs(item.change)}%
                  </span>
                </div>
                <div className="flex gap-2 mt-1 text-[9px] text-muted-foreground">
                  <span>Med: {item.mediana}</span>
                  <span>Mín: {item.min}</span>
                  <span>Máx: {item.max}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

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
