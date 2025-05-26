import webpack from 'webpack';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

type Compiler = webpack.Compiler;
type Compilation = webpack.Compilation;
type Module = webpack.Module;

interface DependencyInfo {
    file: string;
    dependencies: string[];
    usedBy: string[];
}

interface PluginOptions {
    ignorePatterns?: string[];  // 忽略的文件/目录模式
}

class HotDependencyTrackerPlugin {
    private dependencies: Map<string, DependencyInfo> = new Map();
    private options: PluginOptions;

    /**
     * HotDependencyTrackerPlugin 构造函数
     * @param options 插件配置选项
     */
    constructor(options: PluginOptions = {}) {
        this.options = {
            ignorePatterns: options.ignorePatterns || []
        };
    }

    /**
     * 应用插件到 Webpack 编译器
     * @param compiler Webpack 编译器实例
     */
    apply(compiler: Compiler) {
        // 使用 afterCompile 钩子，这个钩子在每次编译后触发
        compiler.hooks.afterCompile.tap('HotDependencyTrackerPlugin', (compilation: Compilation) => {
            // 遍历所有模块
            compilation.modules.forEach((module: Module) => {
                const modulePath = (module as any).resource;
                if (!modulePath) return;
                if (this.shouldIgnore(modulePath)) return;

                // 收集依赖信息
                const dependencyInfo: DependencyInfo = {
                    file: modulePath,
                    dependencies: this.extractDependencies(module, compilation),
                    usedBy: this.extractUsedBy(module, compilation)
                };

                this.dependencies.set(modulePath, dependencyInfo);
            });

            // 在开发模式下，将依赖信息写入文件
            if (compiler.options.mode === 'development') {
                const outputPath = path.resolve(process.cwd(), 'dependency-info.json');
                const outputData = JSON.stringify(Object.fromEntries(this.dependencies), null, 2);
                fs.writeFileSync(outputPath, outputData);
            }
        });
    }

    /**
     * 记录错误信息到日志文件
     * @param error 错误对象或消息
     * @param context 错误发生的上下文描述
     */
    private logError(error: any, context: string) {
        const errorLogPath = path.resolve(process.cwd(), 'dependency-tracker-error.log');
        const timestamp = new Date().toISOString();
        const errorMessage = `[${timestamp}] ${context}: ${error.message || error}\n`;

        fs.appendFileSync(errorLogPath, errorMessage);
    }

    /**
     * 判断给定的文件路径是否应该被忽略
     * @param filePath 要检查的文件路径
     * @returns 如果应该忽略则返回 true，否则返回 false
     */
    private shouldIgnore(filePath: string): boolean {
        const ignored = !!(this.options.ignorePatterns && this.options.ignorePatterns.some(pattern => minimatch(filePath, pattern)));
        console.log(`Checking path: ${filePath}, Ignored: ${ignored}`);
        return ignored;
    }

    /**
     * 提取模块的依赖文件路径
     * @param module Webpack 模块实例
     * @param compilation Webpack 编译实例
     * @returns 模块依赖的文件路径数组
     */
    private extractDependencies(module: Module, compilation: Compilation): string[] {
        try {
            const dependencies: string[] = [];

            // 使用 webpack 5 的 moduleGraph API
            if (compilation.moduleGraph) {
                const moduleGraph = compilation.moduleGraph;
                const connections = moduleGraph.getOutgoingConnections(module);

                for (const connection of connections) {
                    const depModule = connection.module;
                    if (depModule && (depModule as any).resource) {
                        const depPath = (depModule as any).resource;
                        if (!this.shouldIgnore(depPath)) {
                            dependencies.push(depPath);
                        }
                    }
                }
            }

            return [...new Set(dependencies)];
        } catch (error) {
            this.logError(error, 'Error extracting dependencies');
            return [];
        }
    }

    /**
     * 提取依赖于当前模块的文件路径
     * @param module Webpack 模块实例
     * @param compilation Webpack 编译实例
     * @returns 依赖于当前模块的文件路径数组
     */
    private extractUsedBy(module: Module, compilation: Compilation): string[] {
        try {
            const usedBy: string[] = [];

            if (compilation.moduleGraph) {
                const moduleGraph = compilation.moduleGraph;
                const incomingConnections = moduleGraph.getIncomingConnections(module);

                for (const connection of incomingConnections) {
                    const originModule = connection.originModule;
                    if (originModule && (originModule as any).resource) {
                        const originPath = (originModule as any).resource;
                        if (!this.shouldIgnore(originPath)) {
                            usedBy.push(originPath);
                        }
                    }
                }
            }

            return [...new Set(usedBy)];
        } catch (error) {
            this.logError(error, 'Error extracting used by');
            return [];
        }
    }

    /**
     * 获取当前收集的所有依赖信息
     * @returns 包含依赖信息的 Map
     */
    getDependencies(): Map<string, DependencyInfo> {
        return this.dependencies;
    }
}

export default HotDependencyTrackerPlugin;
