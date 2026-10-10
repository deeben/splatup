import { useEffect, useState } from 'react';
import { useApp } from '../core/store';
import { importProjectFile } from '../core/persist';
import { Icon } from './Icon';

export function DropOverlay() {
  const [isDragging, setIsDragging] = useState(false);
  const addScan = useApp((s) => s.addScan);
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    let counter = 0;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      counter++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      counter--;
      if (counter <= 0) {
        setIsDragging(false);
        counter = 0;
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      counter = 0;

      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        if (file.name.endsWith('.splatup') || file.name.endsWith('.zip')) {
          try {
            setStatus(`Opening ${file.name}…`);
            await importProjectFile(file);
            setStatus(`Loaded project ${file.name}`);
          } catch (err) {
            console.error(err);
            setStatus(`Failed to open project: ${(err as Error).message}`);
          }
        } else if (file.name.toLowerCase().endsWith('.glb')) {
          addScan(file, file.name);
          setStatus(`Importing scan ${file.name}…`);
        } else {
          setStatus(`Unsupported file type: ${file.name} (use .glb or .splatup)`);
        }
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [addScan, setStatus]);

  if (!isDragging) return null;

  return (
    <div className="drop-overlay">
      <div className="drop-card">
        <Icon name="import" size={48} />
        <h2>Drop 3D Scan or Project</h2>
        <p>Supports .glb (Scaniverse exports) and .splatup packages</p>
      </div>
    </div>
  );
}
