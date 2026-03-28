import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useTheme } from "@/hooks/use-theme";

const data = [
  { mes: "Jul", orcado: 320000, realizado: 295000 },
  { mes: "Ago", orcado: 350000, realizado: 380000 },
  { mes: "Set", orcado: 300000, realizado: 275000 },
  { mes: "Out", orcado: 400000, realizado: 420000 },
  { mes: "Nov", orcado: 380000, realizado: 350000 },
];

export function BudgetComparison() {
  const { theme } = useTheme();
  const tickColor = theme === "dark" ? "#A0A0A0" : "#6B6B6B";
  const tooltipBg = theme === "dark" ? "#1C1C1C" : "#FFFFFF";
  const tooltipBorder = theme === "dark" ? "#2A2A2A" : "#E0DDD8";
  const tooltipColor = theme === "dark" ? "#FFFFFF" : "#003D2B";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="chart-card"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">Orçado vs Realizado</span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={4}>
          <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} />
          <YAxis hide />
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
              `R$ ${(value / 1000).toFixed(0)}k`,
              name === "orcado" ? "Orçado" : "Realizado",
            ]}
          />
          <Legend
            formatter={(value: string) => (value === "orcado" ? "Orçado" : "Realizado")}
            wrapperStyle={{ fontSize: "11px" }}
          />
          <Bar dataKey="orcado" fill={theme === "dark" ? "#2A2A2A" : "#E0DDD8"} radius={[4, 4, 0, 0]} barSize={16} />
          <Bar dataKey="realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
