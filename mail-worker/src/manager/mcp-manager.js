import aiToolRegistry from '../helper/ai-tool-registry';
import mcpProtocolHelper, { JSON_RPC_ERRORS, SERVER_INFO } from '../helper/mcp-protocol-helper';

/**
 * MCP Streamable HTTP 调度管理器：负责 JSON-RPC 方法策略分发与异常隔离。
 */
const mcpManager = {

	/** 处理 `initialize` 握手请求。 */
	handleInitialize(params = {}) {
		return {
			protocolVersion: mcpProtocolHelper.negotiateVersion(params?.protocolVersion),
			capabilities: {
				tools: { listChanged: false }
			},
			serverInfo: SERVER_INFO
		};
	},

	/** 处理 `tools/call` 工具调用，业务错误转为 MCP 标准 `isError: true` 响应。 */
	async handleToolCall(c, params = {}) {
		const name = params?.name;
		if (!name || typeof name !== 'string') {
			throw Object.assign(new Error('Missing tool name'), { jsonRpcCode: JSON_RPC_ERRORS.INVALID_PARAMS });
		}
		const handler = aiToolRegistry.getToolHandler(name);
		if (!handler) {
			throw Object.assign(new Error(`Unknown tool: ${name}`), { jsonRpcCode: JSON_RPC_ERRORS.INVALID_PARAMS });
		}

		try {
			const result = await handler(c, params.arguments || {});
			return mcpProtocolHelper.toolSuccess(result);
		} catch (err) {
			return mcpProtocolHelper.toolError(err?.message || 'Tool execution failed');
		}
	},

	/** 按 JSON-RPC method 分发单条消息（策略查表）。 */
	async dispatchMessage(c, msg) {
		if (!mcpProtocolHelper.isValidRequest(msg)) {
			return mcpProtocolHelper.errorResponse(msg?.id ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request');
		}
		if (mcpProtocolHelper.isNotification(msg)) {
			return null;
		}

		const handlers = {
			initialize: () => this.handleInitialize(msg.params),
			ping: () => ({}),
			'tools/list': () => ({ tools: aiToolRegistry.getToolDefinitions() }),
			'tools/call': () => this.handleToolCall(c, msg.params)
		};

		const handler = handlers[msg.method];
		if (!handler) {
			return mcpProtocolHelper.errorResponse(msg.id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
		}

		try {
			const result = await handler();
			return mcpProtocolHelper.okResponse(msg.id, result);
		} catch (err) {
			const code = err?.jsonRpcCode || JSON_RPC_ERRORS.INTERNAL_ERROR;
			return mcpProtocolHelper.errorResponse(msg.id, code, err?.message || 'Internal error');
		}
	},

	/** 处理 `POST /mcp` 请求（兼容单条消息、通知及批量 JSON-RPC 数组）。 */
	async handlePost(c) {
		const parsed = await mcpProtocolHelper.parsePayload(c);
		if (!parsed.ok) {
			return c.json(parsed.error, parsed.status);
		}

		const { payload } = parsed;
		if (Array.isArray(payload)) {
			if (payload.length === 0) {
				return c.json(mcpProtocolHelper.errorResponse(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Empty batch'), 400);
			}
			const responses = (await Promise.all(payload.map(item => this.dispatchMessage(c, item)))).filter(Boolean);
			return responses.length > 0 ? c.json(responses, 200) : c.body(null, 202);
		}

		const response = await this.dispatchMessage(c, payload);
		return response ? c.json(response, 200) : c.body(null, 202);
	}
};

export default mcpManager;
