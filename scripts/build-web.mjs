import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const outDir = path.join(rootDir, 'www');

const FILES_TO_COPY = [
  'index.html',
  'design-tokens.css',
  'ledger-core.js',
  'google-drive-config.js',
  'google-drive-backup.js',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg',
  'codex-clipboard-fc4981cf-e1ef-4c4f-b420-d57eb681c6e9.png',
  'version.json'
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of FILES_TO_COPY) {
  const src = path.join(rootDir, file);
  const dest = path.join(outDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

const jspdfSrc = path.join(rootDir, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js');
if (fs.existsSync(jspdfSrc)) {
  fs.copyFileSync(jspdfSrc, path.join(outDir, 'jspdf.umd.min.js'));
}

console.log(`Built web bundle into ${outDir} (${FILES_TO_COPY.length} core files + jspdf checked).`);
