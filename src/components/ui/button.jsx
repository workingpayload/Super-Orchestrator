import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:brightness-110',
        destructive:
          'bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground shadow-lg shadow-destructive/30 hover:shadow-destructive/50 hover:brightness-110',
        outline:
          'border border-border bg-background/40 backdrop-blur hover:bg-accent/15 hover:text-accent-foreground hover:border-accent/40',
        secondary:
          'bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-white/5',
        ghost:
          'hover:bg-accent/15 hover:text-accent-foreground text-muted-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        gradient:
          'relative overflow-hidden bg-gradient-to-r from-primary via-accent to-info bg-[length:200%_200%] text-white shadow-xl shadow-primary/30 hover:shadow-accent/40 animate-gradient',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-lg px-6 text-base',
        icon: 'h-9 w-9',
        xs: 'h-7 rounded px-2 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
