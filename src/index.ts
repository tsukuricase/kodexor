#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Writable } from 'stream';

const PKG_PATH = path.resolve(__dirname, '../package.json');

function printHelp() {
  console.log(`
kodexor - Export your project source files into a single text file for AI analysis.

Usage:
  kodexor [--exclude=dir1,dir2] [--output=output.txt]

Options:
  --exclude=dir1,dir2     Comma-separated list of directories to exclude
  --output=output.txt     Output file path (default: stdout)
  -h, --help              Show help
  -v, --version           Print version
`);
}

function printVersion() {
  if (fs.existsSync(PKG_PATH)) {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    console.log(pkg.version || 'unknown');
  } else {
    console.log('unknown');
  }
}

interface Options {
  excludeDirs: string[];
  output?: string;
}

function getOptionsFromArgv(): Options | 'help' | 'version' {
  const args = process.argv.slice(2);
  let excludeDirs: string[] = [];
  let output: string | undefined;
  for (const arg of args) {
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '-v' || arg === '--version') return 'version';
    if (arg.startsWith('--exclude=')) {
      excludeDirs = arg.replace('--exclude=', '').split(',').filter(Boolean);
    }
    if (arg.startsWith('--output=')) {
      output = arg.replace('--output=', '').trim();
    }
  }
  return { excludeDirs, output };
}

function isExcluded(relPath: string, excludeDirs: string[]): boolean {
  return excludeDirs.some(dir => relPath.split(path.sep).includes(dir));
}

function* walk(dir: string, parentRel = '', excludeDirs: string[] = []): Generator<{ relPath: string, absPath: string }> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = path.join(parentRel, entry.name);
    if (isExcluded(relPath, excludeDirs)) continue;
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(absPath, relPath, excludeDirs);
    } else if (entry.isFile()) {
      yield { relPath, absPath };
    }
  }
}

function main() {
  const options = getOptionsFromArgv();
  if (options === 'help') {
    printHelp();
    process.exit(0);
  }
  if (options === 'version') {
    printVersion();
    process.exit(0);
  }
  // 业务主流程
  const opts = options as Options;
  const rootDir = '.';

  let writeStream: Writable;
  if (opts.output) {
    writeStream = fs.createWriteStream(opts.output);
  } else {
    writeStream = process.stdout;
  }

  for (const { relPath, absPath } of walk(rootDir, '', opts.excludeDirs)) {
    const code = fs.readFileSync(absPath, 'utf8');
    writeStream.write(`\n==== FILE: ${relPath} ====\n`);
    writeStream.write(code + '\n');
    writeStream.write(`==== END FILE ====\n`);
  }
  if (writeStream !== process.stdout) {
    (writeStream as fs.WriteStream).end();
  }
}

main();
