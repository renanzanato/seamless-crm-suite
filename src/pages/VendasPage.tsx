import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Users,
  Target,
  Handshake,
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
  AreaChart,
  Area,
  Cell,
} from "recharts";
import { useTheme } from "@/hooks/use-theme";

// Pipeline de vendas
const pipelineData = [
  { etapa: "Qualificação", valor: 342, ticket: "R$ 285K" },
  { etapa: "Proposta Enviada", valor: 186, ticket: "R$ 412K" },
  { etapa: "Negociação", valor: 94, ticket: "R$ 520K" },
  { etapa: "Fechamento", valor: 47, ticket: "R$ 680K" },
  { etapa: "Pós-venda", valor: 38, ticket: "R$ 710K" },
];

// Receita mensal
const revenueData = [
  { mes: "Jan", receita: 180000 },
  { mes: "Fev", receita: 220000 },
  { mes: "Mar", receita: 195000 },
  { mes: "Abr", receita: 310000 },
  { mes: "Mai", receita: 280000 },
  { mes: "Jun", receita: 350000 },
  { mes: "Jul", receita: 420000 },
  { mes: "Ago", receita: 390000 },
  { mes: "Set", receita: 480000 },
  { mes: "Out", receita: 520000 },
  { mes: "Nov", receita: 610000 },
  { mes: "Dez", receita: 570000 },
];

// Top vendedores
const topSellers = [
  { nome: "Ana Costa", vendas: 48, receita: "R$ 1.2M", conversao: "32%" },
  { nome: "Carlos Silva", vendas: 42, receita: "R$ 980K", conversao: "28%" },
  { nome: "Fernanda Lima", vendas: 37, receita: "R$ 870K", conversao: "25%" },
  { nome: "Rafael Santos", vendas: 31, receita: "R$ 720K", conversao: "22%" },
  { nome: "Julia Mendes", vendas: 28, receita: "R$ 650K", conversao: "20%" },
];

// Vendas por produto
const productData = [
  { produto: "Apartamento 2Q", vendas: 124, color: "#FF8A00" },
  { produto: "Apartamento 3Q", vendas: 89, color: "#FFA940" },
  { produto: "Cobertura", vendas: 42, color: "#CC6E00" },
  { produto: "Sala Comercial", vendas: 38, color: "#A0A0A0" },
];

export default function VendasPage() {
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
        <h1 className="text-2xl font-bold text-foreground">Vendas</h1>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Receita Total" value="4,5M" change={18.2} icon={DollarSign} prefix="R$ " delay={0} />
        <StatCard title="Ticket Médio" value="520K" change={12.5} icon={TrendingUp} prefix="R$ " delay={0.05} />
        <StatCard title="Ciclo Médio" value="23 dias" change={-15.3} icon={Clock} delay={0.1} />
        <StatCard title="Taxa de Conversão" value="13,7%" change={3.8} icon={Target} delay={0.15} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Negócios Ativos" value="342" change={8.4} icon={Handshake} delay={0.2} />
        <StatCard title="Novos Clientes" value="47" change={22.1} icon={Users} delay={0.25} />
        <StatCard title="Giro de Estoque" value="16,6 meses" change={-5.2} icon={Clock} delay={0.3} />
      </div>

      {/* Pipeline + Receita */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
            Pipeline de Vendas
          </h3>
          <div className="space-y-2">
            {pipelineData.map((step, i) => {
              const barWidth = Math.max(20, 100 - i * 18);
              return (
                <motion.div
                  key={step.etapa}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-32 text-xs text-muted-foreground truncate">{step.etapa}</div>
                  <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.6 }}
                      className="h-full rounded-lg flex items-center justify-between px-3"
                      style={{
                        background: i === 0 ? "#FF8A00" : i === 1 ? "#FFA940" : i === 2 ? "#CC6E00" : i === 3 ? "#A0A0A0" : "#666666",
                      }}
                    >
                      <span className="text-xs font-bold text-white">{step.valor}</span>
                      <span className="text-[10px] text-white/80">{step.ticket}</span>
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Receita mensal */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Receita Mensal</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: tickColor }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: tickColor }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{
                  background: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: tooltipColor,
                }}
                formatter={(value: number) => [`R$ ${(value / 1000).toFixed(0)}K`, "Receita"]}
              />
              <Area type="monotone" dataKey="receita" stroke="#FF8A00" fill={areaFill} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Top Vendedores + Vendas por Produto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top vendedores */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">🏆 Top Vendedores</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Vendedor</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Vendas</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Receita</th>
                  <th className="pb-3 text-left font-medium uppercase tracking-wider text-[11px]">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((seller, i) => (
                  <motion.tr
                    key={seller.nome}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.08 }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">
                            {seller.nome.split(" ").map(n => n[0]).join("")}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">{seller.nome}</span>
                      </div>
                    </td>
                    <td className="py-3 text-foreground font-semibold">{seller.vendas}</td>
                    <td className="py-3 text-muted-foreground">{seller.receita}</td>
                    <td className="py-3">
                      <span className="pipa-badge">{seller.conversao}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Vendas por produto */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Vendas por Produto</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={productData} layout="vertical" barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} />
              <YAxis
                dataKey="produto"
                type="category"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: tickColor }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  background: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: tooltipColor,
                }}
              />
              <Bar dataKey="vendas" radius={[0, 4, 4, 0]}>
                {productData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
