import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import path from "path"

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	optimizeDeps: {
		exclude: ["@duckdb/duckdb-wasm"],
		esbuildOptions: {
			// Preserve native private class fields (#field) instead of
			// downcompiling them to _field variables, which breaks MapLibre 5.x
			target: "esnext",
		},
	},
	esbuild: {
		target: "esnext",
	},
	build: {
		target: "esnext",
	},
	server: {
		headers: {
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Resource-Policy": "cross-origin",
		},
	},
	worker: {
		format: "es",
	},
})
