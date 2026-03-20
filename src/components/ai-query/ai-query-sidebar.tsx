// AI Query Sidebar - Main chat interface for natural language queries
import { useEffect, useRef } from 'react'
import { useAIQuery } from '@/hooks/use-ai-query'
// AI Query Sidebar component
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { SuggestionChips } from './suggestion-chips'
import { SQLPreview } from './sql-preview'
import { Sparkles, X, Trash2, MessageSquare } from 'lucide-react'

export function AIQuerySidebar() {
	const {
		isOpen,
		toggleOpen,
		messages,
		status,
		currentSQL,
		clearChat,
		confirmSQL,
		rejectSQL,
	} = useAIQuery()

	const scrollRef = useRef<HTMLDivElement>(null)

	// Auto-scroll to bottom
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [messages])

	return (
		<>
			{/* Floating Button */}
			{!isOpen && (
				<button
					onClick={toggleOpen}
					className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center z-50"
				>
					<MessageSquare className="w-6 h-6" />
				</button>
			)}

			{/* Sidebar */}
			{isOpen && (
				<div className="fixed inset-0 z-50 flex justify-end">
					{/* Backdrop */}
					<div 
						className="absolute inset-0 bg-black/50"
						onClick={toggleOpen}
					/>
					
					{/* Panel */}
					<div className="relative w-full max-w-md h-full bg-background border-l flex flex-col shadow-xl">
						{/* Header */}
						<div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
							<div className="flex items-center gap-2">
								<Sparkles className="w-5 h-5 text-primary" />
								<h2 className="font-semibold">AI Query Assistant</h2>
							</div>
							<div className="flex items-center gap-1">
								<button
									onClick={clearChat}
									className="p-2 hover:bg-muted rounded-md transition-colors"
									title="Clear chat"
								>
									<Trash2 className="w-4 h-4" />
								</button>
								<button
									onClick={toggleOpen}
									className="p-2 hover:bg-muted rounded-md transition-colors"
								>
									<X className="w-4 h-4" />
								</button>
							</div>
						</div>

						{/* Messages */}
						<div 
							ref={scrollRef}
							className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
						>
							{messages.length === 0 ? (
								<div className="text-center py-8 text-muted-foreground">
									<p className="text-sm">
										Ask questions about your OSM data in natural language.
									</p>
									<p className="text-xs mt-2">
										Examples: "Show primary roads" or "Find roads longer than 5km"
									</p>
								</div>
							) : (
								messages.map((message) => (
									<ChatMessage key={message.id} message={message} />
								))
							)}

							{/* SQL Preview */}
							{status === 'confirming' && currentSQL && (
								<SQLPreview
									sql={currentSQL}
									onConfirm={confirmSQL}
									onReject={rejectSQL}
								/>
							)}
						</div>

						{/* Suggestions */}
						{status === 'idle' && messages.length === 0 && (
							<div className="border-t px-4 py-3">
								<SuggestionChips />
							</div>
						)}

						{/* Input */}
						<div className="border-t p-4">
							<ChatInput />
						</div>
					</div>
				</div>
			)}
		</>
	)
}
