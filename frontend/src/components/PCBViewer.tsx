import React, { useRef, useState, useCallback } from 'react';
import type { PCBLayout, PCBComponent } from '../types';

interface Props {
  layout: PCBLayout | null;
  loading: boolean;
}

const MM_TO_PX = 6; // 1mm = 6px at default zoom

// Net colours for traces
const NET_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];
function netColor(net: string, idx: number): string {
  if (net.toLowerCase().includes('gnd') || net.toLowerCase().includes('ground')) return '#22c55e';
  if (net.toLowerCase().includes('vcc') || net.toLowerCase().includes('vdd') || net.includes('5V') || net.includes('3V')) return '#f97316';
  return NET_COLORS[idx % NET_COLORS.length];
}

export default function PCBViewer({ layout, loading }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: -10, y: -10, w: 200, h: 200 });
  const [panning, setPanning] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [hoveredNet, setHoveredNet] = useState<string | null>(null);

  const svgCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h,
    };
  }, [viewBox]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.12 : 0.89;
    const { x: mx, y: my } = svgCoords(e as unknown as React.MouseEvent);
    setViewBox(vb => ({
      x: mx - (mx - vb.x) * f,
      y: my - (my - vb.y) * f,
      w: vb.w * f, h: vb.h * f,
    }));
  }, [svgCoords]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const raw = svgCoords(e);
    setPanning({ sx: raw.x, sy: raw.y, vx: viewBox.x, vy: viewBox.y });
  }, [svgCoords, viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panning) return;
    const raw = svgCoords(e);
    setViewBox(vb => ({
      ...vb,
      x: panning.vx + (panning.sx - raw.x),
      y: panning.vy + (panning.sy - raw.y),
    }));
  }, [panning, svgCoords]);

  const handleMouseUp = useCallback(() => setPanning(null), []);

  // Fit board in view when layout changes
  React.useEffect(() => {
    if (!layout) return;
    const pw = layout.width * MM_TO_PX;
    const ph = layout.height * MM_TO_PX;
    setViewBox({ x: -10, y: -10, w: pw + 20, h: ph + 20 });
  }, [layout]);

  if (!layout && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-pcb-bg text-gray-600 text-sm">
        Generate PCB to see the layout here
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-pcb-bg gap-3">
        <div className="w-8 h-8 border-2 border-pcb-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Running placement & routing…</p>
      </div>
    );
  }

  const scale = MM_TO_PX;
  const netList = Array.from(new Set(layout!.traces.map(t => t.net)));
  const netColorMap: Record<string, string> = {};
  netList.forEach((n, i) => { netColorMap[n] = netColor(n, i); });

  return (
    <div className="flex-1 relative overflow-hidden bg-pcb-bg">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Board substrate */}
        <rect
          x={0} y={0}
          width={layout!.width * scale}
          height={layout!.height * scale}
          fill="#0d3320"
          stroke="#1a5c2a"
          strokeWidth={1}
          rx={1}
        />

        {/* Traces */}
        {layout!.traces.map((trace, ti) => {
          if (trace.points.length < 2) return null;
          const color = netColorMap[trace.net] ?? '#ef4444';
          const isHovered = hoveredNet === trace.net;
          const pts = trace.points.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
          return (
            <polyline
              key={ti}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(1, trace.width * scale)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={hoveredNet === null || isHovered ? 1 : 0.3}
              onMouseEnter={() => setHoveredNet(trace.net)}
              onMouseLeave={() => setHoveredNet(null)}
            />
          );
        })}

        {/* Vias */}
        {layout!.vias.map((via, vi) => (
          <g key={vi}>
            <circle cx={via.x * scale} cy={via.y * scale}
              r={via.outer_diameter / 2 * scale} fill="#c87941" />
            <circle cx={via.x * scale} cy={via.y * scale}
              r={via.drill_diameter / 2 * scale} fill="#0d3320" />
          </g>
        ))}

        {/* Components */}
        {layout!.components.map(comp => (
          <ComponentShape key={comp.ref} comp={comp} scale={scale} hoveredNet={hoveredNet} />
        ))}
      </svg>

      {/* Legend */}
      {netList.length > 0 && (
        <div className="absolute top-2 right-2 bg-pcb-panel/90 border border-pcb-border rounded p-2 max-h-48 overflow-y-auto text-xs">
          <p className="text-gray-400 mb-1 font-semibold">Nets</p>
          {netList.map(n => (
            <div key={n}
              className="flex items-center gap-1.5 cursor-pointer py-0.5 hover:text-white"
              onMouseEnter={() => setHoveredNet(n)}
              onMouseLeave={() => setHoveredNet(null)}
            >
              <span className="w-3 h-3 rounded-sm inline-block"
                style={{ background: netColorMap[n] }} />
              <span className="text-gray-300">{n}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none">
        {layout!.components.length} components · {layout!.traces.length} traces ·
        {layout!.width.toFixed(1)}×{layout!.height.toFixed(1)} mm
      </div>
    </div>
  );
}

// ── Component shape renderer ──────────────────────────────────────────────────

interface ShapeProps {
  comp: PCBComponent;
  scale: number;
  hoveredNet: string | null;
}

function ComponentShape({ comp, scale, hoveredNet }: ShapeProps) {
  const cx = comp.x * scale;
  const cy = comp.y * scale;
  const cw = comp.width * scale;
  const ch = comp.height * scale;

  return (
    <g transform={`translate(${cx},${cy}) rotate(${comp.rotation})`}>
      {/* Component body */}
      <rect
        x={-cw / 2} y={-ch / 2} width={cw} height={ch}
        fill="#1a3326"
        stroke="#2d6640"
        strokeWidth={0.5}
        rx={1}
      />
      {/* Pin 1 marker */}
      <rect x={-cw / 2} y={-ch / 2} width={4} height={4} fill="#9ca3af" />

      {/* Pads */}
      {comp.pads.map(pad => {
        const px = pad.x * scale;
        const py = pad.y * scale;
        const pw = pad.width * scale;
        const ph = pad.height * scale;
        const isHighlighted = hoveredNet === null || hoveredNet === pad.net;
        const padFill = pad.drill != null ? '#c87941' : '#d4a352';
        return (
          <g key={pad.name} opacity={isHighlighted ? 1 : 0.4}>
            {pad.shape === 'circle' || pad.drill != null ? (
              <>
                <circle cx={px} cy={py} r={pw / 2} fill={padFill} />
                {pad.drill != null && (
                  <circle cx={px} cy={py} r={pad.drill * scale / 2} fill="#0d1117" />
                )}
              </>
            ) : (
              <rect x={px - pw / 2} y={py - ph / 2} width={pw} height={ph} fill={padFill} />
            )}
            <text x={px} y={py + 2} textAnchor="middle" fontSize={4} fill="#0d1117" fontWeight="bold">
              {pad.name}
            </text>
          </g>
        );
      })}

      {/* Reference label */}
      <text x={0} y={-ch / 2 - 3} textAnchor="middle" fontSize={5} fill="#94a3b8">
        {comp.ref}
      </text>
    </g>
  );
}
