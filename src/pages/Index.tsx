import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { SalesOverviewChart } from "@/components/dashboard/SalesOverviewChart";
import { TotalSubscriberChart } from "@/components/dashboard/TotalSubscriberChart";
import { SalesDistribution } from "@/components/dashboard/SalesDistribution";
import { FunnelOverview } from "@/components/dashboard/FunnelOverview";
import { SalesByChannel } from "@/components/dashboard/SalesByChannel";
import { Users, ShoppingCart, DollarSign, Target, Calendar, Filter, Download, ChevronDown } from "lucide-react";

const Index = () => {
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Visão Geral</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Calendar className="h-4 w-4" />
            18 Out - 18 Nov
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            Mensal <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtrar
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Stat Cards — Marketing + Vendas unified */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Contatos Totais" value="1.248" change={12.5} icon={Users} delay={0} />
        <StatCard title="Vendas Realizadas" value="34" change={8.3} icon={ShoppingCart} delay={0.05} />
        <StatCard title="Receita Total" value="4.520.000" change={15.8} icon={DollarSign} prefix="R$ " delay={0.1} />
        <StatCard title="Taxa de Conversão" value="2,7%" change={-3.2} icon={Target} delay={0.15} />
      </div>

      {/* Funnel + Sales by Channel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <FunnelOverview />
        <SalesByChannel />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <SalesOverviewChart />
        <TotalSubscriberChart />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesDistribution />
      </div>
    </DashboardLayout>
  );
};

export default Index;
