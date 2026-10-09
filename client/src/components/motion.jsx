import { motion } from 'framer-motion';

// Shared, minimal motion primitives so animation stays consistent and subtle
// across the app and matches the Neo-Brutalist feel (quick, snappy, no bounce).

// Page enter/exit — small fade + slide. Keyed by route in <Chrome>.
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};
export const pageTransition = { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] };

export function PageTransition({ children, className }) {
  return (
    <motion.div
      className={className}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}

// Stagger container + item for grids/lists of cards.
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};
// Entrance animation intentionally disabled: the upward rise on every navigation
// read as flicker/eye-strain. Cards now render in place. (Shape kept so existing
// variants/initial/animate props stay valid; hover/tap interactions are unchanged.)
export const fadeUp = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
};

// Interactive props reused on buttons / tappable rows. The brutalist "press"
// is still mostly CSS (translate + shadow collapse); this adds a subtle scale.
export const tapProps = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
};

// motion.create() shorthands used around the app.
export const MotionDiv = motion.div;
export const MotionButton = motion.button;
