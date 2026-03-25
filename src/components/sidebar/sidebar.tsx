import { useUIStore, type SidebarTab } from "../../stores/ui-store"
import { FilePanel } from "./file-panel"
import { InspectPanel } from "./inspect-panel"
import { EditPanel } from "./edit-panel"
import { SearchPanel } from "./search-panel"
import { RoutingPanel } from "./routing-panel"
import { SpeedPanel } from "./speed-panel"
import { LayersPanel } from "./layers-panel"
import { ExportPanel } from "./export-panel"
import { AIQueryPanel } from "./ai-query-panel"
import { OverlayPanel } from "./overlay-panel"
import { useIsMobile } from "../../hooks/use-media-query"
import { BottomSheet } from "../ui/bottom-sheet"
import {
	FileText,
	Search,
	Eye,
	Edit3,
	Navigation,
	Gauge,
	Layers,
	Download,
	PanelLeftClose,
	PanelLeft,
	Sparkles,
	Menu,
	MapPinPlus,
} from "lucide-react"

const MAIN_TABS: Array<{ id: SidebarTab; label: string; icon: typeof FileText }> = [
	{ id: "file", label: "File", icon: FileText },
	{ id: "overlay", label: "Overlay", icon: MapPinPlus },
	{ id: "search", label: "Search", icon: Search },
	{ id: "inspect", label: "Inspect", icon: Eye },
	{ id: "edit", label: "Edit", icon: Edit3 },
	{ id: "routing", label: "Route", icon: Navigation },
	{ id: "speed", label: "Speed", icon: Gauge },
	{ id: "layers", label: "Layers", icon: Layers },
	{ id: "export", label: "Export", icon: Download },
]

const PANELS: Record<SidebarTab, () => React.JSX.Element> = {
	file: FilePanel,
	overlay: OverlayPanel,
	search: SearchPanel,
	inspect: InspectPanel,
	edit: EditPanel,
	routing: RoutingPanel,
	speed: SpeedPanel,
	layers: LayersPanel,
	export: ExportPanel,
	ai: AIQueryPanel,
}

function IconRail({
	activeTab,
	onTabChange,
	toggleSidebar,
	sidebarOpen,
}: {
	activeTab: SidebarTab
	onTabChange: (tab: SidebarTab) => void
	toggleSidebar: () => void
	sidebarOpen: boolean
}) {
	return (
		<div className="flex w-11 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
			<button
				onClick={toggleSidebar}
				className="p-2.5 text-zinc-400 hover:text-zinc-200 border-b border-zinc-800 transition-colors"
				aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
			>
				{sidebarOpen ? (
					<PanelLeftClose className="h-4.5 w-4.5" />
				) : (
					<PanelLeft className="h-4.5 w-4.5" />
				)}
			</button>

			{/* AI Tab - Highlighted at top */}
			<button
				onClick={() => onTabChange("ai")}
				className={`p-2.5 transition-colors border-b border-zinc-800 ${
					activeTab === "ai"
						? "text-purple-400 bg-purple-500/20"
						: "text-zinc-400 hover:text-purple-300 hover:bg-purple-500/10"
				}`}
				title="AI Query"
			>
				<Sparkles className="h-4 w-4 mx-auto" />
			</button>

			{/* Divider */}
			<div className="border-b border-zinc-800 my-1" />

			{/* Main tabs */}
			<div className="flex-1 overflow-y-auto">
				{MAIN_TABS.map(({ id, label, icon: Icon }) => (
					<button
						key={id}
						onClick={() => onTabChange(id)}
						className={`w-full p-2.5 transition-colors ${
							activeTab === id
								? "text-blue-400 bg-zinc-800/80"
								: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
						}`}
						title={label}
					>
						<Icon className="h-4 w-4 mx-auto" />
					</button>
				))}
			</div>
		</div>
	)
}

