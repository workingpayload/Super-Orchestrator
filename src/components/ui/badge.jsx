import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default:
          'border-primary/30 bg-primary/15 text-primary',
        secondary:
          'border-border bg-secondary text-secondary-foreground',
        destructive:
          'border-destructive/40 bg-destructive/15 text-destructive',
        success:
          'border-success/40 bg-success/15 text-success',
        warning:
          'border-warning/40 bg-warning/15 text-warning',
        accent:
          'border-accent/40 bg-accent/15 text-accent',
        info:
          'border-info/40 bg-info/15 text-info',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
