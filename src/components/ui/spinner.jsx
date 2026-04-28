import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, size = 18, ...props }) {
  return <Loader2 className={cn('animate-spin text-primary', className)} size={size} {...props} />;
}
