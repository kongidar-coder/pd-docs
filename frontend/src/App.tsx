import { useState, useCallback } from 'react';
import ComponentPalette from './components/ComponentPalette';
import SchematicEditor from './components/SchematicEditor';
import FileUpload from './components/FileUpload';
import PCBViewer from './components/PCBViewer';
import ExportPanel from './components/ExportPanel';
import NetlistPanel from './components/NetlistPanel';
import type { Tool, Netlist, PCBLayout } from './types';

type Tab = 'schematic' | 'pcb';

export default function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [activeTab, setActiveTab] = useState<Tab>('schematic');
  const [netlist, setNetlist] = useState<Netlist | null>(null);
  const [importedNetlist, setImportedNetlist] = useState<Netlist | null>(null);
  const [layout, setLayout] = useState<PCBLayout | null>(null);
  const [pcbLoading, setPcbLoading] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleNetlistFromEditor = useCallback((nl: Netlist) => {
    if (!importedNetlist) {
      setNetlist(nl);
    }
  }, [importedNetlist]);

  const handleImport = useCallback((nl: Netlist, msg: string) => {
    setImportedNetlist(nl);
    setNetlist(nl);
    setImportMsg(msg);
    setActiveTab('schematic');
  }, []);

  const handleLayoutReady = useCallback((l: PCBLayout) => {
    setLayout(l);
    setActiveTab('pcb');
  }, []);

  const clearImport = () => {
    setImportedNetlist(null);
    setImportMsg(null);
  };

  const effectiveNetlist = importedNetlist ?? netlist;

  return (
    <div className="flex flex-col h-screen bg-pcb-bg text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-pcb-panel border-b border-pcb-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-pcb-accent tracking-tight">PCB Design Tool</span>
          <span className="text-xs text-gray-500">Schematic → Layout → Gerbers</span>
        </div>
        <div className="flex gap-1">
          {(['schematic', 'pcb'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded text-sm capitalize transition-colors
                ${activeTab === tab
                  ? 'bg-pcb-accent text-white'
                  : 'text-gray-400 hover:text-white hover:bg-pcb-border'}`}
            >
              {tab === 'schematic' ? 'Schematic Editor' : 'PCB Layout'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex flex-col w-44 shrink-0 bg-pcb-panel border-r border-pcb-border overflow-y-auto">
          <FileUpload onNetlist={handleImport} />
          {importedNetlist && (
            <div className="px-3 py-2 border-b border-pcb-border">
              <div className="text-xs text-green-400 mb-1">{importMsg}</div>
              <button
                onClick={clearImport}
                className="text-xs text-gray-500 hover:text-gray-300 underline"
              >
                Use editor instead
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'schematic'
              ? <ComponentPalette activeTool={activeTool} onSelectTool={setActiveTool} />
              : (
                <div className="p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">
                    Netlist
                  </p>
                  <NetlistPanel netlist={effectiveNetlist} />
                </div>
              )
            }
          </div>
          <ExportPanel
            netlist={effectiveNetlist}
            layout={layout}
            onLayout={handleLayoutReady}
            onLoading={setPcbLoading}
          />
        </div>

        {/* Main canvas area */}
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'schematic' ? (
            <SchematicEditor
              activeTool={activeTool}
              onNetlistChange={handleNetlistFromEditor}
            />
          ) : (
            <PCBViewer layout={layout} loading={pcbLoading} />
          )}
        </main>
      </div>
    </div>
  );
}
