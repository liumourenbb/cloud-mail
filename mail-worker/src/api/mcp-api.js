import app from '../hono/hono';
import mcpManager from '../manager/mcp-manager';

app.post('/mcp', (c) => mcpManager.handlePost(c));
app.post('/mcp/', (c) => mcpManager.handlePost(c));

app.all('/mcp', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));
app.all('/mcp/', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));
