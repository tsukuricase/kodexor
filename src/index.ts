#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Writable } from 'stream';
import os from 'os';
import { cosmiconfigSync } from 'cosmiconfig';

const explorer = cosmiconfigSync('kodexor');

const PKG_PATH = path.resolve(__dirname, '../package.json');

function printHelp() {
    console.log(`
kodexor - Export your project source files into a markdown file for AI analysis.

Usage:
  kodexor [--exclude=dir1,dir2] [--output=output.md]
Options:
  --exclude=dir1,dir2     Comma-separated list of directories/files to exclude
  --output=output.md      Output file path (default: stdout)
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
}

interface Options {
    excludeDirs: string[];
    output?: string;
}

interface OutputFile {
    relPath: string;    // 相对于根目录的路径
    ok: boolean;
    error?: string;
    content?: string;
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

function loadMergedConfig(): KodexorConfig | 'help' | 'version' {
    const userRcPath = path.join(os.homedir(), '.kodexorrc');
    let userConfig: KodexorConfig = {};
    if (fs.existsSync(userRcPath)) {
        try {
            userConfig = JSON.parse(fs.readFileSync(userRcPath, 'utf8'));
        } catch (e) {
            console.warn(`[kodexor] Malformed ~/.kodexorrc:`, e);
        }
    }

    let projectConfig: KodexorConfig = {};
    try {
        const result = explorer.search();
        if (result && result.config) {
            projectConfig = result.config;
        }
    } catch (e) {}

    let cliConfig = parseArgv();
    if (cliConfig === 'help' || cliConfig === 'version') return cliConfig;

    return {
        exclude: cliConfig.excludeDirs ?? projectConfig.exclude ?? userConfig.exclude ?? [],
        output: cliConfig.output ?? projectConfig.output ?? userConfig.output
    };
}

function isExcluded(relPath: string, excludeList: string[]): boolean {
    return excludeList.some(ex =>
        relPath === ex ||
        relPath.startsWith(ex + path.sep) ||
        path.basename(relPath) === ex
    );
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

function guessCodeLang(filename: string): string {
    const ext = path.extname(filename).replace(/^\./, '');
    // 一些常用文件名
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.ts')) return 'ts';
    if (filename.endsWith('.js')) return 'js';
    if (filename.endsWith('.md')) return 'md';
    if (filename.endsWith('.sh')) return 'bash';
    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) return 'yaml';
    return '';
}

function buildTree(files: OutputFile[]) {
    // 构建树结构
    type TreeNode = {
        name: string;
        ok?: boolean;
        children?: Map<string, TreeNode>;
        relPath?: string;
    };
    const root: TreeNode = { name: '' };

    for (const f of files) {
        const parts = f.relPath.split(path.sep);
        let cur = root;
        let partial: string[] = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            partial.push(part);
            if (!cur.children) cur.children = new Map();
            if (!cur.children.has(part)) {
                cur.children.set(part, {
                    name: part,
                });
            }
            cur = cur.children.get(part)!;
            // 最后一层放 relPath/ok
            if (i === parts.length - 1) {
                cur.relPath = f.relPath;
                cur.ok = f.ok;
            }
        }
    }
    return root;
}

function printTree(
    node: ReturnType<typeof buildTree>,
    prefix: string = '',
    isLast: boolean = true
): string {
    let output = '';
    // 跳过根节点空名
    const entries = node.children ? Array.from(node.children.values()) : [];
    entries.forEach((child, idx) => {
        const isLastChild = idx === entries.length - 1;
        const branch = isLastChild ? '└── ' : '├── ';
        let line = prefix + branch + child.name;
        if (child.relPath) line += ' ' + (child.ok ? '✅成功' : '❌失败');
        output += line + '\n';
        if (child.children && child.children.size > 0) {
            output += printTree(
                child,
                prefix + (isLastChild ? '    ' : '│   '),
                isLastChild
            );
        }
    });
    return output;
}

function main() {
    const config = loadMergedConfig();
    if (config === 'help') { printHelp(); process.exit(0); }
    if (config === 'version') { printVersion(); process.exit(0); }

    let excludeDirs = config.exclude ? [...config.exclude] : [];
    const outputFile = config.output || 'kodexor-export.md';
    const rootDir = '.';

    // 避免导出包含自身
    if (outputFile) {
        if (!excludeDirs.includes(outputFile)) excludeDirs.push(outputFile);
        const outputBase = path.basename(outputFile);
        if (!excludeDirs.includes(outputBase)) excludeDirs.push(outputBase);
    }

    // 获取项目名
    let projectName = 'Project';
    try {
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        projectName = pkg.name || 'Project';
    } catch {}

    // 收集导出的文件列表
    const files: Array<{
        relPath: string;
        ok: boolean;
        error?: string;
        content?: string;
    }> = [];

    for (const { relPath, absPath } of walk(rootDir, '', excludeDirs)) {
        try {
            const code = fs.readFileSync(absPath, 'utf8');
            files.push({ relPath, ok: true, content: code });
        } catch (e: any) {
            files.push({ relPath, ok: false, error: e?.toString() || 'Unknown error' });
        }
    }

    // 构造 markdown 内容
    let md = `# ${projectName}\n\n`;

    for (const file of files) {
        md += `## ${file.relPath}\n`;
        const lang = file.ok ? guessCodeLang(file.relPath) : '';
        md += '```' + lang + '\n';
        md += file.ok ? (file.content ?? '').replace(/```/g, '``\u200b`') : (file.error || '读取失败');
        md += '\n```\n\n';
    }

    // 总结导出情况
    md += `# 文件输出情况 (tree 结构)\n`;
    md += '```\n';
    md += printTree(buildTree(files));
    md += '```\n';

    fs.writeFileSync(outputFile, md, 'utf8');
    console.log(`[kodexor] 导出完毕 => ${outputFile}`);
}

main();
