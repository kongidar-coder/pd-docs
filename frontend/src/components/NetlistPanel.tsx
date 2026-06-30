import type { Netlist } from '../types';

interface Props {
  netlist: Netlist | null;
}

export default function NetlistPanel({ netlist }: Props) {
  if (!netlist || netlist.components.length === 0) {
    return (
      <div className="p-4 text-xs text-gray-500">
        No components yet. Draw in the editor or import a file.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto">
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
          Components ({netlist.components.length})
        </h3>
        <div className="space-y-1">
          {netlist.components.map(c => (
            <div key={c.ref}
              className="flex items-center justify-between px-2 py-1 bg-pcb-bg rounded text-xs">
              <span className="font-mono text-green-400 w-12">{c.ref}</span>
              <span className="text-gray-300 flex-1 px-2 truncate">{c.value || c.type}</span>
              <span className="text-gray-500 text-right">{c.package}</span>
            </div>
          ))}
        </div>
      </div>

      {netlist.nets.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Nets ({netlist.nets.length})
          </h3>
          <div className="space-y-1">
            {netlist.nets.map(net => (
              <div key={net.name} className="px-2 py-1 bg-pcb-bg rounded text-xs">
                <span className="font-mono text-blue-400">{net.name}</span>
                <span className="text-gray-500 ml-2">
                  {net.pins.map(p => `${p.component_ref}.${p.pin_name}`).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
