import React, { useRef, useState, useCallback, useEffect } from 'react';
import type {
  SchematicComponent, SchematicWire, WirePoint,
  Tool, ComponentType, Netlist
} from '../types';
import { COMPONENT_DEFS, GRID } from './symbols';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idSeq = 1;
const uid = () => String(_idSeq++);

const refCounts: Record<string, number> = {};
function nextRef(type: string): string {
  const prefix = {
    resistor: 'R', capacitor: 'C', led: 'D', diode: 'D', inductor: 'L',
    transistor: 'Q', ic: 'U', connector: 'J', crystal: 'Y',
    voltage_regulator: 'VR', ground: 'GND', power: 'PWR',
  }[type] ?? 'X';
  refCounts[prefix] = (refCounts[prefix] ?? 0) + 1;
  return `${prefix}${refCounts[prefix]}`;
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/** Returns absolute pin position given the component. */
function absPinPos(comp: SchematicComponent, pin: { rx: number; ry: number }) {
  const rad = (comp.rotation * Math.PI) / 180;
  const rx = pin.rx * Math.cos(rad) - pin.ry * Math.sin(rad);
  const ry = pin.rx * Math.sin(rad) + pin.ry * Math.cos(rad);
  return { x: comp.x + rx, y: comp.y + ry };
}

/** Distance from point to line segment squared. */
function ptSegDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}

const DEFAULT_VALUES: Record<string, string> = {
  resistor: '10k', capacitor: '100nF', led: 'RED', diode: '1N4148',
  inductor: '10uH', transistor: '2N3904', ic: '555', connector: 'J1',
  crystal: '16MHz', voltage_regulator: '7805',
};

const DEFAULT_PACKAGES: Record<string, string> = {
  resistor: '0603', capacitor: '0603', led: '0603', diode: '0603',
  inductor: '0603', transistor: 'SOT-23', ic: 'DIP-8',
  connector: 'CONN-2', crystal: 'THT-5.08',
  voltage_regulator: 'SOT-23', ground: '', power: '',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  activeTool: Tool;
  onNetlistChange: (nl: Netlist) => void;
}

interface EditingComp {
  id: string;
  ref: string;
  value: string;
  package: string;
}

