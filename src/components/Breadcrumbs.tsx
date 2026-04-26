import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * HubSpot-style breadcrumb navigation.
 * Shows contextual path: CRM > Contatos > João Silva
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 -ml-1">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link
            to="/dashboard"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              {isLast || !item.href ? (
                <span className={`rounded-md px-1.5 py-1 ${isLast ? 'font-medium text-foreground' : ''}`}>
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
