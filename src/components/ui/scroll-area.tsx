// Simple ScrollArea Component
import { forwardRef, type HTMLAttributes } from 'react'

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
	({ className = '', children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`relative overflow-auto ${className}`}
				{...props}
			>
				{children}
			</div>
		)
	}
)
ScrollArea.displayName = 'ScrollArea'

export interface ScrollBarProps extends HTMLAttributes<HTMLDivElement> {
	orientation?: 'vertical' | 'horizontal'
}

export const ScrollBar = forwardRef<HTMLDivElement, ScrollBarProps>(
	({ className = '', orientation = 'vertical', ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`flex touch-none select-none transition-colors ${
					orientation === 'vertical' ? 'h-full w-2.5' : 'h-2.5 w-full'
				} ${className}`}
				{...props}
			/>
		)
	}
)
ScrollBar.displayName = 'ScrollBar'
