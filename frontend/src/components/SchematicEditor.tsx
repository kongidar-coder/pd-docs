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

function absPinPos(comp: SchematicComponent, pin: { rx: number; ry: number }) {
  const rad = (comp.rotation * Math.PI) / 180;
  const rx = pin.rx * Math.cos(rad) - pin.ry * Math.sin(rad);
  const ry = pin.rx * Math.sin(rad) + pin.ry * Math.cos(rad);
  return { x: comp.x + rx, y: comp.y + ry };
}

/** All pin positions across all components. */
function allPins(components: SchematicComponent[]) {
  const pins: { x: number; y: number; compId: string; pinName: string }[] = [];
  for (const comp of components) {
    const def = COMPONENT_DEFS[comp.type];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = absPinPos(comp, pin);
      pins.push({ x: pos.x, y: pos.y, compId: comp.id, pinName: pin.name });
    }
  }
  return pins;
}

/** Snap to nearest pin within threshold px, else snap to grid. */
function snapToPin(
  x: number, y: number,
  components: SchematicComponent[],
  threshold = 18,
): WirePoint {
  let best: WirePoint | null = null;
  let bestDist = threshold * threshold;
  for (const { x: px, y: py } of allPins(components)) {
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < bestDist) { bestDist = d2; best = { x: px, y: py }; }
  }
  return best ?? { x: snapToGrid(x), y: snapToGrid(y) };
}

function ptSegDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}

