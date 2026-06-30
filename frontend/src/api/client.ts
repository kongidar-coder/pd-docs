import type { Netlist, PCBLayout } from '../types';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function analyzeSchematic(file: File): Promise<{ netlist: Netlist; message: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/analyze-schematic`, { method: 'POST', body: form });
  return handleResponse(res);
}

export async function parseKicad(file: File): Promise<{ netlist: Netlist; message: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/parse-kicad`, { method: 'POST', body: form });
  return handleResponse(res);
}

export async function generatePCB(netlist: Netlist): Promise<PCBLayout> {
  const res = await fetch(`${BASE}/generate-pcb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(netlist),
  });
  return handleResponse(res);
}

export async function exportGerbers(layout: PCBLayout): Promise<Blob> {
  const res = await fetch(`${BASE}/export-gerbers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(layout),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.blob();
}
