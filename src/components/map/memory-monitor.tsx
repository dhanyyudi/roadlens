import { useEffect, useState } from "react"
import { AlertTriangle, X } from "lucide-react"

interface MemoryInfo {
	usedJSHeapSize: number
	totalJSHeapSize: number
	jsHeapSizeLimit: number
}

export function MemoryMonitor() {
	const [memory, setMemory] = useState<MemoryInfo | null>(null)
	const [showWarning, setShowWarning] = useState(false)
	const [dismissed, setDismissed] = useState(false)

	useEffect(() => {
		// Check if performance.memory is available (Chrome only)
		const perf = performance as any
		if (!perf.memory) return

		const checkMemory = () => {
			const mem = perf.memory
			const info: MemoryInfo = {
				usedJSHeapSize: mem.usedJSHeapSize,
				totalJSHeapSize: mem.totalJSHeapSize,
				jsHeapSizeLimit: mem.jsHeapSizeLimit,
			}
			setMemory(info)

			// Show warning if using > 80% of heap limit
			const usagePercent = info.usedJSHeapSize / info.jsHeapSizeLimit
			if (usagePercent > 0.8 && !dismissed) {
				setShowWarning(true)
			}
		}

		// Check every 10 seconds
		const interval = setInterval(checkMemory, 10000)
		checkMemory() // Initial check

		return () => clearInterval(interval)
	}, [dismissed])

	if (!showWarning || !memory) return null

	const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024)
	const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
	const percent = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)

	return (
		<div
			style={{
				position: "absolute",
				bottom: "20px",
				right: "20px",
				zIndex: 1000,
				backgroundColor: "rgba(239, 68, 68, 0.95)",
				border: "1px solid rgba(248, 113, 113, 0.5)",
				borderRadius: "8px",
				padding: "12px 16px",
				maxWidth: "320px",
				boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
			}}
		>
			<div className="flex items-start gap-3">
				<AlertTriangle className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
				<div className="flex-1">
					<div className="text-sm font-medium text-white">
						Memory Usage High
					</div>
					<div className="text-xs text-red-100 mt-1">
						Using {usedMB}MB of {limitMB}MB ({percent}%)
					</div>
					<div className="text-xs text-red-200 mt-2">
						Web may crash soon. Consider refreshing the page or loading a smaller file.
					</div>
				</div>
				<button
					onClick={() => {
						setShowWarning(false)
						setDismissed(true)
					}}
					className="text-red-200 hover:text-white transition-colors"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
		</div>
	)
}
