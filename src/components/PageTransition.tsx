import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Wraps page content with a smooth fade-up entrance animation.
 * Use inside DashboardLayout to give the CRM a polished, app-like feel.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
