const { log } = require('console');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

function copyFile(src, dest, filter) {
  const copyRecursive = (src, dest) => {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      if (srcPath === dest) {
        continue;
      }

      if (filter && !filter(srcPath, entry)) {
        continue;
      }

      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
  copyRecursive(src, dest);
  console.log(`已复制文件从 ${src} 到 ${dest}`);
}

function resetDistDirectory(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
  fs.mkdirSync(path);
  console.log(`已清理 ${path} 目录`);
}

function buildJsFile(src, dest) {
  const buildJsFileRecursive = (src, dest) => {
    // 匹配 <script ... src="xxx.js">
    const scriptRegex = /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi;
    const entries = fs.readdirSync(dest, { withFileTypes: true });
    const result = new Set();
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const newSrc = path.join(src, entry.name);
        const newDest = path.join(dest, entry.name);
        buildJsFileRecursive(newSrc, newDest);
        continue;
      }

      if (path.extname(entry.name).toLowerCase() !== '.html') {
        continue;
      }

      const htmlPath = path.join(dest, entry.name);
      const content = fs.readFileSync(htmlPath, 'utf-8');
      let match;
      while ((match = scriptRegex.exec(content)) !== null) {
        result.add([
          path.resolve(dest, match[1]),
          path.resolve(src, match[1]),
        ]);
      }

      for (const [destFile, srcFile] of result) {
        esbuild.build({
          entryPoints: [srcFile],
          outfile: destFile,
          bundle: true,
          minify: true,
          sourcemap: false,
          // format: 'iife',
          // globalName: 'DDP2P',
          define: {
            'process.env.NODE_ENV': '"production"',
          },
        }).then(() => {
          console.log(`已构建 ${srcFile} 到 ${destFile}`);
        }).catch((error) => {
          console.error(`构建失败 ${srcFile}:`, error);
        });
      }
    }
  }
  
  buildJsFileRecursive(src, dest);
}

function minimatch(filepath, pattern) {
  const normalizedFilepath = filepath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(normalizedFilepath);
}

function build(src, dest)
{
  try {
    resetDistDirectory(dest);

    const excludePatterns = [
      '*node_modules*',
      '*package.json',
      '*package-lock.json',
      '*.js',
      '*.ts',
    ];
    copyFile(src, dest, (srcPath, entry) => {
      for (const pattern of excludePatterns) {
        if (minimatch(srcPath, pattern)) {
          return false;
        }
      }
      return true;
    });
    buildJsFile(src, dest);
  } catch (error) {
    console.error('构建过程中发生错误:', error);
    process.exit(1);
  }
}

function main() {
  const SRC_DIR = path.resolve(__dirname);
  const DIST_DIR = path.resolve(__dirname, 'dist');
  build(SRC_DIR, DIST_DIR);
}

main();
