import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Filter, ArrowUpDown, MoreHorizontal } from "lucide-react";

const data = [
  { month: "Oct", Direct: 900, Referral: 700, Organic: 500, Social: 500, Other: 388 },
  { month: "Nov", Direct: 600, Referral: 500, Organic: 365, Social: 200, Other: 100 },
  { month: "Dec", Direct: 1200, Referral: 1000, Organic: 800, Social: 600, Other: 406 },
];

const COLORS = {
  Direct: "#FF8A00",
  Referral: "#FFA940",
  Organic: "#CC6E00",
  Social: "#A0A0A0",
  Other: "#2A2A2A",
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
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-secondary hover:text-primary transition-colors text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-secondary hover:text-primary transition-colors text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" /> Sort
          </button>
          <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary">
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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 16%)" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#A0A0A0" }} />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "#1C1C1C",
              border: "1px solid #2A2A2A",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#FFFFFF",
            }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
          />
          <Bar dataKey="Direct" stackId="a" fill={COLORS.Direct} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Referral" stackId="a" fill={COLORS.Referral} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Organic" stackId="a" fill={COLORS.Organic} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Social" stackId="a" fill={COLORS.Social} radius={[0, 0, 0, 0]} />
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
