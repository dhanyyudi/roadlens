// Simple Avatar Component
import { forwardRef, type HTMLAttributes } from 'react'

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
	({ className = '', ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`}
				{...props}
			/>
		)
	}
)
Avatar.displayName = 'Avatar'

export interface AvatarFallbackProps extends HTMLAttributes<HTMLDivElement> {}

export const AvatarFallback = forwardRef<HTMLDivElement, AvatarFallbackProps>(
	({ className = '', ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={`flex h-full w-full items-center justify-center rounded-full bg-muted ${className}`}
				{...props}
			/>
		)
	}
)
AvatarFallback.displayName = 'AvatarFallback'
