import type { Tool } from '../types';

interface Props {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

const CATEGORIES: { label: string; tools: Array<{ tool: Tool; label: string }> }[] = [
  {
    label: 'Tools',
    tools: [
      { tool: 'select', label: 'Select' },
      { tool: 'wire', label: 'Wire' },
    ],
  },
  {
    label: 'Passives',
    tools: [
      { tool: 'resistor', label: 'Resistor' },
      { tool: 'capacitor', label: 'Capacitor' },
      { tool: 'inductor', label: 'Inductor' },
    ],
  },
  {
    label: 'Semiconductors',
    tools: [
      { tool: 'led', label: 'LED' },
      { tool: 'diode', label: 'Diode' },
      { tool: 'transistor', label: 'Transistor' },
      { tool: 'ic', label: 'IC / Chip' },
      { tool: 'voltage_regulator', label: 'Volt. Reg.' },
    ],
  },
  {
    label: 'Other',
    tools: [
      { tool: 'connector', label: 'Connector' },
      { tool: 'crystal', label: 'Crystal' },
      { tool: 'ground', label: 'Ground' },
      { tool: 'power', label: 'VCC/PWR' },
    ],
  },
];

const TOOL_ICONS: Record<string, string> = {
  select: '↖',
  wire: '〜',
  resistor: '⊟',
  capacitor: '⊣⊢',
  inductor: '∿',
  led: '▷|',
  diode: '▷|',
  transistor: 'Q',
  ic: '▬',
  voltage_regulator: 'VR',
  connector: '⊕',
  crystal: 'Y',
  ground: '⏚',
  power: '⏶',
};

export default function ComponentPalette({ activeTool, onSelectTool }: Props) {
  return (
    <aside className="w-44 bg-pcb-panel border-r border-pcb-border flex flex-col gap-4 p-3 overflow-y-auto">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Components</h2>
      {CATEGORIES.map(cat => (
        <div key={cat.label}>
          <p className="text-xs text-gray-500 mb-1">{cat.label}</p>
          <div className="flex flex-col gap-1">
            {cat.tools.map(({ tool, label }) => (
              <button
                key={tool}
                onClick={() => onSelectTool(tool)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors
                  ${activeTool === tool
                    ? 'bg-pcb-accent text-white'
                    : 'text-gray-300 hover:bg-pcb-border'}`}
              >
                <span className="w-6 text-center font-mono text-xs">{TOOL_ICONS[tool] ?? '?'}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}
