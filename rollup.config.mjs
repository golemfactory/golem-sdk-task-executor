import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import nodePolyfills from "rollup-plugin-polyfill-node";
import ignore from "rollup-plugin-ignore";
import pkg from "./package.json" assert { type: "json" };
import filesize from "rollup-plugin-filesize";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

/**
 * Looking for plugins?
 *
 * Check: {@link https://github.com/rollup/awesome}
 */

export default [
  // Browser
  {
    input: "src/index.ts",
    output: {
      inlineDynamicImports: true,
      file: pkg.browser,
      name: "TaskExecutor",
      sourcemap: true,
      format: "es",
    },
    plugins: [
      deleteExistingBundles("dist"),
      ignore(["tmp"]),
      alias({
        entries: [{ find: "stream", replacement: "stream-browserify" }],
      }),
      nodeResolve({ browser: true, preferBuiltins: true }),
      commonjs(),
      nodePolyfills(),
      typescript({ tsconfig: "./tsconfig.json", exclude: ["**/*.spec.ts"] }),
      terser(),
      filesize({ reporter: [sizeValidator, "boxen"] }),
    ],
  },
  // NodeJS
  {
    input: "src/index.ts",
    output: [
      { file: pkg.main, format: "cjs", sourcemap: true },
      { file: pkg.module, format: "es", sourcemap: true },
    ],
    plugins: [
      typescript({ tsconfig: "./tsconfig.json", exclude: ["**/*.test.ts"] }),
      filesize({ reporter: [sizeValidator, "boxen"] }),
    ],
  },
];

function deleteExistingBundles(path) {
  return {
    name: "delete-existing-bundles",
    buildStart: () => {
      const distDir = fileURLToPath(new URL(path, import.meta.url).toString());
      if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true });
      }
      console.log("Deleted " + distDir);
    },
  };
}

function sizeValidator(options, bundle, { bundleSize }) {
  if (parseInt(bundleSize) === 0) {
    throw new Error(`Something went wrong while building. Bundle size = ${bundleSize}`);
  }
}
