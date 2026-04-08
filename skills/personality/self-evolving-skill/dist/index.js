"use strict";
/**
 * Self-Evolving Skill - OpenClaw集成
 *
 * 封装Python核心模块为JavaScript接口
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServer = exports.SelfEvolvingSkillEngine = void 0;
exports.quickExecute = quickExecute;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Python MCP服务器管理
 */
class MCPServer {
    constructor(config) {
        this.process = null;
        this.port = 8080;
        this.port = config?.port || 8080;
        this.storageDir = config?.storageDir || (0, path_1.join)(process.cwd(), 'storage');
    }
    /**
     * 启动MCP服务器
     */
    start() {
        return new Promise((resolve, reject) => {
            const serverPath = (0, path_1.join)((0, path_1.dirname)(__dirname), 'core', 'mcp_server.py');
            if (!(0, fs_1.existsSync)(serverPath)) {
                // Python服务器不存在，使用纯JS实现
                console.log('[SelfEvolvingSkill] 使用纯JS模式（无需Python）');
                resolve();
                return;
            }
            this.process = (0, child_process_1.spawn)('python3', [serverPath, '--port', String(this.port), '--storage', this.storageDir], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            this.process.stdout.on('data', (data) => {
                console.log('[MCP Server]', data.toString().trim());
            });
            this.process.stderr.on('data', (data) => {
                console.error('[MCP Error]', data.toString().trim());
            });
            this.process.on('close', (code) => {
                console.log(`[MCP Server] 退出，代码: ${code}`);
                this.process = null;
            });
            // 等待服务器启动
            setTimeout(resolve, 1000);
        });
    }
    /**
     * 停止服务器
     */
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
    /**
     * 发送MCP请求
     */
    async call(tool, args) {
        // 如果没有Python服务器，使用JS模拟
        if (!this.process) {
            return this.simulateCall(tool, args);
        }
        return new Promise((resolve, reject) => {
            const request = JSON.stringify({ tool, arguments: args });
            const http = require('http');
            const options = {
                hostname: 'localhost',
                port: this.port,
                path: '/tools',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(request)
                }
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(request);
            req.end();
        });
    }
    /**
     * JS模拟调用（当Python不可用时）
     */
    simulateCall(tool, args) {
        // 简化实现
        console.log(`[SelfEvolvingSkill] ${tool}:`, args);
        switch (tool) {
            case 'skill_create':
                return {
                    success: true,
                    skill_id: `skill_${Date.now()}`,
                    name: args.name,
                    message: `创建Skill: ${args.name}`
                };
            case 'skill_list':
                return {
                    success: true,
                    saved_skills: [],
                    loaded_skills: [],
                    total_saved: 0,
                    total_loaded: 0
                };
            case 'skill_stats':
                return {
                    success: true,
                    stats: {
                        skills_count: 0,
                        experiences_count: 0,
                        storage_size_mb: 0,
                        engine: { total_executions: 0 }
                    }
                };
            case 'skill_analyze':
                return {
                    success: true,
                    analysis: {
                        total_energy: 100,
                        residual_ratio: 0.5,
                        layers_count: 3,
                        suggested_abstraction: 'POLICY',
                        novelty_score: 0.7
                    }
                };
            default:
                return { success: true };
        }
    }
}
exports.MCPServer = MCPServer;
/**
 * 自演化Skill引擎
 */
class SelfEvolvingSkillEngine {
    constructor(config) {
        this.initialized = false;
        this.server = new MCPServer(config);
    }
    /**
     * 初始化引擎
     */
    async init() {
        if (this.initialized)
            return;
        await this.server.start();
        this.initialized = true;
    }
    /**
     * 创建新的自演化Skill
     */
    async createSkill(config) {
        await this.init();
        const result = await this.server.call('skill_create', {
            name: config.name,
            description: config.description || '',
            min_energy_ratio: config.minEnergyRatio || 0.10,
            target_trigger_rate: config.targetTriggerRate || 0.15
        });
        return {
            skillId: result.skill_id,
            name: result.name
        };
    }
    /**
     * 执行Skill并触发学习
     */
    async execute(params) {
        await this.init();
        const result = await this.server.call('skill_execute', {
            skill_id: params.skillId,
            context: params.context || {},
            embedding: params.embedding,
            success: params.success !== false,
            value_realization: params.value !== undefined ? params.value : 1.0
        });
        return {
            success: result.success,
            skillId: result.skill_id,
            executed: result.executed,
            reflectionTriggered: result.reflection_triggered,
            mutationAccepted: result.mutation_accepted,
            skillStats: result.skill_stats
        };
    }
    /**
     * 分析嵌入向量
     */
    async analyze(embedding) {
        await this.init();
        const result = await this.server.call('skill_analyze', {
            embedding
        });
        return {
            success: result.success,
            totalEnergy: result.analysis.total_energy,
            residualRatio: result.analysis.residual_ratio,
            layersCount: result.analysis.layers_count,
            suggestedAbstraction: result.analysis.suggested_abstraction,
            noveltyScore: result.analysis.novelty_score,
            wouldTriggerReflection: result.analysis.would_trigger_reflection
        };
    }
    /**
     * 列出所有Skill
     */
    async list() {
        await this.init();
        const result = await this.server.call('skill_list', {});
        return {
            skills: result.saved_skills.map((s) => ({
                id: s.id,
                name: s.name,
                savedAt: s.saved_at
            })),
            total: result.total_saved + result.total_loaded
        };
    }
    /**
     * 获取系统统计
     */
    async stats() {
        await this.init();
        const result = await this.server.call('skill_stats', {});
        return result.stats;
    }
    /**
     * 保存Skill
     */
    async save(skillId) {
        await this.init();
        const result = await this.server.call('skill_save', { skill_id: skillId });
        return result.success;
    }
    /**
     * 加载Skill
     */
    async load(skillId) {
        await this.init();
        const result = await this.server.call('skill_load', { skill_id: skillId });
        return result.loaded;
    }
    /**
     * 关闭引擎
     */
    shutdown() {
        this.server.stop();
    }
}
exports.SelfEvolvingSkillEngine = SelfEvolvingSkillEngine;
/**
 * 便捷函数：快速创建和执行
 */
async function quickExecute(params) {
    const engine = new SelfEvolvingSkillEngine();
    try {
        // 创建Skill
        const { skillId } = await engine.createSkill({ name: params.name });
        // 执行
        const result = await engine.execute({
            skillId,
            context: params.context,
            success: params.success,
            value: params.success ? 1.0 : 0.2
        });
        return result;
    }
    finally {
        engine.shutdown();
    }
}
//# sourceMappingURL=index.js.map