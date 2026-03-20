// Chat Message Component - Displays user/assistant messages
import type { QueryMessage } from '@/stores/ai-query-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Bot, AlertTriangle, Info, MapPin } from 'lucide-react'

interface ChatMessageProps {
	message: QueryMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
	const { role, content, sql, results } = message

	const isUser = role === 'user'
	const isAssistant = role === 'assistant'
	const isError = role === 'error'
	const isSystem = role === 'system'

	return (
		<div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
			{/* Avatar */}
			<Avatar className={`h-8 w-8 ${isUser ? 'bg-primary' : 'bg-muted'}`}>
				<AvatarFallback>
					{isUser && <User className="w-4 h-4" />}
					{isAssistant && <Bot className="w-4 h-4" />}
					{isError && <AlertTriangle className="w-4 h-4 text-destructive" />}
					{isSystem && <Info className="w-4 h-4" />}
				</AvatarFallback>
			</Avatar>

			{/* Message Content */}
			<div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
				<Card
					className={`inline-block max-w-[90%] p-3 text-sm ${
						isUser
							? 'bg-primary text-primary-foreground'
							: isError
								? 'bg-destructive/10 text-destructive border-destructive/20'
								: 'bg-muted'
					}`}
				>
					<p className="whitespace-pre-wrap">{content}</p>

					{/* SQL Display */}
					{sql && (
						<div className="mt-2 p-2 bg-background/50 rounded font-mono text-xs overflow-x-auto">
							<pre>{sql}</pre>
						</div>
					)}

					{/* Results Summary */}
					{results && !results.error && (
						<div className="mt-2 flex items-center gap-2">
							<Badge variant="secondary" className="text-xs">
								{results.rowCount} rows
							</Badge>
							<Badge variant="outline" className="text-xs">
								{results.executionTime.toFixed(0)}ms
							</Badge>
							{results.rowCount > 0 && (
								<Badge variant="default" className="text-xs flex items-center gap-1">
									<MapPin className="w-3 h-3" />
									Shown on map
								</Badge>
							)}
						</div>
					)}

					{/* Error Display */}
					{results?.error && (
						<div className="mt-2 text-xs text-destructive">{results.error}</div>
					)}
				</Card>

				{/* Timestamp */}
				<p className="text-xs text-muted-foreground mt-1">
					{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
				</p>
			</div>
		</div>
	)
}
