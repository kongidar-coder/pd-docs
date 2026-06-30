/**
 * SVG symbols for schematic components.
 * All coordinates in px at GRID=20px scale; component is centred at (0,0).
 */
import React from 'react';
import type { ComponentType, SchematicPin } from '../types';

export const GRID = 20;

export interface ComponentDef {
  width: number;   // in grid units
  height: number;
  pins: SchematicPin[];
  Symbol: React.FC<{ rotation: number }>;
}

const stroke = { stroke: 'currentColor', strokeWidth: 1.5, fill: 'none' };
const filled = { stroke: 'currentColor', strokeWidth: 1.5, fill: '#1a1d27' };

const Resistor: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={-40} y1={0} x2={-20} y2={0} />
    <rect {...filled} x={-20} y={-8} width={40} height={16} rx={2} />
    <line {...stroke} x1={20} y1={0} x2={40} y2={0} />
  </g>
);

const Capacitor: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={0} y1={-30} x2={0} y2={-6} />
    <line {...stroke} x1={-14} y1={-6} x2={14} y2={-6} />
    <line {...stroke} x1={-14} y1={6} x2={14} y2={6} />
    <line {...stroke} x1={0} y1={6} x2={0} y2={30} />
  </g>
);

const LED: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={-40} y1={0} x2={-14} y2={0} />
    <polygon {...filled} points="-14,-13 -14,13 14,0" />
    <line {...stroke} x1={14} y1={-13} x2={14} y2={13} />
    <line {...stroke} x1={14} y1={0} x2={40} y2={0} />
    {/* Arrow 1 */}
    <line {...stroke} x1={18} y1={-14} x2={28} y2={-22} />
    <line {...stroke} x1={28} y1={-22} x2={24} y2={-22} />
    <line {...stroke} x1={28} y1={-22} x2={28} y2={-18} />
    {/* Arrow 2 */}
    <line {...stroke} x1={24} y1={-8} x2={34} y2={-16} />
    <line {...stroke} x1={34} y1={-16} x2={30} y2={-16} />
    <line {...stroke} x1={34} y1={-16} x2={34} y2={-12} />
  </g>
);

const Diode: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={-40} y1={0} x2={-14} y2={0} />
    <polygon {...filled} points="-14,-13 -14,13 14,0" />
    <line {...stroke} x1={14} y1={-13} x2={14} y2={13} />
    <line {...stroke} x1={14} y1={0} x2={40} y2={0} />
  </g>
);

const Inductor: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={-40} y1={0} x2={-24} y2={0} />
    <path {...stroke} d="M -24 0 C -24 -12 -16 -12 -12 0 C -12 -12 -4 -12 0 0 C 0 -12 8 -12 12 0 C 12 -12 20 -12 24 0" />
    <line {...stroke} x1={24} y1={0} x2={40} y2={0} />
  </g>
);

const Transistor: React.FC<{ rotation: number }> = () => (
  <g>
    {/* Base */}
    <line {...stroke} x1={-30} y1={0} x2={-10} y2={0} />
    <line {...stroke} x1={-10} y1={-20} x2={-10} y2={20} />
    {/* Collector */}
    <line {...stroke} x1={-10} y1={-12} x2={10} y2={-22} />
    <line {...stroke} x1={10} y1={-22} x2={10} y2={-35} />
    {/* Emitter with arrow */}
    <line {...stroke} x1={-10} y1={12} x2={10} y2={22} />
    <line {...stroke} x1={10} y1={22} x2={10} y2={35} />
    <polygon fill="currentColor" points="10,22 4,14 14,14" />
    {/* Circle */}
    <circle {...filled} cx={0} cy={0} r={22} />
    <line {...stroke} x1={-10} y1={-20} x2={-10} y2={20} />
    <line {...stroke} x1={-10} y1={-12} x2={10} y2={-22} />
    <line {...stroke} x1={-10} y1={12} x2={10} y2={22} />
  </g>
);

const Crystal: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={0} y1={-30} x2={0} y2={-10} />
    <rect {...filled} x={-12} y={-10} width={24} height={6} />
    <rect {...filled} x={-6} y={-4} width={12} height={8} />
    <rect {...filled} x={-12} y={4} width={24} height={6} />
    <line {...stroke} x1={0} y1={10} x2={0} y2={30} />
  </g>
);

const VoltageReg: React.FC<{ rotation: number }> = () => (
  <g>
    <rect {...filled} x={-24} y={-20} width={48} height={40} rx={3} />
    <text fill="white" fontSize="9" textAnchor="middle" dominantBaseline="middle">VR</text>
    <line {...stroke} x1={-40} y1={-12} x2={-24} y2={-12} />
    <line {...stroke} x1={-40} y1={12} x2={-24} y2={12} />
    <line {...stroke} x1={24} y1={0} x2={40} y2={0} />
  </g>
);

const Ground: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={0} y1={-20} x2={0} y2={0} />
    <line {...stroke} x1={-16} y1={0} x2={16} y2={0} />
    <line {...stroke} x1={-10} y1={6} x2={10} y2={6} />
    <line {...stroke} x1={-4} y1={12} x2={4} y2={12} />
  </g>
);

const Power: React.FC<{ rotation: number }> = () => (
  <g>
    <line {...stroke} x1={0} y1={20} x2={0} y2={0} />
    <line {...stroke} x1={-16} y1={0} x2={16} y2={0} />
    <line {...stroke} x1={-16} y1={-4} x2={16} y2={-4} />
  </g>
);