function PanelContent({ activeTab }: { activeTab: SidebarTab }) {
	const PanelComponent = PANELS[activeTab]
	const tabLabel =
		activeTab === "ai"
			? "AI Query"
			: MAIN_TABS.find((t) => t.id === activeTab)?.label

	return (
		<div className="flex h-full flex-col bg-zinc-900">
			<div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
					{tabLabel}
				</span>
				<span className="text-[10px] text-zinc-600">OSMRoad</span>
			</div>
			<div className="flex-1 overflow-hidden">
				<PanelComponent />
			</div>
		</div>
	)
}

function MobileSidebar({
	activeTab,
	onTabChange,
	isOpen,
	onClose,
}: {
	activeTab: SidebarTab
	onTabChange: (tab: SidebarTab) => void
	isOpen: boolean
	onClose: () => void
}) {
	return (
		<BottomSheet
			isOpen={isOpen}
			onClose={onClose}
			title={activeTab === "ai" ? "AI Query" : MAIN_TABS.find((t) => t.id === activeTab)?.label}
			snapPoints={[40, 70, 92]}
			initialSnap={0}
		>
			<div className="flex flex-col h-full">
				{/* Tab selector for mobile */}
				<div className="flex overflow-x-auto border-b border-zinc-800 p-2 gap-1 scrollbar-hide">
					<button
						onClick={() => onTabChange("ai")}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
							activeTab === "ai"
								? "bg-purple-500/20 text-purple-400"
								: "bg-zinc-800 text-zinc-400"
						}`}
					>
						<Sparkles className="h-3 w-3" />
						AI Query
					</button>
					{MAIN_TABS.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							onClick={() => onTabChange(id)}
							className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
								activeTab === id
									? "bg-blue-500/20 text-blue-400"
									: "bg-zinc-800 text-zinc-400"
							}`}
						>
							<Icon className="h-3 w-3" />
							{label}
						</button>
					))}
				</div>

				{/* Panel content */}
				<div className="flex-1 overflow-y-auto">
					<PanelContent activeTab={activeTab} />
				</div>
			</div>
		</BottomSheet>
	)
}

export function Sidebar() {
	const { activeTab, sidebarOpen, setActiveTab, toggleSidebar, mobilePanelOpen, setMobilePanelOpen } = useUIStore()
	const isMobile = useIsMobile()

	// Mobile layout
	if (isMobile) {
		return (
			<>
				{/* Floating menu button */}
				<button
					onClick={() => setMobilePanelOpen(true)}
					className="fixed top-4 left-4 z-40 p-2.5 rounded-full bg-zinc-900/90 backdrop-blur border border-zinc-700 text-zinc-300 shadow-lg hover:bg-zinc-800 transition-colors"
					aria-label="Open menu"
				>
					<Menu className="h-5 w-5" />
				</button>

				{/* Mobile bottom sheet */}
				<MobileSidebar
					activeTab={activeTab}
					onTabChange={setActiveTab}
					isOpen={mobilePanelOpen}
					onClose={() => setMobilePanelOpen(false)}
				/>
			</>
		)
	}

	// Desktop: Collapsed state (icon rail only)
	if (!sidebarOpen) {
		return (
			<div className="absolute left-0 top-0 bottom-0 z-10 flex flex-col bg-zinc-900/95 backdrop-blur border-r border-zinc-800">
				<IconRail
					activeTab={activeTab}
					onTabChange={(tab) => {
						setActiveTab(tab)
						toggleSidebar()
					}}
					toggleSidebar={toggleSidebar}
					sidebarOpen={sidebarOpen}
				/>
			</div>
		)
	}

	// Desktop: Expanded state
	return (
		<div className="flex h-full">
			<IconRail
				activeTab={activeTab}
				onTabChange={setActiveTab}
				toggleSidebar={toggleSidebar}
				sidebarOpen={sidebarOpen}
			/>
			<div className="flex w-72 shrink-0 flex-col">
				<PanelContent activeTab={activeTab} />
			</div>
		</div>
	)
}
