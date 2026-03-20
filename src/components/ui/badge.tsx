// Simple Badge Component
import { forwardRef, type HTMLAttributes } from 'react'

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
	variant?: 'default' | 'secondary' | 'outline'
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
	({ className = '', variant = 'default', ...props }, ref) => {
		const variants = {
			default: 'bg-primary text-primary-foreground hover:bg-primary/80',
			secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
			outline: 'text-foreground border border-input',
		}

		return (
			<div
				ref={ref}
				className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${variants[variant]} ${className}`}
				{...props}
			/>
		)
	}
)
Badge.displayName = 'Badge'
