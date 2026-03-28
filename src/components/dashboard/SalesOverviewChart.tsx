import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Filter, ArrowUpDown, MoreHorizontal } from "lucide-react";

const data = [
  { month: "Oct", China: 900, UE: 700, USA: 500, Canada: 500, Other: 388 },
  { month: "Nov", China: 600, UE: 500, USA: 365, Canada: 200, Other: 100 },
  { month: "Dec", China: 1200, UE: 1000, USA: 800, Canada: 600, Other: 406 },
];

const COLORS = {
  China: "hsl(240, 24%, 15%)",
  UE: "hsl(220, 70%, 55%)",
  USA: "hsl(168, 70%, 48%)",
  Canada: "hsl(252, 56%, 57%)",
  Other: "hsl(252, 56%, 77%)",
};

export function SalesOverviewChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="chart-card col-span-2"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">📊 Sales Overview</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" /> Sort
          </button>
          <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className="text-3xl font-bold text-foreground">$ 9,257.51</span>
        <span className="badge-success mb-1">↗ 15.8%</span>
        <span className="text-xs text-muted-foreground mb-1">+ $143.50 increased</span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barGap={2} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "hsl(0, 0%, 100%)",
              border: "1px solid hsl(220, 13%, 91%)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
          />
          <Bar dataKey="China" stackId="a" fill={COLORS.China} radius={[0, 0, 0, 0]} />
          <Bar dataKey="UE" stackId="a" fill={COLORS.UE} radius={[0, 0, 0, 0]} />
          <Bar dataKey="USA" stackId="a" fill={COLORS.USA} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Canada" stackId="a" fill={COLORS.Canada} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Other" stackId="a" fill={COLORS.Other} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-5 mt-3">
        {Object.entries(COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-xs text-muted-foreground">{key}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
