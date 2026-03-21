import { useEffect, useRef } from 'react'
import { useAIQuery } from '@/hooks/use-ai-query'
import { ChatMessage } from '../ai-query/chat-message'
import { ChatInput } from '../ai-query/chat-input'
import { SuggestionChips } from '../ai-query/suggestion-chips'
import { Sparkles, Trash2, Database, Loader2 } from 'lucide-react'

export function AIQueryPanel() {
	const {
		messages,
		status,
		clearChat,
		isDataReady,
		isSyncing,
		syncProgress,
		syncStatusMessage,
	} = useAIQuery()

	const scrollRef = useRef<HTMLDivElement>(null)

	// Auto-scroll to bottom
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [messages])

	// If data not ready, show placeholder
	if (!isDataReady) {
		return (
			<div className="flex flex-col h-full">
				<div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-purple-400" />
						<span className="text-sm font-medium text-zinc-200">Ask AI</span>
					</div>
				</div>

				<div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
					{isSyncing ? (
						<>
							<Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
							<p className="text-sm text-zinc-400">{syncStatusMessage || 'Syncing data to AI...'}</p>
							<div className="w-32 h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
								<div 
									className="h-full bg-purple-500 transition-all duration-300"
									style={{ width: `${syncProgress}%` }}
								/>
							</div>
							<p className="text-xs text-zinc-600 mt-1">{syncProgress}%</p>
						</>
					) : (
						<>
							<Database className="w-10 h-10 text-zinc-700 mb-3" />
							<p className="text-sm text-zinc-500">
								Load OSM data to enable AI Query
							</p>
							<p className="text-xs text-zinc-600 mt-2">
								Drop a .pbf file or use sample data
							</p>
						</>
					)}
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
				<div className="flex items-center gap-2">
					<Sparkles className="w-4 h-4 text-purple-400" />
					<span className="text-sm font-medium text-zinc-200">Ask AI</span>
				</div>
				{messages.length > 0 && (
					<button
						onClick={clearChat}
						className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
						title="Clear chat"
					>
						<Trash2 className="w-3.5 h-3.5 text-zinc-500" />
					</button>
				)}
			</div>

			{/* Messages */}
			<div 
				ref={scrollRef}
				className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0"
			>
				{messages.length === 0 ? (
					<div className="text-center py-6 text-zinc-500">
						<div className="flex justify-center mb-3">
							<Sparkles className="w-8 h-8 text-purple-500/50" />
						</div>
						<p className="text-sm">
							Ask questions about your OSM data in natural language.
						</p>
						<p className="text-xs mt-2 text-zinc-600">
							Examples: "Show primary roads" or "Find roads longer than 5km"
						</p>
					</div>
				) : (
					messages.map((message) => (
						<ChatMessage key={message.id} message={message} />
					))
				)}
			</div>

			{/* Suggestions - only show when idle and no messages */}
			{status === 'idle' && messages.length === 0 && (
				<div className="border-t border-zinc-800 px-3 py-2 shrink-0">
					<p className="text-[10px] text-zinc-600 mb-2">Try asking:</p>
					<SuggestionChips />
				</div>
			)}

			{/* Input */}
			<div className="border-t border-zinc-800 p-3 shrink-0">
				<ChatInput />
			</div>
		</div>
	)
}
