import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { motion } from "framer-motion";
import {
  Bot,
  Zap,
  CalendarCheck,
  ShieldAlert,
  RefreshCw,
  Send,
  MousePointerClick,
  TrendingUp,
  Calendar,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import { useTheme } from "@/hooks/use-theme";

// Atendimentos IA por semana
const weeklyAI = [
  { semana: "Sem 1", atendimentos: 320 },
  { semana: "Sem 2", atendimentos: 410 },
  { semana: "Sem 3", atendimentos: 385 },
  { semana: "Sem 4", atendimentos: 490 },
  { semana: "Sem 5", atendimentos: 530 },
  { semana: "Sem 6", atendimentos: 475 },
  { semana: "Sem 7", atendimentos: 620 },
  { semana: "Sem 8", atendimentos: 580 },
];

// Objeções rastreadas
const objections = [
  { objecao: "Preço alto", qtd: 142, tratadas: 118, taxa: "83%" },
  { objecao: "Localização", qtd: 98, tratadas: 72, taxa: "73%" },
  { objecao: "Prazo de entrega", qtd: 76, tratadas: 61, taxa: "80%" },
  { objecao: "Tamanho do imóvel", qtd: 54, tratadas: 41, taxa: "76%" },
  { objecao: "Financiamento", qtd: 47, tratadas: 39, taxa: "83%" },
];

// Follow-ups por tipo
const followUpData = [
  { tipo: "WhatsApp", enviados: 1240, engajamento: "42%" },
  { tipo: "E-mail", enviados: 860, engajamento: "28%" },
  { tipo: "SMS", enviados: 340, engajamento: "18%" },
];

// Reativações mensais
const reactivationData = [
  { mes: "Jul", reativados: 12, convertidos: 3 },
  { mes: "Ago", reativados: 18, convertidos: 5 },
  { mes: "Set", reativados: 24, convertidos: 7 },
  { mes: "Out", reativados: 31, convertidos: 9 },
  { mes: "Nov", reativados: 42, convertidos: 14 },
  { mes: "Dez", reativados: 38, convertidos: 11 },
];

export default function IAPage() {
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
        <h1 className="text-2xl font-bold text-foreground">Inteligência Artificial</h1>
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

      {/* ══════ PRÉ-VENDA ══════ */}
      <div className="mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          🤖 Performance IA — Pré-Venda
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Atendimentos pela IA" value="3.810" change={24.5} icon={Bot} delay={0} />
        <StatCard title="Resposta < 5 min" value="94,2%" change={3.1} icon={Zap} delay={0.05} />
        <StatCard title="Agendamentos pela IA" value="487" change={18.7} icon={CalendarCheck} delay={0.1} />
        <StatCard title="Objeções Tratadas" value="331" change={12.3} icon={ShieldAlert} delay={0.15} />
      </div>

      {/* Atendimentos + Objeções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Evolução de Atendimentos */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Atendimentos IA por Semana</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={weeklyAI}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="semana" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: tickColor }} />
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
              <Area type="monotone" dataKey="atendimentos" stroke="#FF8A00" fill={areaFill} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Objeções Rastreadas */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Objeções Rastreadas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Objeção</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Total</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Tratadas</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {objections.map((obj, i) => (
                  <motion.tr
                    key={obj.objecao}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 font-medium text-foreground">{obj.objecao}</td>
                    <td className="py-3 text-muted-foreground">{obj.qtd}</td>
                    <td className="py-3 text-foreground font-semibold">{obj.tratadas}</td>
                    <td className="py-3">
                      <span className="pipa-badge">{obj.taxa}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* ══════ FOLLOW-UP & REATIVAÇÃO ══════ */}
      <div className="mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          🔄 Performance IA — Follow-up & Reativação
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Leads Reativados" value="165" change={32.0} icon={RefreshCw} delay={0.3} />
        <StatCard title="Follow-ups Enviados" value="2.440" change={15.6} icon={Send} delay={0.35} />
        <StatCard title="Engajamento Follow-up" value="34,8%" change={5.2} icon={MousePointerClick} delay={0.4} />
        <StatCard title="Conversões por Reativação" value="49" change={28.4} icon={TrendingUp} delay={0.45} />
      </div>

      {/* Follow-ups + Reativações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Follow-ups por canal */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Follow-ups por Canal</h3>
          <div className="space-y-4">
            {followUpData.map((ch, i) => (
              <motion.div
                key={ch.tipo}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">{ch.tipo}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{ch.enviados.toLocaleString("pt-BR")} enviados</span>
                    <span className="pipa-badge">{ch.engajamento}</span>
                  </div>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(ch.enviados / 1240) * 100}%` }}
                    transition={{ delay: 0.7 + i * 0.1, duration: 0.6 }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Reativações mensal */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Reativações vs Conversões</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={reactivationData}>
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
              <Bar dataKey="reativados" name="Reativados" fill="#FF8A00" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="convertidos" name="Convertidos" fill="#FFA940" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
