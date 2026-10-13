import type { ReactNode } from 'react';
import { motion } from 'motion/react';

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  if (typeof IntersectionObserver === 'undefined') {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