/** Returns true if point (x,y) is within threshold of any wire segment. */
function pointNearWire(x: number, y: number, wire: SchematicWire, threshold = 8): boolean {
  for (let i = 0; i < wire.points.length - 1; i++) {
    const d2 = ptSegDistSq(x, y,
      wire.points[i].x, wire.points[i].y,
      wire.points[i + 1].x, wire.points[i + 1].y);
    if (d2 <= threshold * threshold) return true;
  }
  return false;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);       // component
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null); // wire
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [wirePoints, setWirePoints] = useState<WirePoint[]>([]);
  const [mousePos, setMousePos] = useState<WirePoint>({ x: 0, y: 0 });
  const [snappedPos, setSnappedPos] = useState<WirePoint>({ x: 0, y: 0 });
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

    // In wire mode: snap to nearby pin, else snap to grid
    const snapped = activeTool === 'wire'
      ? snapToPin(raw.x, raw.y, components)
      : { x: snapToGrid(raw.x), y: snapToGrid(raw.y) };

    setMousePos({ x: raw.x, y: raw.y });
    setSnappedPos(snapped);

    if (panning) {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width;
      const sy = (e.clientY - rect.top) / rect.height;
      const curX = panning.vbX + sx * viewBox.w;
      const curY = panning.vbY + sy * viewBox.h;
      setViewBox(vb => ({
        ...vb,
        x: panning.vbX + (panning.startX - curX),
        y: panning.vbY + (panning.startY - curY),
      }));
      return;
    }

    if (activeTool === 'select' && selectedId && dragOffset) {
      const snappedDrag = { x: snapToGrid(raw.x), y: snapToGrid(raw.y) };
      setComponents(prev => prev.map(c =>
        c.id === selectedId
          ? { ...c, x: snappedDrag.x + dragOffset.dx, y: snappedDrag.y + dragOffset.dy }
          : c
      ));
    }
  }, [svgCoords, activeTool, selectedId, dragOffset, panning, components, viewBox.w, viewBox.h]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const { x, y } = snappedPos;

    if (activeTool === 'select') {
      // Check if clicking near a wire
      let hitWire: string | null = null;
      for (const wire of wires) {
        if (pointNearWire(mousePos.x, mousePos.y, wire)) {
          hitWire = wire.id;
          break;
        }
      }
      setSelectedWireId(hitWire);
      if (!hitWire) setSelectedId(null);
      return;
    }

    if (activeTool === 'wire') {
      const snapped = snapToPin(mousePos.x, mousePos.y, components);
      setWirePoints(prev => {
        if (prev.length === 0) return [snapped];
        // Check if we landed on a pin or near the start — finish the wire
        const last = prev[prev.length - 1];
        const distFromStart = Math.hypot(snapped.x - prev[0].x, snapped.y - prev[0].y);
        const newPoints = [...prev, snapped];
        // Always add segment; user double-clicks or presses Escape to stop
        return newPoints;
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
    setEditing({ id: newComp.id, ref, value: newComp.value, package: newComp.package });
  }, [activeTool, snappedPos, mousePos, wires, components]);

  const handleCanvasDblClick = useCallback(() => {
    if (activeTool === 'wire' && wirePoints.length >= 2) {
      const newWire: SchematicWire = { id: uid(), points: wirePoints };
      setWires(w => [...w, newWire]);
      setWirePoints([]);
    }
  }, [activeTool, wirePoints]);

  const handleCompMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;
    setSelectedId(id);
    setSelectedWireId(null);
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
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width;
      const sy = (e.clientY - rect.top) / rect.height;
      const startX = viewBox.x + sx * viewBox.w;
      const startY = viewBox.y + sy * viewBox.h;
      setPanning({ startX, startY, vbX: viewBox.x, vbY: viewBox.y });
      e.preventDefault();
    }
  }, [viewBox]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const { x: mx, y: my } = svgCoords(e as unknown as React.MouseEvent);
    setViewBox(vb => ({
      x: mx - (mx - vb.x) * factor,
      y: my - (my - vb.y) * factor,
      w: vb.w * factor,
      h: vb.h * factor,
    }));
  }, [svgCoords]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Finish wire in progress if it has points
      if (wirePoints.length >= 2) {
        setWires(w => [...w, { id: uid(), points: wirePoints }]);
      }
      setWirePoints([]);
      setSelectedId(null);
      setSelectedWireId(null);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId && activeTool === 'select') {
        setComponents(prev => prev.filter(c => c.id !== selectedId));
        setSelectedId(null);
      }
      if (selectedWireId) {
        setWires(prev => prev.filter(w => w.id !== selectedWireId));
        setSelectedWireId(null);
      }
    }
    if (e.key === 'r' && selectedId && activeTool === 'select') {
      setComponents(prev => prev.map(c =>
        c.id === selectedId ? { ...c, rotation: (c.rotation + 90) % 360 } : c
      ));
    }
  }, [selectedId, selectedWireId, activeTool, wirePoints]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;
  const isWireTool = activeTool === 'wire';

  // Highlight pin when wire tool is near it
  const nearPin = isWireTool
    ? allPins(components).find(p => Math.hypot(mousePos.x - p.x, mousePos.y - p.y) < 18)
    : null;

  return (
    <div className="flex-1 relative overflow-hidden bg-pcb-bg select-none">
      <svg
        ref={svgRef}
        viewBox={vb}
        className="w-full h-full"
        style={{ cursor: activeTool === 'select' ? (dragOffset ? 'grabbing' : 'default') : 'crosshair' }}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDblClick}
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
        {wires.map(wire => {
          const isSelected = wire.id === selectedWireId;
          return (
            <g key={wire.id}>
              {/* Invisible wider hit area */}
              <polyline
                points={wire.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                style={{ cursor: 'pointer' }}
                onClick={e => {
                  e.stopPropagation();
                  if (activeTool === 'select') {
                    setSelectedWireId(wire.id);
                    setSelectedId(null);
                  }
                }}
              />
              {/* Visible wire */}
              <polyline
                points={wire.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={isSelected ? '#f59e0b' : '#4ade80'}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
            </g>
          );
        })}

        {/* Wire in progress */}
        {wirePoints.length > 0 && (
          <polyline
            points={[...wirePoints, snappedPos].map(p => `${p.x},${p.y}`).join(' ')}
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
          (COMPONENT_DEFS[comp.type]?.pins ?? comp.pins).map(pin => {
            const { x, y } = absPinPos(comp, pin);
            const isNear = nearPin && Math.hypot(mousePos.x - x, mousePos.y - y) < 18;
            return (
              <circle key={`${comp.id}-${pin.name}`}
                cx={x} cy={y} r={isNear ? 6 : 3}
                fill={isNear ? '#facc15' : '#c87941'}
                stroke={isNear ? '#fef08a' : 'none'}
                strokeWidth={1.5}
                style={{ transition: 'r 0.1s' }}
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
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none space-y-0.5">
        {isWireTool ? (
          <p>Click pins to connect • Double-click or Esc to finish wire</p>
        ) : (
          <p>Scroll: zoom • Alt+drag: pan • R: rotate • Del: delete selected</p>
        )}
        {selectedWireId && (
          <p className="text-yellow-400">Wire selected — press Delete to remove</p>
        )}
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
  const SNAP = 6;

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

  const edges: [number, number][] = [];
  for (const wire of wires) {
    for (let i = 0; i < wire.points.length - 1; i++) {
      const a = getOrAddPt(wire.points[i].x, wire.points[i].y);
      const b = getOrAddPt(wire.points[i + 1].x, wire.points[i + 1].y);
      if (a !== b) edges.push([a, b]);
    }
  }

  const parent = pts.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) { parent[find(a)] = find(b); }
  for (const [a, b] of edges) union(a, b);

  const pinNets: Record<string, Set<string>> = {};

  for (const comp of components) {
    const def = COMPONENT_DEFS[comp.type];
    if (!def) continue;
    for (const pin of def.pins) {
      const { x, y } = absPinPos(comp, pin);
      const sx = snapToGrid(x), sy = snapToGrid(y);
      const key = `${sx},${sy}`;
      let root: string;
      if (key in wirePtMap) {
        root = String(find(wirePtMap[key]));
      } else {
        let bestRoot = `isolated_${comp.ref}_${pin.name}`;
        outer: for (const wire of wires) {
          for (let i = 0; i < wire.points.length - 1; i++) {
            const d2 = ptSegDistSq(sx, sy,
              snapToGrid(wire.points[i].x), snapToGrid(wire.points[i].y),
              snapToGrid(wire.points[i + 1].x), snapToGrid(wire.points[i + 1].y));
            if (d2 <= SNAP * SNAP) {
              const a = getOrAddPt(wire.points[i].x, wire.points[i].y);
              bestRoot = String(find(a));
              break outer;
            }
          }
        }
        root = bestRoot;
      }
      if (!pinNets[root]) pinNets[root] = new Set();
      pinNets[root].add(`${comp.ref}:${pin.name}`);
    }
  }

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
      pin_count: (COMPONENT_DEFS[c.type]?.pins ?? c.pins).length,
    })),
    nets,
    design_name: 'schematic_design',
  };
}
