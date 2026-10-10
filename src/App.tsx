import { useEffect, useState } from 'react';
import { Viewport } from './viewport/Viewport';
import { Toolbar } from './ui/Toolbar';
import { Sidebar } from './ui/Sidebar';
import { PropertyPanel } from './ui/PropertyPanel';
import { Header } from './ui/Header';
import { StatusBar } from './ui/StatusBar';
import { DropOverlay } from './ui/DropOverlay';
import { useShortcuts } from './ui/useShortcuts';
import { restoreAutosave, startAutosave } from './core/persist';
import { useApp } from './core/store';
import { Icon } from './ui/Icon';

export function App() {
  useShortcuts();
  const [ready, setReady] = useState(false);
  const scansCount = useApp((s) => s.doc.scans.length);
  const objectsCount = useApp((s) => s.doc.objects.length);
  const addScan = useApp((s) => s.addScan);
  const setStatus = useApp((s) => s.setStatus);
  const [loadingSample, setLoadingSample] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await restoreAutosave();
      } catch (e) {
        console.warn('Could not restore autosave:', e);
      } finally {
        setReady(true);
      }
    })();
    const unsub = startAutosave();
    return () => unsub();
  }, []);

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setStatus('Loading sample scan 851.glb…');
    try {
      const res = await fetch('/samples/851.glb');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const blob = await res.blob();
      addScan(blob, '851.glb');
      setStatus('Sample scan 851.glb loaded successfully');
    } catch (err) {
      console.error(err);
      setStatus(`Failed to load sample: ${(err as Error).message}`);
    } finally {
      setLoadingSample(false);
    }
  };

  const showWelcome = ready && scansCount === 0 && objectsCount === 0;

  return (
    <div className="splatup-app">
      <Header />

      <main className="main-workspace">
        <Sidebar />

        <div className="viewport-container">
          <Viewport />
          <Toolbar />

          {showWelcome && (
            <div className="welcome-overlay">
              <div className="welcome-card">
                <div className="welcome-badge">BROWSER-BASED 3D CAD</div>
                <h1>Welcome to SplatUp</h1>
                <p>
                  Import 3D scans from iPhone (Scaniverse), take exact point-to-point and clearance measurements,
                  and block model retrofits with millimeter precision.
                </p>

                <div className="welcome-actions">
                  <button
                    type="button"
                    className="welcome-btn primary"
                    onClick={handleLoadSample}
                    disabled={loadingSample}
                  >
                    <Icon name="scan" size={20} />
                    <span>{loadingSample ? 'Loading 851.glb…' : 'Load Sample Scan (851.glb)'}</span>
                  </button>

                  <label className="welcome-btn secondary">
                    <Icon name="import" size={20} />
                    <span>Import GLB Scan</span>
                    <input
                      type="file"
                      accept=".glb"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) addScan(f, f.name);
                      }}
                    />
                  </label>
                </div>

                <div className="welcome-shortcuts">
                  <div><strong>M</strong> Measure</div>
                  <div><strong>B</strong> Box / Duct</div>
                  <div><strong>C</strong> Cylinder / Pipe</div>
                  <div><strong>F</strong> Center Camera</div>
                  <div><strong>Shift</strong> Axis Lock</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <PropertyPanel />
      </main>

      <StatusBar />
      <DropOverlay />
    </div>
  );
}
