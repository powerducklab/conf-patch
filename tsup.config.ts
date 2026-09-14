import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "node18",
  minify: "terser",
  terserOptions: {
    ecma: 2020,
    compress: {
      drop_debugger: true,
    },
    mangle: {
      toplevel: true,
      keep_classnames: true,
      keep_fnames: true,
    },
    format: {
      comments: false,
    },
  },
});
