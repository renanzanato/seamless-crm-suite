import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

const integrations = [
  { name: "Stripe", type: "Finance", rate: 40, color: "hsl(252, 56%, 57%)" },
  { name: "Zapier", type: "CRM", rate: 28, color: "hsl(168, 70%, 48%)" },
  { name: "Shopify", type: "Marketplace", rate: 20, color: "hsl(220, 70%, 55%)" },
];

export function IntegrationsList() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="chart-card"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">List of Integration</span>
        <button className="text-xs font-medium text-primary hover:underline">See All</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="pb-3 text-left font-medium w-8">
                <input type="checkbox" className="rounded border-border" />
              </th>
              <th className="pb-3 text-left font-medium">APPLICATION</th>
              <th className="pb-3 text-left font-medium">TYPE</th>
              <th className="pb-3 text-left font-medium">RATE</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((item, i) => (
              <motion.tr
                key={item.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="border-b border-border last:border-0"
              >
                <td className="py-3">
                  <input type="checkbox" className="rounded border-border" />
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: `${item.color}20`, color: item.color }}
                    >
                      {item.name[0]}
                    </div>
                    <span className="font-medium text-foreground">{item.name}</span>
                  </div>
                </td>
                <td className="py-3 text-muted-foreground">{item.type}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${item.rate}%`, background: item.color }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.rate}%</span>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
