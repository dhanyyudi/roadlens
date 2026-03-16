import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react(), tailwindcss()],
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
			"Cross-Origin-Embedder-Policy": "credentialless",
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Resource-Policy": "same-origin",
		},
	},
	worker: {
		format: "es",
	},
})
