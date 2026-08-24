const mode = process.env.RUNTIME_MODE || 'STOPPED';
const interval = Number(process.env.HEARTBEAT_MS || 5000);
console.log(JSON.stringify({event:'worker_start',mode,heartbeatMs:interval}));
if (mode === 'LIVE') console.warn('LIVE requested: provider credentials, risk gates and signer must still independently authorize execution.');
setInterval(()=>console.log(JSON.stringify({event:'worker_heartbeat',mode,timestamp:new Date().toISOString()})), interval);
