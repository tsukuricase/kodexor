#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Writable } from 'stream';
import os from 'os';
import { cosmiconfigSync } from 'cosmiconfig';

// cosmiconfig 支持多层级 config
const explorer = cosmiconfigSync('kodexor');

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

interface KodexorConfig {
    exclude?: string[];
    output?: string;
    // 可扩展更多配置
}

interface Options {
    excludeDirs: string[];
    output?: string;
}

function parseArgv(): Partial<Options> | 'help' | 'version' {
    const args = process.argv.slice(2);
    let excludeDirs: string[] | undefined;
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

// 合并命令行参数、项目配置、用户全局配置（优先级从高到低）
function loadMergedConfig(): KodexorConfig | 'help' | 'version' {
    // 1. 用户目录配置 ~/.kodexorrc (json)
    const userRcPath = path.join(os.homedir(), '.kodexorrc');
    let userConfig: KodexorConfig = {};
    if (fs.existsSync(userRcPath)) {
        try {
            userConfig = JSON.parse(fs.readFileSync(userRcPath, 'utf8'));
        } catch (e) {
            console.warn(`[kodexor] Malformed ~/.kodexorrc:`, e);
        }
    }

    // 2. 项目内配置
    let projectConfig: KodexorConfig = {};
    try {
        const result = explorer.search();
        if (result && result.config) {
            projectConfig = result.config;
        }
    } catch (e) {
        // do nothing
    }

    // 3. 命令行参数
    let cliConfig = parseArgv();
    if (cliConfig === 'help' || cliConfig === 'version') return cliConfig;

    // 合并优先级 CLI > project > user
    return {
        exclude: cliConfig.excludeDirs ?? projectConfig.exclude ?? userConfig.exclude ?? [],
        output: cliConfig.output ?? projectConfig.output ?? userConfig.output
    };
}

function isExcluded(relPath: string, excludeList: string[]): boolean {
    const excluded = excludeList.some(ex => {
        const matches = relPath === ex || 
                        relPath.startsWith(ex + path.sep) || 
                        path.basename(relPath) === ex;
        return matches;
    });
    return excluded;
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
    const config = loadMergedConfig();
    if (config === 'help') { printHelp(); process.exit(0); }
    if (config === 'version') { printVersion(); process.exit(0); }

    let excludeDirs = config.exclude ? [...config.exclude] : [];
    const outputFile = config.output;
    const rootDir = '.';

    // 避免导出包含自身
    if (outputFile) {
        if (!excludeDirs.includes(outputFile)) excludeDirs.push(outputFile);
        const outputBase = path.basename(outputFile);
        if (!excludeDirs.includes(outputBase)) excludeDirs.push(outputBase);
    }

    let writeStream: Writable = outputFile
        ? fs.createWriteStream(outputFile)
        : process.stdout;

    for (const { relPath, absPath } of walk(rootDir, '', excludeDirs)) {
        const code = fs.readFileSync(absPath, 'utf8');
        writeStream.write(`\n==== FILE: ${relPath} ====\n`);
        writeStream.write(code + '\n');
        writeStream.write(`==== END FILE ====\n`);
    }
    if (writeStream !== process.stdout) (writeStream as fs.WriteStream).end();
}

main();
