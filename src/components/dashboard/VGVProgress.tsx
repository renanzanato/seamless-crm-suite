import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";

const empreendimentos = [
  { nome: "Residencial Aurora", vgvTotal: 45000000, vgvRealizado: 31500000 },
  { nome: "Ed. Solaris", vgvTotal: 28000000, vgvRealizado: 22400000 },
  { nome: "Park View", vgvTotal: 18000000, vgvRealizado: 5400000 },
  { nome: "Villa Jardins", vgvTotal: 12000000, vgvRealizado: 3600000 },
];

function formatCurrency(value: number) {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return `R$ ${value}`;
}

export function VGVProgress() {
  const { theme } = useTheme();
  const barBg = theme === "dark" ? "bg-[hsl(var(--muted))]" : "bg-[hsl(var(--muted))]";

  const totalVGV = empreendimentos.reduce((s, e) => s + e.vgvTotal, 0);
  const totalRealizado = empreendimentos.reduce((s, e) => s + e.vgvRealizado, 0);
  const pctGeral = ((totalRealizado / totalVGV) * 100).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="chart-card"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">VGV por Empreendimento</span>
        <span className="text-xs font-medium text-muted-foreground">{pctGeral}% realizado</span>
      </div>

      <div className="flex flex-col gap-4">
        {empreendimentos.map((emp, i) => {
          const pct = (emp.vgvRealizado / emp.vgvTotal) * 100;
          return (
            <motion.div
              key={emp.nome}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * i }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{emp.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(emp.vgvRealizado)} / {formatCurrency(emp.vgvTotal)}
                </span>
              </div>
              <div className={`w-full h-2 rounded-full ${barBg}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + 0.1 * i }}
                  className="h-full rounded-full bg-primary"
                />
              </div>
              <div className="text-right mt-0.5">
                <span className="text-[10px] font-semibold text-primary">{pct.toFixed(0)}%</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>VGV Total</span>
          <span className="font-bold text-foreground">{formatCurrency(totalVGV)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>Realizado</span>
          <span className="font-bold text-foreground">{formatCurrency(totalRealizado)}</span>
        </div>
      </div>
    </motion.div>
  );
}
