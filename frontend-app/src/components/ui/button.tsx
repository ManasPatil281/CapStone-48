import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-white shadow-sm shadow-brand/30 hover:bg-brand/90 hover:shadow-md hover:shadow-brand/25",
        secondary:
          "border border-slate-700/80 bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 hover:border-slate-600",
        ghost:
          "bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
        outline:
          "border border-brand/40 bg-transparent text-brand hover:border-brand/70 hover:bg-brand/8"
      },
      size: {
        default: "h-10 px-6",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
