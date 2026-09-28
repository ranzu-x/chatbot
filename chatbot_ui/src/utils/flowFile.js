import { flowAPI } from '../services/api';

/** Downloads a bot as a portable .json file (chatbot_api/routes/flowTransfer.js). Returns the server's warnings. */
export async function downloadFlowExport(flow) {
  const res = await flowAPI.exportFile(flow.id);
  const file = res.data?.file;
  if (!file) throw new Error('The server returned no file');
  const safeName = String(flow.name || 'bot').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'bot';
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.bot.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return res.data?.warnings || [];
}

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024; // the API's JSON body limit is 5 MB

/** Reads + pre-checks a chosen file in the browser. Returns { file, summary } or throws with a readable message. */
export async function readFlowFile(fileObj) {
  if (!fileObj) throw new Error('Choose a file');
  if (fileObj.size > MAX_IMPORT_BYTES) throw new Error('That file is too large (max 4 MB).');
  const text = await fileObj.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!data || data.format !== 'chatbot-flow-export') throw new Error("That isn't a bot export file from this app.");
  const nodes = Array.isArray(data.flow?.nodes) ? data.flow.nodes : [];
  return {
    file: data,
    summary: {
      name: data.flow?.name || 'Imported bot',
      platform: data.flow?.platform || '',
      elements: nodes.length,
      forms: Array.isArray(data.components?.userInputFlows) ? data.components.userInputFlows.length : 0,
      version: data.version,
      exportedAt: data.exportedAt || null,
    },
  };
}