type ICProps = { rotation: number; pinCount?: number; label?: string };
const IC: React.FC<ICProps> = ({ pinCount = 8, label = 'IC' }) => {
  const halfPins = Math.ceil(pinCount / 2);
  const h = Math.max(40, halfPins * 14);
  return (
    <g>
      <rect {...filled} x={-30} y={-h / 2} width={60} height={h} rx={2} />
      <text fill="white" fontSize="9" textAnchor="middle" dominantBaseline="middle">{label}</text>
      {Array.from({ length: halfPins }).map((_, i) => {
        const y = (i - (halfPins - 1) / 2) * 14;
        return (
          <g key={`l${i}`}>
            <line {...stroke} x1={-44} y1={y} x2={-30} y2={y} />
            <text fill="#aaa" fontSize={7} x={-28} y={y + 3}>{i + 1}</text>
          </g>
        );
      })}
      {Array.from({ length: pinCount - halfPins }).map((_, i) => {
        const rightPins = pinCount - halfPins;
        const y = ((rightPins - 1 - i) - (rightPins - 1) / 2) * 14;
        const pinNum = pinCount - i;
        return (
          <g key={`r${i}`}>
            <line {...stroke} x1={30} y1={y} x2={44} y2={y} />
            <text fill="#aaa" fontSize={7} x={22} y={y + 3} textAnchor="end">{pinNum}</text>
          </g>
        );
      })}
    </g>
  );
};

type ConnProps = { rotation: number; pinCount?: number };
const Connector: React.FC<ConnProps> = ({ pinCount = 2 }) => {
  const h = pinCount * 14 + 8;
  return (
    <g>
      <rect {...filled} x={-16} y={-h / 2} width={32} height={h} rx={2} />
      {Array.from({ length: pinCount }).map((_, i) => {
        const y = (i - (pinCount - 1) / 2) * 14;
        return (
          <g key={i}>
            <circle cx={0} cy={y} r={4} fill="#c87941" />
            <line {...stroke} x1={-30} y1={y} x2={-16} y2={y} />
            <text fill="#aaa" fontSize={7} x={-18} y={y + 3} textAnchor="end">{i + 1}</text>
          </g>
        );
      })}
    </g>
  );
};

// ── Pin definitions per component type ───────────────────────────────────────

function icPins(pinCount: number): SchematicPin[] {
  const halfPins = Math.ceil(pinCount / 2);
  const rightPins = pinCount - halfPins;
  const pins: SchematicPin[] = [];
  for (let i = 0; i < halfPins; i++) {
    const y = (i - (halfPins - 1) / 2) * 14;
    pins.push({ name: String(i + 1), rx: -44, ry: y });
  }
  for (let i = 0; i < rightPins; i++) {
    const y = ((rightPins - 1 - i) - (rightPins - 1) / 2) * 14;
    pins.push({ name: String(pinCount - i), rx: 44, ry: y });
  }
  return pins;
}

function connectorPins(pinCount: number): SchematicPin[] {
  return Array.from({ length: pinCount }, (_, i) => ({
    name: String(i + 1),
    rx: -30,
    ry: (i - (pinCount - 1) / 2) * 14,
  }));
}

export const COMPONENT_DEFS: Record<ComponentType, ComponentDef> = {
  resistor: {
    width: 4, height: 1,
    pins: [{ name: '1', rx: -40, ry: 0 }, { name: '2', rx: 40, ry: 0 }],
    Symbol: Resistor,
  },
  capacitor: {
    width: 1, height: 3,
    pins: [{ name: '1', rx: 0, ry: -30 }, { name: '2', rx: 0, ry: 30 }],
    Symbol: Capacitor,
  },
  led: {
    width: 4, height: 2,
    pins: [{ name: 'A', rx: -40, ry: 0 }, { name: 'K', rx: 40, ry: 0 }],
    Symbol: LED,
  },
  diode: {
    width: 4, height: 1,
    pins: [{ name: 'A', rx: -40, ry: 0 }, { name: 'K', rx: 40, ry: 0 }],
    Symbol: Diode,
  },
  inductor: {
    width: 4, height: 1,
    pins: [{ name: '1', rx: -40, ry: 0 }, { name: '2', rx: 40, ry: 0 }],
    Symbol: Inductor,
  },
  transistor: {
    width: 4, height: 4,
    pins: [
      { name: 'B', rx: -30, ry: 0 },
      { name: 'C', rx: 10, ry: -35 },
      { name: 'E', rx: 10, ry: 35 },
    ],
    Symbol: Transistor,
  },
  crystal: {
    width: 2, height: 3,
    pins: [{ name: '1', rx: 0, ry: -30 }, { name: '2', rx: 0, ry: 30 }],
    Symbol: Crystal,
  },
  voltage_regulator: {
    width: 4, height: 2,
    pins: [
      { name: 'IN', rx: -40, ry: -12 },
      { name: 'GND', rx: -40, ry: 12 },
      { name: 'OUT', rx: 40, ry: 0 },
    ],
    Symbol: VoltageReg,
  },
  ground: {
    width: 2, height: 2,
    pins: [{ name: 'GND', rx: 0, ry: -20 }],
    Symbol: Ground,
  },
  power: {
    width: 2, height: 2,
    pins: [{ name: 'PWR', rx: 0, ry: 20 }],
    Symbol: Power,
  },
  ic: {
    width: 6, height: 5,
    pins: icPins(8),
    Symbol: (props) => <IC {...props} />,
  },
  connector: {
    width: 2, height: 3,
    pins: connectorPins(2),
    Symbol: (props) => <Connector {...props} />,
  },
};
