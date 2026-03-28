import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, ReferenceLine } from "recharts";
import { useTheme } from "@/hooks/use-theme";

const data = [
  { mes: "Jun", orcado: 2800000, realizado: 2750000 },
  { mes: "Jul", orcado: 3200000, realizado: 2950000 },
  { mes: "Ago", orcado: 3500000, realizado: 3800000 },
  { mes: "Set", orcado: 3000000, realizado: 2750000 },
  { mes: "Out", orcado: 4000000, realizado: 4200000 },
  { mes: "Nov", orcado: 3800000, realizado: 3500000 },
];

function formatValue(value: number) {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  return `R$ ${(value / 1000).toFixed(0)}k`;
}

export function BudgetComparison() {
  const { theme } = useTheme();
  const tickColor = theme === "dark" ? "#A0A0A0" : "#6B6B6B";
  const tooltipBg = theme === "dark" ? "#1C1C1C" : "#FFFFFF";
  const tooltipBorder = theme === "dark" ? "#2A2A2A" : "#E0DDD8";
  const tooltipColor = theme === "dark" ? "#FFFFFF" : "#003D2B";
  const orcadoColor = theme === "dark" ? "#4A4A4A" : "#D1D5DB";

  const totalOrcado = data.reduce((s, d) => s + d.orcado, 0);
  const totalRealizado = data.reduce((s, d) => s + d.realizado, 0);
  const variacao = ((totalRealizado - totalOrcado) / totalOrcado * 100).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="chart-card"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">Investimento — Orçado vs Realizado</span>
        <span className={`text-xs font-medium ${Number(variacao) >= 0 ? "text-green-500" : "text-red-400"}`}>
          {Number(variacao) >= 0 ? "+" : ""}{variacao}%
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">Mensal</p>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <XAxis
            dataKey="mes"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: tickColor }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: tickColor }}
            tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
            width={42}
          />
          <Tooltip
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: "8px",
              fontSize: "12px",
              color: tooltipColor,
            }}
            labelStyle={{ color: tooltipColor }}
            formatter={(value: number, name: string) => [
              formatValue(value),
              name === "orcado" ? "Orçado" : "Realizado",
            ]}
          />
          <Legend
            formatter={(value: string) => (value === "orcado" ? "Orçado" : "Realizado")}
            wrapperStyle={{ fontSize: "11px" }}
          />
          <Bar dataKey="orcado" fill={orcadoColor} radius={[4, 4, 0, 0]} barSize={18} />
          <Bar dataKey="realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-3 pt-3 border-t border-border flex gap-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground flex-1">
          <span>Orçado</span>
          <span className="font-bold text-foreground">{formatValue(totalOrcado)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground flex-1">
          <span>Realizado</span>
          <span className="font-bold text-primary">{formatValue(totalRealizado)}</span>
        </div>
      </div>
    </motion.div>
  );
}
