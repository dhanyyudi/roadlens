// SQL Preview Component - Shows generated SQL for confirmation
import { useAIQuery } from '@/hooks/use-ai-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Play, Code } from 'lucide-react'

interface SQLPreviewProps {
	sql: string
	onConfirm: () => void
	onReject: () => void
}

export function SQLPreview({ sql, onConfirm, onReject }: SQLPreviewProps) {
	const { isLoading } = useAIQuery()

	return (
		<Card className="p-4 my-4 border-primary/20 bg-primary/5">
			<div className="flex items-center gap-2 mb-3">
				<Code className="w-4 h-4 text-primary" />
				<span className="text-sm font-medium">Generated SQL Query</span>
			</div>

			{/* SQL Display */}
			<div className="bg-background rounded p-3 mb-4 overflow-x-auto">
				<pre className="text-xs font-mono whitespace-pre-wrap break-all">{sql}</pre>
			</div>

			{/* Action Buttons */}
			<div className="flex gap-2">
				<Button
					onClick={onConfirm}
					disabled={isLoading}
					size="sm"
					className="flex-1"
				>
					{isLoading ? (
						<>
							<span className="animate-spin mr-2">⏳</span>
							Executing...
						</>
					) : (
						<>
							<Play className="w-4 h-4 mr-1" />
							Execute Query
						</>
					)}
				</Button>
				<Button onClick={onReject} variant="outline" size="sm">
					<X className="w-4 h-4 mr-1" />
					Cancel
				</Button>
			</div>
		</Card>
	)
}
