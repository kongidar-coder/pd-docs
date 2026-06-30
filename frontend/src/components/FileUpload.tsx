import React, { useRef, useState, useCallback } from 'react';
import { analyzeSchematic, parseKicad } from '../api/client';
import type { Netlist } from '../types';

interface Props {
  onNetlist: (nl: Netlist, source: string) => void;
}

export default function FileUpload({ onNetlist }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.kicad_sch') || name.endsWith('.sch')) {
        const result = await parseKicad(file);
        onNetlist(result.netlist, `KiCad: ${result.message}`);
      } else if (/\.(png|jpg|jpeg|webp|gif)$/.test(name)) {
        const result = await analyzeSchematic(file);
        onNetlist(result.netlist, `AI scan: ${result.message}`);
      } else {
        setError('Unsupported file type. Upload a PNG/JPG image or a .kicad_sch file.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, [onNetlist]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="p-4 border-b border-pcb-border">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Import Schematic
      </h2>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${dragging ? 'border-pcb-accent bg-blue-900/20' : 'border-pcb-border hover:border-gray-500'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif,.kicad_sch,.sch"
          className="hidden"
          onChange={handleChange}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-5 h-5 border-2 border-pcb-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Analyzing…</span>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-2xl">⬆</p>
            <p className="text-xs text-gray-300">Drop image or .kicad_sch</p>
            <p className="text-xs text-gray-500">PNG/JPG → AI scan • .kicad_sch → parse</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
