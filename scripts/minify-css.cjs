const {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} = require('fs');
const { spawnSync } = require('child_process');
const { dirname, join } = require('path');

const root = join(__dirname, '..');
const stylesPath = join(root, 'styles', 'styles.css');
const minify = process.argv.includes('--minify');

function readList(css, label) {
  const match = css.match(new RegExp(`/\\*\\s*${label}:\\s*([^*]+?)\\*/`));
  return match
    ? match[1].split(',').map((name) => name.trim()).filter(Boolean)
    : [];
}

function resolveImports(css, fileDir, seen = new Set()) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import\s+url\(['"]([^'"]+)['"]\);\s*/g, (full, href) => {
      const nested = href.startsWith('/')
        ? join(root, href.replace(/^\//, ''))
        : join(fileDir, href);
      if (seen.has(nested)) return '';
      if (!existsSync(nested)) {
        // eslint-disable-next-line no-console
        console.warn(`skip missing import ${href}`);
        return '';
      }
      seen.add(nested);
      return `${resolveImports(readFileSync(nested, 'utf8'), dirname(nested), seen)}\n`;
    });
}

function inlineSheet(relPath) {
  const file = join(root, relPath);
  if (!existsSync(file)) {
    // eslint-disable-next-line no-console
    console.warn(`skip missing ${file}`);
    return '';
  }
  const source = resolveImports(readFileSync(file, 'utf8'), dirname(file));
  return `\n/* ===== ${relPath.replace(/\\/g, '/')} ===== */\n${source}\n/* ===== /${relPath.replace(/\\/g, '/')} ===== */\n`;
}

const css = readFileSync(stylesPath, 'utf8');
const styleSheets = readList(css, 'minify-styles');
const blocks = readList(css, 'minify-blocks');

const stylelint = '/* stylelint-disable no-descending-specificity -- concatenated sheets */';
const listComments = [
  `/* minify-styles: ${styleSheets.join(', ')} */`,
  `/* minify-blocks: ${blocks.join(', ')} */`,
].join('\n');

const combined = [
  ...styleSheets.map((name) => inlineSheet(`styles/${name}.css`)),
  ...blocks.map((name) => inlineSheet(`blocks/${name}/${name}.css`)),
].join('');

if (!minify) {
  writeFileSync(stylesPath, `${stylelint}\n${listComments}\n${combined}`);
  process.exit(0);
}

const tmp = join(root, 'styles', '.styles.concat.css');
writeFileSync(tmp, combined);
const result = spawnSync(
  'npx',
  ['lightningcss', '--minify', '-o', stylesPath, tmp],
  { cwd: root, shell: true, stdio: 'inherit' },
);
unlinkSync(tmp);
if (result.status) process.exit(result.status);

writeFileSync(stylesPath, `${stylelint}\n${listComments}\n${readFileSync(stylesPath, 'utf8')}`);
