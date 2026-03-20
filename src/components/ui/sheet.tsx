// Simple Sheet/Dialog Component
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

export interface SheetProps {
	open?: boolean
	onOpenChange?: (open: boolean) => void
	children: ReactNode
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
	if (!open) return null
	return (
		<div className="fixed inset-0 z-50">
			{/* Backdrop */}
			<div 
				className="fixed inset-0 bg-black/50"
				onClick={() => onOpenChange?.(false)}
			/>
			{/* Content */}
			{children}
		</div>
	)
}

export interface SheetContentProps extends HTMLAttributes<HTMLDivElement> {}

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
	({ className = '', children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`fixed right-0 top-0 h-full w-full sm:max-w-lg bg-background shadow-lg ${className}`}
				{...props}
			>
				{children}
			</div>
		)
	}
)
SheetContent.displayName = 'SheetContent'

export interface SheetHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const SheetHeader = forwardRef<HTMLDivElement, SheetHeaderProps>(
	({ className = '', ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`flex flex-col space-y-1.5 p-4 ${className}`}
				{...props}
			/>
		)
	}
)
SheetHeader.displayName = 'SheetHeader'

export interface SheetTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export const SheetTitle = forwardRef<HTMLHeadingElement, SheetTitleProps>(
	({ className = '', ...props }, ref) => {
		return (
			<h2
				ref={ref}
				className={`text-lg font-semibold leading-none tracking-tight ${className}`}
				{...props}
			/>
		)
	}
)
SheetTitle.displayName = 'SheetTitle'

// Unused but exported for compatibility
export const SheetTrigger = ({ children }: { children: ReactNode }) => children
