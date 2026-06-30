// ── Schematic editor types ────────────────────────────────────────────────────

export type ComponentType =
  | 'resistor' | 'capacitor' | 'led' | 'ic' | 'connector'
  | 'diode' | 'transistor' | 'inductor' | 'crystal'
  | 'voltage_regulator' | 'ground' | 'power';

export interface SchematicPin {
  name: string;
  /** Position relative to component origin, in grid units */
  rx: number;
  ry: number;
}

export interface SchematicComponent {
  id: string;
  type: ComponentType;
  ref: string;
  value: string;
  package: string;
  x: number;   // canvas grid units
  y: number;
  rotation: number; // 0 | 90 | 180 | 270
  pins: SchematicPin[];
}

export interface WirePoint {
  x: number;
  y: number;
}

export interface SchematicWire {
  id: string;
  points: WirePoint[];
}

export type Tool = 'select' | 'wire' | ComponentType;

// ── API / Netlist types ───────────────────────────────────────────────────────

export interface NetPin {
  component_ref: string;
  pin_name: string;
}

export interface Net {
  name: string;
  pins: NetPin[];
}

export interface NetlistComponent {
  ref: string;
  type: string;
  value: string;
  package: string;
  pin_count: number;
}

export interface Netlist {
  components: NetlistComponent[];
  nets: Net[];
  design_name: string;
}

// ── PCB layout types ──────────────────────────────────────────────────────────

export interface PCBPad {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  drill?: number;
  net: string;
  shape: string;
}

export interface PCBComponent {
  ref: string;
  type: string;
  package: string;
  x: number;
  y: number;
  rotation: number;
  layer: string;
  pads: PCBPad[];
  value: string;
  width: number;
  height: number;
}

export interface PCBPoint {
  x: number;
  y: number;
}

export interface PCBTrace {
  net: string;
  layer: string;
  points: PCBPoint[];
  width: number;
}

export interface PCBVia {
  x: number;
  y: number;
  outer_diameter: number;
  drill_diameter: number;
  net: string;
}

export interface PCBLayout {
  width: number;
  height: number;
  components: PCBComponent[];
  traces: PCBTrace[];
  vias: PCBVia[];
  design_name: string;
}
