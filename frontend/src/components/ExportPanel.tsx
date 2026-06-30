import { useState } from 'react';
import { generatePCB, exportGerbers } from '../api/client';
import type { Netlist, PCBLayout } from '../types';

interface Props {
  netlist: Netlist | null;
  layout: PCBLayout | null;
  onLayout: (layout: PCBLayout) => void;
  onLoading: (v: boolean) => void;
}

export default function ExportPanel({ netlist, layout, onLayout, onLoading }: Props) {
  const [genError, setGenError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const canGenerate = netlist && netlist.components.length > 0;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenError(null);
    setGenerating(true);
    onLoading(true);
    try {
      const result = await generatePCB({ ...netlist!, design_name: netlist!.design_name || 'pcb_design' });
      onLayout(result);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
      onLoading(false);
    }
  }

  async function handleExport() {
    if (!layout) return;
    setExportError(null);
    setExporting(true);
    try {
      const blob = await exportGerbers(layout);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${layout.design_name || 'pcb_design'}-gerbers.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-4 border-t border-pcb-border space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Generate & Export</h2>

      <button
        onClick={handleGenerate}
        disabled={!canGenerate || generating}
        className={`w-full py-2 rounded text-sm font-medium transition-colors
          ${canGenerate && !generating
            ? 'bg-green-700 hover:bg-green-600 text-white'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating…
          </span>
        ) : '⚡ Generate PCB Layout'}
      </button>
      {genError && <p className="text-xs text-red-400">{genError}</p>}

      <button
        onClick={handleExport}
        disabled={!layout || exporting}
        className={`w-full py-2 rounded text-sm font-medium transition-colors
          ${layout && !exporting
            ? 'bg-pcb-accent hover:bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
      >
        {exporting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Exporting…
          </span>
        ) : '⬇ Download Gerber ZIP'}
      </button>
      {exportError && <p className="text-xs text-red-400">{exportError}</p>}

      {layout && (
        <div className="text-xs text-gray-500 space-y-0.5 pt-1 border-t border-pcb-border">
          <p>Board: {layout.width.toFixed(1)} × {layout.height.toFixed(1)} mm</p>
          <p>Components: {layout.components.length}</p>
          <p>Traces: {layout.traces.length}</p>
          <p className="text-green-500 mt-1">✓ Gerber files include: F.Cu, B.Cu, F.Silkscreen, F.Mask, B.Mask, Edge.Cuts, drill</p>
          <p className="text-gray-400">Upload ZIP to JLCPCB, PCBWay, or OSHPark</p>
        </div>
      )}
    </div>
  );
}