export default function SchematicEditor({ activeTool, onNetlistChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [components, setComponents] = useState<SchematicComponent[]>([]);
  const [wires, setWires] = useState<SchematicWire[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [wirePoints, setWirePoints] = useState<WirePoint[]>([]);
  const [mousePos, setMousePos] = useState<WirePoint>({ x: 0, y: 0 });
  const [editing, setEditing] = useState<EditingComp | null>(null);
  const [viewBox, setViewBox] = useState({ x: -200, y: -200, w: 1200, h: 800 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; vbX: number; vbY: number } | null>(null);

  // ── SVG coordinate helpers ──────────────────────────────────────────────────

  const svgCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    return {
      x: viewBox.x + sx * viewBox.w,
      y: viewBox.y + sy * viewBox.h,
    };
  }, [viewBox]);

  // ── Netlist extraction ──────────────────────────────────────────────────────

  useEffect(() => {
    const nl = extractNetlist(components, wires);
    onNetlistChange(nl);
  }, [components, wires, onNetlistChange]);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const raw = svgCoords(e);
    const snapped = { x: snapToGrid(raw.x), y: snapToGrid(raw.y) };
    setMousePos(snapped);

    if (panning) {
      setViewBox(vb => ({
        ...vb,
        x: panning.vbX - (raw.x - (panning.vbX + (e.clientX - svgRef.current!.getBoundingClientRect().left) / svgRef.current!.getBoundingClientRect().width * vb.w)),
        y: panning.vbY - (raw.y - (panning.vbY + (e.clientY - svgRef.current!.getBoundingClientRect().top) / svgRef.current!.getBoundingClientRect().height * vb.h)),
      }));
      return;
    }

    if (activeTool === 'select' && selectedId && dragOffset) {
      setComponents(prev => prev.map(c =>
        c.id === selectedId
          ? { ...c, x: snapped.x + dragOffset.dx, y: snapped.y + dragOffset.dy }
          : c
      ));
    }
  }, [svgCoords, activeTool, selectedId, dragOffset, panning]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const { x, y } = mousePos;

    if (activeTool === 'select') return;

    if (activeTool === 'wire') {
      setWirePoints(prev => {
        if (prev.length === 0) return [{ x, y }];
        // End wire on second click
        const newWire: SchematicWire = { id: uid(), points: [...prev, { x, y }] };
        setWires(w => [...w, newWire]);
        return [];
      });
      return;
    }

    // Place component
    const type = activeTool as ComponentType;
    const def = COMPONENT_DEFS[type];
    if (!def) return;
    const ref = nextRef(type);
    const newComp: SchematicComponent = {
      id: uid(),
      type,
      ref,
      value: DEFAULT_VALUES[type] ?? '',
      package: DEFAULT_PACKAGES[type] ?? '0603',
      x, y,
      rotation: 0,
      pins: def.pins,
    };
    setComponents(prev => [...prev, newComp]);
    // Open property editor
    setEditing({ id: newComp.id, ref, value: newComp.value, package: newComp.package });
  }, [activeTool, mousePos]);

  const handleCompMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;
    setSelectedId(id);
    const comp = components.find(c => c.id === id)!;
    const { x, y } = svgCoords(e);
    setDragOffset({ dx: comp.x - snapToGrid(x), dy: comp.y - snapToGrid(y) });
  }, [activeTool, components, svgCoords]);

  const handleMouseUp = useCallback(() => {
    setDragOffset(null);
    setPanning(null);
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      const raw = svgCoords(e);
      setPanning({ startX: raw.x, startY: raw.y, vbX: viewBox.x, vbY: viewBox.y });
      e.preventDefault();
    }
  }, [svgCoords, viewBox]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const { x: mx, y: my } = svgCoords(e as unknown as React.MouseEvent);
    setViewBox(vb => {
      const nw = vb.w * factor;
      const nh = vb.h * factor;
      return {
        x: mx - (mx - vb.x) * factor,
        y: my - (my - vb.y) * factor,
        w: nw, h: nh,
      };
    });
  }, [svgCoords]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setWirePoints([]);
      setSelectedId(null);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && activeTool === 'select') {
      setComponents(prev => prev.filter(c => c.id !== selectedId));
      setSelectedId(null);
    }
    if (e.key === 'r' && selectedId && activeTool === 'select') {
      setComponents(prev => prev.map(c =>
        c.id === selectedId ? { ...c, rotation: (c.rotation + 90) % 360 } : c
      ));
    }
  }, [selectedId, activeTool]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div className="flex-1 relative overflow-hidden bg-pcb-bg select-none">
      <svg
        ref={svgRef}
        viewBox={vb}
        className="w-full h-full"
        style={{ cursor: activeTool === 'select' ? (dragOffset ? 'grabbing' : 'default') : 'crosshair' }}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Grid */}
        <defs>
          <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#2d3147" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect
          x={viewBox.x - 1000} y={viewBox.y - 1000}
          width={viewBox.w + 2000} height={viewBox.h + 2000}
          fill="url(#grid)"
        />

        {/* Wires */}
        {wires.map(wire => (
          <polyline
            key={wire.id}
            points={wire.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#4ade80"
            strokeWidth={1.5}
          />
        ))}

        {/* Wire in progress */}
        {wirePoints.length > 0 && (
          <polyline
            points={[...wirePoints, mousePos].map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#4ade80"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        )}

        {/* Components */}
        {components.map(comp => {
          const def = COMPONENT_DEFS[comp.type];
          const isSelected = comp.id === selectedId;
          const Sym = def?.Symbol;
          return (
            <g
              key={comp.id}
              transform={`translate(${comp.x},${comp.y}) rotate(${comp.rotation})`}
              className="text-green-300"
              onMouseDown={e => handleCompMouseDown(e, comp.id)}
              onDoubleClick={e => {
                e.stopPropagation();
                setEditing({ id: comp.id, ref: comp.ref, value: comp.value, package: comp.package });
              }}
            >
              {Sym && <Sym rotation={comp.rotation} />}
              {/* Selection ring */}
              {isSelected && (
                <rect
                  x={-(def?.width ?? 2) * GRID / 2 - 4}
                  y={-(def?.height ?? 2) * GRID / 2 - 4}
                  width={(def?.width ?? 2) * GRID + 8}
                  height={(def?.height ?? 2) * GRID + 8}
                  fill="none"
                  stroke="#4f8ef7"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                  rx={4}
                />
              )}
            </g>
          );
        })}

        {/* Pin dots */}
        {components.map(comp =>
          comp.pins.map(pin => {
            const { x, y } = absPinPos(comp, pin);
            return (
              <circle key={`${comp.id}-${pin.name}`}
                cx={x} cy={y} r={3}
                fill="#c87941" stroke="none"
              />
            );
          })
        )}

        {/* Reference labels */}
        {components.map(comp => (
          <text
            key={`label-${comp.id}`}
            x={comp.x}
            y={comp.y - (COMPONENT_DEFS[comp.type]?.height ?? 2) * GRID / 2 - 6}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
          >
            {comp.ref}
          </text>
        ))}
      </svg>

      {/* Toolbar hints */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none">
        <span>Scroll: zoom • Alt+drag: pan • R: rotate • Del: delete • Esc: cancel</span>
      </div>

      {/* Component properties dialog */}
      {editing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10"
          onClick={() => setEditing(null)}>
          <div className="bg-pcb-panel border border-pcb-border rounded-lg p-5 w-72 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">Component Properties</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-gray-400">Reference</span>
                <input
                  className="mt-1 w-full bg-pcb-bg border border-pcb-border rounded px-2 py-1 text-sm text-white"
                  value={editing.ref}
                  onChange={e => setEditing(v => v && { ...v, ref: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Value</span>
                <input
                  className="mt-1 w-full bg-pcb-bg border border-pcb-border rounded px-2 py-1 text-sm text-white"
                  value={editing.value}
                  onChange={e => setEditing(v => v && { ...v, value: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Package</span>
                <input
                  className="mt-1 w-full bg-pcb-bg border border-pcb-border rounded px-2 py-1 text-sm text-white"
                  value={editing.package}
                  onChange={e => setEditing(v => v && { ...v, package: e.target.value })}
                  placeholder="0603, DIP-8, CONN-2…"
                />
              </label>
            </div>
            <button
              className="mt-4 w-full bg-pcb-accent text-white rounded py-1.5 text-sm hover:bg-blue-600"
              onClick={() => {
                if (!editing) return;
                setComponents(prev => prev.map(c =>
                  c.id === editing.id
                    ? { ...c, ref: editing.ref, value: editing.value, package: editing.package }
                    : c
                ));
                setEditing(null);
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Netlist extraction ────────────────────────────────────────────────────────

function extractNetlist(
  components: SchematicComponent[],
  wires: SchematicWire[],
): Netlist {
  const SNAP = 4; // px tolerance for pin-to-wire snapping

  // Build adjacency for wire endpoints
  const pts: WirePoint[] = [];
  const wirePtMap: Record<string, number> = {};

  function getOrAddPt(x: number, y: number): number {
    const sx = snapToGrid(x), sy = snapToGrid(y);
    const key = `${sx},${sy}`;
    if (!(key in wirePtMap)) {
      wirePtMap[key] = pts.length;
      pts.push({ x: sx, y: sy });
    }
    return wirePtMap[key];
  }

  // Add wire endpoints
  const edges: [number, number][] = [];
  for (const wire of wires) {
    for (let i = 0; i < wire.points.length - 1; i++) {
      const a = getOrAddPt(wire.points[i].x, wire.points[i].y);
      const b = getOrAddPt(wire.points[i + 1].x, wire.points[i + 1].y);
      if (a !== b) edges.push([a, b]);
    }
  }

  // Union-Find
  const parent = pts.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) { parent[find(a)] = find(b); }
  for (const [a, b] of edges) union(a, b);

  // Map pin → net root
  const pinNets: Record<string, Set<string>> = {}; // root → set of "ref:pin"

  for (const comp of components) {
    const def = COMPONENT_DEFS[comp.type];
    if (!def) continue;
    for (const pin of comp.pins) {
      const { x, y } = absPinPos(comp, pin);
      const sx = snapToGrid(x), sy = snapToGrid(y);
      const key = `${sx},${sy}`;
      let root: string;
      if (key in wirePtMap) {
        root = String(find(wirePtMap[key]));
      } else {
        // Check if pin is near any wire segment
        let bestRoot = `isolated_${comp.ref}_${pin.name}`;
        for (const wire of wires) {
          for (let i = 0; i < wire.points.length - 1; i++) {
            const d2 = ptSegDistSq(sx, sy,
              snapToGrid(wire.points[i].x), snapToGrid(wire.points[i].y),
              snapToGrid(wire.points[i + 1].x), snapToGrid(wire.points[i + 1].y));
            if (d2 <= SNAP * SNAP) {
              const a = getOrAddPt(wire.points[i].x, wire.points[i].y);
              bestRoot = String(find(a));
              break;
            }
          }
          if (bestRoot !== `isolated_${comp.ref}_${pin.name}`) break;
        }
        root = bestRoot;
      }
      if (!pinNets[root]) pinNets[root] = new Set();
      pinNets[root].add(`${comp.ref}:${pin.name}`);
    }
  }

  // Build nets
  let netIdx = 1;
  const nets = Object.values(pinNets)
    .filter(s => s.size >= 2)
    .map(s => ({
      name: `Net_${netIdx++}`,
      pins: Array.from(s).map(token => {
        const [ref, pname] = token.split(':');
        return { component_ref: ref, pin_name: pname };
      }),
    }));

  return {
    components: components.map(c => ({
      ref: c.ref,
      type: c.type,
      value: c.value,
      package: c.package,
      pin_count: c.pins.length,
    })),
    nets,
    design_name: 'schematic_design',
  };
}
