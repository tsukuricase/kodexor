#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Writable } from 'stream';

interface Options {
  excludeDirs: string[];
  output?: string;
}

function getOptionsFromArgv(): Options {
  const args = process.argv.slice(2);
  let excludeDirs: string[] = [];
  let output: string | undefined;
  for (const arg of args) {
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
    const rootDir = '.';
  
    let writeStream: Writable;
    if (options.output) {
      writeStream = fs.createWriteStream(options.output);
    } else {
      writeStream = process.stdout; // process.stdout: Writable
    }
  
    for (const { relPath, absPath } of walk(rootDir, '', options.excludeDirs)) {
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
