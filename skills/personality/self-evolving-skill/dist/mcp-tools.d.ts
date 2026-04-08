declare const TOOLS: {
    skill_create: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                name: {
                    type: string;
                    description: string;
                };
                description: {
                    type: string;
                    description: string;
                    default: string;
                };
                min_energy_ratio: {
                    type: string;
                    description: string;
                    default: number;
                };
                target_trigger_rate: {
                    type: string;
                    description: string;
                    default: number;
                };
            };
            required: string[];
        };
    };
    skill_execute: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                skill_id: {
                    type: string;
                    description: string;
                };
                context: {
                    type: string;
                    description: string;
                    default: {};
                };
                embedding: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                success: {
                    type: string;
                    description: string;
                    default: boolean;
                };
                value: {
                    type: string;
                    description: string;
                    default: number;
                };
            };
            required: string[];
        };
    };
    skill_analyze: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                embedding: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
            };
            required: string[];
        };
    };
    skill_list: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
    };
    skill_stats: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
    };
    skill_save: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                skill_id: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
    skill_load: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                skill_id: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
};
export { TOOLS };
export default TOOLS;
//# sourceMappingURL=mcp-tools.d.ts.map