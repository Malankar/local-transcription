import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-full min-h-[44px] bg-gradient-to-r from-[#EA580C] to-[#F7931A] px-6 uppercase tracking-wider text-primary-foreground shadow-glow-orange hover:scale-[1.03] hover:shadow-glow-orange-lg active:scale-[0.99]",
        destructive:
          "rounded-full min-h-[44px] bg-destructive px-6 text-destructive-foreground shadow-[0_0_18px_-4px_rgba(220,38,38,0.45)] hover:bg-destructive/90 hover:scale-[1.02] active:scale-[0.99]",
        outline:
          "rounded-full border-2 border-white/20 bg-transparent text-foreground hover:border-white hover:bg-white/10",
        secondary:
          "rounded-full border border-white/10 bg-secondary/80 text-secondary-foreground shadow-sm hover:border-primary/35 hover:bg-secondary hover:shadow-glow-card",
        ghost:
          "rounded-full text-foreground hover:bg-white/10 hover:text-[#F7931A]",
        link: "h-auto rounded-none p-0 text-[#F7931A] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-full px-4 text-xs normal-case tracking-normal",
        lg: "h-12 rounded-full px-10 text-base",
        icon: "h-10 w-10 min-h-0 shrink-0 rounded-full p-0",
      },
    },
    compoundVariants: [
      {
        variant: "default",
        size: "sm",
        class: "min-h-9 uppercase tracking-wide",
      },
      {
        variant: "destructive",
        size: "sm",
        class: "min-h-9 normal-case tracking-normal",
      },
      {
        variant: "link",
        class:
          "h-auto min-h-0 px-0 py-0 normal-case tracking-normal hover:scale-100 active:scale-100 shadow-none",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
