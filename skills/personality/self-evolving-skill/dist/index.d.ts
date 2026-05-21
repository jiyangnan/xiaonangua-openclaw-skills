/**
 * Self-Evolving Skill - OpenClaw集成
 *
 * 封装Python核心模块为JavaScript接口
 */
interface SkillConfig {
    name: string;
    description?: string;
    minEnergyRatio?: number;
    valueGainThreshold?: number;
    targetTriggerRate?: number;
    similarityThreshold?: number;
    storageDir?: string;
}
interface ExecutionResult {
    success: boolean;
    skillId: string;
    executed: boolean;
    reflectionTriggered: boolean;
    mutationAccepted: boolean;
    skillStats: {
        executionCount: number;
        successRate: number;
        avgValue: number;
        experienceCount: number;
    };
}
interface AnalysisResult {
    success: boolean;
    totalEnergy: number;
    residualRatio: number;
    layersCount: number;
    suggestedAbstraction: string;
    noveltyScore: number;
    wouldTriggerReflection: boolean;
}
interface SkillStats {
    skillsCount: number;
    experiencesCount: number;
    storageSizeMB: number;
    engine: {
        totalExecutions: number;
        totalReflections: number;
        totalMutations: number;
        valueGateAcceptance: number;
    };
}
interface SkillInfo {
    id: string;
    name: string;
    savedAt?: string;
}
/**
 * Python MCP服务器管理
 */
declare class MCPServer {
    private process;
    private port;
    private storageDir;
    constructor(config?: {
        port?: number;
        storageDir?: string;
    });
    /**
     * 启动MCP服务器
     */
    start(): Promise<void>;
    /**
     * 停止服务器
     */
    stop(): void;
    /**
     * 发送MCP请求
     */
    call(tool: string, args: Record<string, any>): Promise<any>;
    /**
     * JS模拟调用（当Python不可用时）
     */
    private simulateCall;
}
/**
 * 自演化Skill引擎
 */
export declare class SelfEvolvingSkillEngine {
    private server;
    private initialized;
    constructor(config?: {
        port?: number;
        storageDir?: string;
    });
    /**
     * 初始化引擎
     */
    init(): Promise<void>;
    /**
     * 创建新的自演化Skill
     */
    createSkill(config: SkillConfig): Promise<{
        skillId: string;
        name: string;
    }>;
    /**
     * 执行Skill并触发学习
     */
    execute(params: {
        skillId: string;
        context?: Record<string, any>;
        embedding?: number[];
        success?: boolean;
        value?: number;
    }): Promise<ExecutionResult>;
    /**
     * 分析嵌入向量
     */
    analyze(embedding: number[]): Promise<AnalysisResult>;
    /**
     * 列出所有Skill
     */
    list(): Promise<{
        skills: SkillInfo[];
        total: number;
    }>;
    /**
     * 获取系统统计
     */
    stats(): Promise<SkillStats>;
    /**
     * 保存Skill
     */
    save(skillId: string): Promise<boolean>;
    /**
     * 加载Skill
     */
    load(skillId: string): Promise<boolean>;
    /**
     * 关闭引擎
     */
    shutdown(): void;
}
/**
 * 便捷函数：快速创建和执行
 */
export declare function quickExecute(params: {
    name: string;
    context: Record<string, any>;
    success: boolean;
}): Promise<ExecutionResult>;
export { MCPServer };
export type { SkillConfig, ExecutionResult, AnalysisResult, SkillStats };
//# sourceMappingURL=index.d.ts.map