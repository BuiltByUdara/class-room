import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const variants = cva('inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50', { variants: { variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border border-border bg-card hover:bg-muted', ghost: 'hover:bg-muted' }, size: { default: 'h-11 px-5', icon: 'h-11 w-11' } }, defaultVariants: { variant: 'default', size: 'default' } });
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(variants({ variant, size }), className)} {...props}/>; }
