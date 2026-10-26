import type { OperationalLogger } from "../observability/operational-logger";

export interface InputSchema<TInput> {
  parse(value: unknown): TInput;
}

export interface AgentTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: InputSchema<TInput>;
  execute(input: TInput): Promise<TOutput> | TOutput;
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool<unknown, unknown>>();

  constructor(
    private readonly logger: OperationalLogger,
    private readonly onResult?: (name: string, input: unknown, output: unknown) => void,
  ) {}

  register<TInput, TOutput>(tool: AgentTool<TInput, TOutput>) {
    this.tools.set(
      tool.name,
      tool as AgentTool<unknown, unknown>,
    );
  }

  async execute<TOutput>(name: string, input: unknown): Promise<TOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} is not registered.`);
    }
    this.logger.record("tool_call", { tool: name });
    const validated = tool.inputSchema.parse(input);
    const output = await tool.execute(validated);
    this.onResult?.(name, validated, output);
    return output as TOutput;
  }

  describe() {
    return [...this.tools.values()].map(({ name, description }) => ({
      name,
      description,
    }));
  }
}