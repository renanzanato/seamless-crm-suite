import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { SalesOverviewChart } from "@/components/dashboard/SalesOverviewChart";
import { TotalSubscriberChart } from "@/components/dashboard/TotalSubscriberChart";
import { SalesDistribution } from "@/components/dashboard/SalesDistribution";
import { IntegrationsList } from "@/components/dashboard/IntegrationsList";
import { Eye, DollarSign, TrendingDown, Calendar, Filter, Download, ChevronDown } from "lucide-react";

const Index = () => {
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Oct 18 - Nov 18
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            Monthly <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Filter className="h-4 w-4" /> Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Page Views" value="12,450" change={15.8} icon={Eye} delay={0} />
        <StatCard title="Total Revenue" value="363.95" change={-34.0} icon={DollarSign} prefix="$ " delay={0.1} />
        <StatCard title="Bounce Rate" value="86.5%" change={24.2} icon={TrendingDown} delay={0.15} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <SalesOverviewChart />
        <TotalSubscriberChart />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesDistribution />
        <IntegrationsList />
      </div>
    </DashboardLayout>
  );
};

export default Index;
