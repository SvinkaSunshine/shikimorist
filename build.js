const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const SHARED = [
  'background.js',
  'content_script.js',
  'popup.html',
  'popup.js',
  'icons',
];

function pack(name, outFile) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(DIST, { recursive: true });

    const output  = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`  -> ${outFile} (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on('error', reject);
    archive.pipe(output);

    // manifest
    archive.file(path.join(SRC, `manifest.${name}.json`), { name: 'manifest.json' });

    // ua_rules for Chrome only
    if (name === 'chrome') {
      archive.file(path.join(SRC, 'ua_rules.json'), { name: 'ua_rules.json' });
    }

    // shared files
    for (const f of SHARED) {
      const from = path.join(SRC, f);
      if (!fs.existsSync(from)) { console.warn(`  WARNING: not found: ${from}`); continue; }
      if (fs.statSync(from).isDirectory()) {
        archive.directory(from, f);
      } else {
        archive.file(from, { name: f });
      }
    }

    archive.finalize();
  });
}

async function main() {
  const targets = process.argv[2]
    ? [process.argv[2]]
    : ['firefox', 'chrome'];

  for (const name of targets) {
    const ext  = name === 'firefox' ? 'xpi' : 'zip';
    const out  = path.join(DIST, `shikimorist-${name}.${ext}`);
    console.log(`Building ${name}...`);
    await pack(name, out);
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });