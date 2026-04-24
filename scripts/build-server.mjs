#!/usr/bin/env node
/**
 * Custom esbuild script for server bundle.
 * Outputs CJS format to support dynamic require() in bundled deps.
 */
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['server/_core/index.ts'],
  platform: 'node',
  bundle: true,
  format: 'cjs',
  outfile: 'dist/index.cjs',
  external: [
    'express',
    'drizzle-orm',
    'drizzle-orm/*',
    'mysql2',
    'mysql2/*',
    'dotenv',
    '@trpc/server',
    '@trpc/server/*',
    'superjson',
    'zod',
    'vite',
    'vite/*',
  ],
  plugins: [
    {
      name: 'exclude-vite-config',
      setup(build) {
        build.onResolve({ filter: /vite\.config/ }, (args) => ({
          path: args.path,
          namespace: 'vite-config-stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'vite-config-stub' }, () => ({
          contents: 'module.exports = {};',
          loader: 'js',
        }));
      },
    },
  ],
});

console.log('✅ Server bundle built successfully');
