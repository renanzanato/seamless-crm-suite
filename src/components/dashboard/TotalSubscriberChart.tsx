import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown } from "lucide-react";

const data = [
  { day: "Sun", value: 2200 },
  { day: "Mon", value: 2800 },
  { day: "Tue", value: 3874 },
  { day: "Wed", value: 2100 },
  { day: "Thu", value: 2600 },
  { day: "Fri", value: 3200 },
  { day: "Sat", value: 2400 },
];

export function TotalSubscriberChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="chart-card"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-muted-foreground">Total Subscriber</span>
        <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground border border-border rounded-lg px-2.5 py-1 hover:bg-secondary transition-colors">
          Weekly <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className="text-3xl font-bold text-foreground">24,473</span>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="badge-success">↗ 8.3%</span>
        <span className="text-xs text-muted-foreground">+ 749 increased</span>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barSize={24}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "hsl(220, 10%, 50%)" }}
          />
          <Bar dataKey="value" radius={[4, 4, 4, 4]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.day === "Tue" ? "hsl(252, 56%, 57%)" : "hsl(252, 56%, 57%, 0.15)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Label on top of highlighted bar */}
      <div className="relative -mt-[140px] h-[140px] pointer-events-none">
        <div className="absolute left-[33%] top-1 text-xs font-semibold text-foreground bg-card px-1.5 py-0.5 rounded shadow-sm">
          3,874
        </div>
      </div>
    </motion.div>
  );
}
