import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { motion } from "framer-motion";
import {
  Bot,
  Clock,
  CalendarCheck,
  Search,
  RefreshCw,
  Send,
  MousePointerClick,
  TrendingUp,
  Calendar,
  Filter,
  Sparkles,
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
  Legend,
  PieChart,
  Pie,
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

// Objeções mapeadas
const objections = [
  { objecao: "Preço alto", mapeadas: 142, tratadas: 118, taxa: "83%" },
  { objecao: "Localização", mapeadas: 98, tratadas: 72, taxa: "73%" },
  { objecao: "Prazo de entrega", mapeadas: 76, tratadas: 61, taxa: "80%" },
  { objecao: "Tamanho do imóvel", mapeadas: 54, tratadas: 41, taxa: "76%" },
  { objecao: "Financiamento", mapeadas: 47, tratadas: 39, taxa: "83%" },
];

// Conversão de follow-up por canal
const followUpByChannel = [
  { canal: "WhatsApp", enviados: 1240, engajados: 521, convertidos: 86, taxaConversao: "6,9%" },
  { canal: "E-mail", enviados: 860, engajados: 241, convertidos: 32, taxaConversao: "3,7%" },
  { canal: "SMS", enviados: 340, engajados: 61, convertidos: 8, taxaConversao: "2,4%" },
];

// Influência IA na conversão
const aiInfluenceData = [
  { mes: "Jul", comIA: 18, semIA: 6 },
  { mes: "Ago", comIA: 24, semIA: 8 },
  { mes: "Set", comIA: 32, semIA: 7 },
  { mes: "Out", comIA: 38, semIA: 9 },
  { mes: "Nov", comIA: 47, semIA: 11 },
  { mes: "Dez", comIA: 42, semIA: 10 },
];

// Distribuição de engajamento IA
const engagementPie = [
  { name: "Respondeu", value: 62, color: "#FF8A00" },
  { name: "Agendou", value: 22, color: "#FFA940" },
  { name: "Sem resposta", value: 16, color: "#666666" },
];

export default function IAPage() {
  const { theme } = useTheme();
  const gridColor = theme === "dark" ? "#2A2A2A" : "#E0DDD8";
  const tickColor = theme === "dark" ? "#A0A0A0" : "#6B6B6B";
  const tooltipBg = theme === "dark" ? "#1C1C1C" : "#FFFFFF";
  const tooltipBorder = theme === "dark" ? "#2A2A2A" : "#E0DDD8";
  const tooltipColor = theme === "dark" ? "#FFFFFF" : "#003D2B";
  const areaFill = theme === "dark" ? "rgba(255,138,0,0.15)" : "rgba(255,138,30,0.1)";
  const areaFill2 = theme === "dark" ? "rgba(160,160,160,0.1)" : "rgba(100,100,100,0.08)";

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
        <StatCard title="Tempo Médio de Resposta" value="1m 42s" change={-18.3} icon={Clock} delay={0.05} />
        <StatCard title="Agendamentos pela IA" value="487" change={18.7} icon={CalendarCheck} delay={0.1} />
        <StatCard title="Objeções Mapeadas" value="417" change={12.3} icon={Search} delay={0.15} />
      </div>

      {/* Atendimentos + Objeções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Atendimentos IA por Semana */}
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

        {/* Objeções Mapeadas */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Objeções Mapeadas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Objeção</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Mapeadas</th>
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
                    <td className="py-3 text-muted-foreground">{obj.mapeadas}</td>
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
        <StatCard title="Engajamento pela IA" value="34,8%" change={5.2} icon={MousePointerClick} delay={0.4} />
        <StatCard title="Conversões por Reativação" value="49" change={28.4} icon={TrendingUp} delay={0.45} />
      </div>

      {/* Conversão por Canal + Engajamento IA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Conversão follow-up por canal */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="chart-card col-span-2"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Conversão de Follow-up por Canal</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Canal</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Enviados</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Engajados</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Convertidos</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {followUpByChannel.map((ch, i) => (
                  <motion.tr
                    key={ch.canal}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.08 }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 font-medium text-foreground">{ch.canal}</td>
                    <td className="py-3 text-muted-foreground">{ch.enviados.toLocaleString("pt-BR")}</td>
                    <td className="py-3 text-foreground">{ch.engajados.toLocaleString("pt-BR")}</td>
                    <td className="py-3 text-foreground font-semibold">{ch.convertidos}</td>
                    <td className="py-3">
                      <span className="pipa-badge">{ch.taxaConversao}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>

            {/* Barra visual de proporção */}
            <div className="mt-4 space-y-2">
              {followUpByChannel.map((ch, i) => (
                <motion.div
                  key={`bar-${ch.canal}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground w-20">{ch.canal}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(ch.enviados / 1240) * 100}%` }}
                        transition={{ delay: 0.9 + i * 0.1, duration: 0.6 }}
                        className="h-full rounded-full bg-primary"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Engajamento IA (Pie) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Engajamento pela IA</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={engagementPie}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                strokeWidth={0}
              >
                {engagementPie.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: tooltipColor,
                }}
                formatter={(value: number) => [`${value}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {engagementPie.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                <span className="text-xs text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Influência da IA na Conversão */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        className="chart-card"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Influência da IA na Conversão</h3>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={aiInfluenceData}>
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
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "12px", color: tickColor }}
            />
            <Area type="monotone" dataKey="comIA" name="Com IA" stroke="#FF8A00" fill={areaFill} strokeWidth={2} />
            <Area type="monotone" dataKey="semIA" name="Sem IA" stroke="#A0A0A0" fill={areaFill2} strokeWidth={2} strokeDasharray="4 4" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground">
          <div>
            <span className="text-foreground font-semibold text-lg">4,2x</span>
            <p>mais conversões com IA</p>
          </div>
          <div>
            <span className="text-foreground font-semibold text-lg">78%</span>
            <p>das vendas tiveram influência da IA</p>
          </div>
          <div>
            <span className="text-foreground font-semibold text-lg">-62%</span>
            <p>redução no tempo de resposta</p>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
