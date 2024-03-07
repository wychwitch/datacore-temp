import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";

import inlineWorkerPlugin from "esbuild-plugin-inline-worker";

// Build the primary javascript file.
async function build(prod) {
	fs.mkdirSync("build/plugin", { recursive: true });

	const result = await esbuild.build({
		banner: {
			js: `/* Datacore: Autogenerated ESBuild file. See https://github.com/blacksmithgu/datacore for source. */`,
		},
		entryPoints: ['src/main.ts'],
		bundle: true,
		metafile: true,
		plugins: [ inlineWorkerPlugin({ workerName: "Datacore Indexer" }) ],
		external: [
			'obsidian',
			'electron',
			'@codemirror/autocomplete',
			'@codemirror/collab',
			'@codemirror/commands',
			'@codemirror/language',
			'@codemirror/lint',
			'@codemirror/search',
			'@codemirror/state',
			'@codemirror/view',
			'@lezer/common',
			'@lezer/highlight',
			'@lezer/lr',
			"pdfjs-dist",
			...builtins],
			alias: {
				"react": "preact/compat"
			},
		format: 'cjs',
		target: 'es2018',
		logLevel: "info",
		sourcemap: prod ? false : 'inline',
		treeShaking: true,
		alias: {
			react: "preact/compat",
			"react-dom": "preact/compat"
		},
		outfile: 'build/plugin/main.js',
	}).catch(() => process.exit(1));

	// Copy the manifest and styles.
	fs.copyFileSync("manifest.json", "build/plugin/manifest.json");
	fs.copyFileSync("styles.css", "build/plugin/styles.css");
	fs.writeFileSync("build/meta.json", JSON.stringify(result.metafile));
}

// Run the build.
build(process.argv[2] === 'production');