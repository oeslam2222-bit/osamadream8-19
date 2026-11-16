import { build } from 'esbuild';

await build({
  entryPoints: ['C:/Users/Administrator/AppData/Local/Temp/opencode/test-enrich.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  define: { 'import.meta.env': '{}' },
  tsconfig: 'C:/osamadream8-19-main/tsconfig.json',
  packages: 'external',
  outfile: 'C:/osamadream8-19-main/_tmp_test-enrich.cjs',
  logLevel: 'info'
});
