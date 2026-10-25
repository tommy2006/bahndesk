#!/usr/bin/env node
// Bahn Control Room as an MCP server (stdio, JSON-RPC 2.0, no extra dependencies).
// Any MCP client (Claude Desktop, Claude Code, an in-house agent) can score an order file
// or ask which orders need a person, with the same rules and sources as the web app.
//
//   claude mcp add bahn -- node /path/to/bahndesk/mcp/server.mjs
//
// Tools only read and score. Nothing is booked, changed or sent.
import readline from 'node:readline';

// stdout carries the protocol; send every log line from the app to stderr instead.
console.log = (...a) => console.error(...a);
const { scoreOrders, COLUMNS } = await import('../lib/score-file.mjs');
const { SAMPLES } = await import('../lib/samples.mjs');
const { analyseAll, analyseOrder } = await import('../lib/engine.mjs');
const { db } = await import('../lib/data.mjs');
const { refreshAll, live } = await import('../lib/live.mjs');
await Promise.race([refreshAll().catch(() => {}), new Promise((r) => setTimeout(r, 8000))]);

const brief = (r) => ({ text: r.text.en, risk: r.r, agent_can_handle: r.agentCan, blocker: r.blocker, source: r.source?.label || r.source?.table || null, at: r.source?.at || null });
const TOOLS = [
  {
    name: 'score_orders',
    description: 'Score a file of car delivery orders (CSV with a header row, or JSON). Returns each order\'s lane (needs_you, agent, clear, check_data), a 0-100 confidence that it delivers on time without a person, the main reason and every reason with its source. Columns: ' + COLUMNS.map(([k, , req]) => k + (req ? '*' : '')).join(', ') + ' (* required). Times are local Helsinki/Berlin time.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The file contents: CSV or JSON.' }, filename: { type: 'string', description: 'Optional, e.g. orders.csv' } }, required: ['text'] },
    run: ({ text, filename }) => {
      const r = scoreOrders(text, filename || '');
      return { ...r, orders: r.orders.map((o) => ({ ref: o.ref, lane: o.lane, confidence: o.confidence, route: `${o.from.city} (${o.from.country}) -> ${o.to.city} (${o.to.country})`, km: o.km, predicted_arrival: o.predicted, deliver_by: o.deliverBy, main_reason: o.why?.en || null, data_problems: o.problems.map((p) => p.en), reasons: o.reasons.map(brief) })) };
    },
  },
  {
    name: 'orders_needing_a_person',
    description: 'The Bahn control room queue: orders that need a human decision now, most urgent first, with the reason, deadline and sources.',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      const all = analyseAll();
      return {
        orders_as_of: all.snapshotAt, live_data: live.status,
        needs_you: all.orders.filter((o) => o.lane === 'needs_you').map((o) => ({ ref: o.ref, route: `${o.from.city} -> ${o.to.city}`, confidence: o.confidence, why: o.whyYou?.text?.en || null, deadline: o.deadline ? { at: o.deadline.at, what: o.deadline.text?.en } : null, decision: o.decision?.text?.en || null })),
        agent_handling: all.orders.filter((o) => o.lane === 'agent').length,
        shared_causes: all.groups.map((g) => ({ what: g.text.en, orders: g.orders })),
      };
    },
  },
  {
    name: 'explain_order',
    description: 'Every risk reason for one Bahn order (e.g. CD-420437), with its source record and time, the lane and the suggested decision.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string', description: 'Order reference, e.g. CD-420437' } }, required: ['ref'] },
    run: ({ ref }) => {
      const order = Object.values(db.orders).find((o) => o.reference === ref || o.id === ref);
      if (!order) throw new Error(`No order ${ref}`);
      const a = analyseOrder(order);
      return { ref: a.ref, lane: a.lane, confidence: a.confidence, route: `${a.from.city} -> ${a.to.city}`, why: a.whyYou?.text?.en || null, decision: a.decision?.text?.en || null, reasons: a.reasons.map(brief) };
    },
  },
  {
    name: 'sample_order_file',
    description: 'A synthetic order file to try score_orders with. Names: ' + Object.keys(SAMPLES).join(', ') + '.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', enum: Object.keys(SAMPLES) } }, required: ['name'] },
    run: ({ name }) => ({ name, text: SAMPLES[name].build(Date.now()) }),
  },
];

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
async function handle(req) {
  const { id, method, params = {} } = req;
  if (method === 'initialize') return send({ id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'bahn-control-room', version: '1.0.0' } } });
  if (method === 'ping') return send({ id, result: {} });
  if (method === 'tools/list') return send({ id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool ${params.name}` } });
    try { return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(await tool.run(params.arguments || {}), null, 1) }] } }); }
    catch (e) { return send({ id, result: { content: [{ type: 'text', text: e.message }], isError: true } }); }
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  handle(req);
});
