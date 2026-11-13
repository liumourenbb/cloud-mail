export const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
export const SUPPORTED_PROTOCOL_VERSIONS = new Set([
	'2025-06-18',
	'2025-03-26',
	'2024-11-05'
]);

export const SERVER_INFO = {
	name: 'cloud-mail-mcp',
	version: '1.0.0'
};

export const JSON_RPC_ERRORS = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603
};

/**
 * MCP Streamable HTTP / JSON-RPC 2.0 协议编解码辅助工具。
 */
const mcpProtocolHelper = {

	/** 协商 MCP 协议版本，优先兼容客户端声明的受支持版本。 */
	negotiateVersion(requestedVersion) {
		if (typeof requestedVersion === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)) {
			return requestedVersion;
		}
		return DEFAULT_PROTOCOL_VERSION;
	},

	/** 解析并校验 HTTP 请求体中的 JSON-RPC payload。 */
	async parsePayload(c) {
		let payload;
		try {
			payload = await c.req.json();
		} catch {
			return { ok: false, error: this.errorResponse(null, JSON_RPC_ERRORS.PARSE_ERROR, 'Parse error'), status: 400 };
		}
		if (!payload || typeof payload !== 'object') {
			return { ok: false, error: this.errorResponse(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request'), status: 400 };
		}
		return { ok: true, payload };
	},

	/** 校验单条 JSON-RPC 2.0 消息基础结构。 */
	isValidRequest(msg) {
		return Boolean(msg && typeof msg === 'object' && msg.jsonrpc === '2.0' && typeof msg.method === 'string' && msg.method.length > 0);
	},

	/** 判断是否为无需返回结果的 JSON-RPC 通知消息。 */
	isNotification(msg) {
		return msg.id === undefined || msg.id === null;
	},

	/** 构造 JSON-RPC 成功响应。 */
	okResponse(id, result) {
		return { jsonrpc: '2.0', id, result };
	},

	/** 构造 JSON-RPC 错误响应。 */
	errorResponse(id, code, message, data) {
		const error = { code, message };
		if (data !== undefined) error.data = data;
		return { jsonrpc: '2.0', id: id ?? null, error };
	},

	/** 将工具业务返回值包装为 MCP 标准文本/结构化内容。 */
	toolSuccess(data) {
		return {
			content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
			isError: false
		};
	},

	/** 将工具执行异常包装为 MCP `isError: true`，便于模型感知具体错误并自纠。 */
	toolError(message) {
		return {
			content: [{ type: 'text', text: String(message || 'Tool execution failed') }],
			isError: true
		};
	}
};

export default mcpProtocolHelper;
