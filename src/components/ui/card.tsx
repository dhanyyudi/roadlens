// Simple Card Component
import { forwardRef, type HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
	({ className = '', ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`}
				{...props}
			/>
		)
	}
)
Card.displayName = 'Card'
