import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "border-[#F7931A]/40 bg-gradient-to-r from-[#EA580C]/25 to-[#F7931A]/20 text-[#FDBA74] shadow-[0_0_16px_-6px_rgba(247,147,26,0.35)]",
        secondary:
          "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20",
        destructive:
          "border-red-500/30 bg-red-500/15 text-red-200",
        outline: "border-white/15 bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge }
