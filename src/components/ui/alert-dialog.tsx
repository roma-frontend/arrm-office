'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';
import { cn } from '@/lib/utils';

const AlertDialog = Dialog;

const AlertDialogTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button> & {
    asChild?: boolean;
  }
>(({ className, ...props }, ref) => (
  <Button ref={ref} variant="outline" className={className} {...props} />
));
AlertDialogTrigger.displayName = 'AlertDialogTrigger';

interface AlertDialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogContent> {
  onOpenChange?: (open: boolean) => void;
}

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  AlertDialogContentProps
>(({ className, ...props }, ref) => (
  <DialogContent ref={ref} className={cn('max-w-sm', className)} {...props} />
));
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = DialogHeader;

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-row gap-3 justify-end', className)} {...props} />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = DialogTitle;

const AlertDialogDescription = DialogDescription;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => <Button ref={ref} {...props} className={cn('', className)} />);
AlertDialogAction.displayName = 'AlertDialogAction';

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => (
  <Button ref={ref} variant="outline" {...props} className={cn('', className)} />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
