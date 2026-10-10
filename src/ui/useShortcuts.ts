import { useEffect } from 'react';
import { useApp } from '../core/store';

export function useShortcuts() {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  const setGizmoMode = useApp((s) => s.setGizmoMode);
  const toggleGizmoSpace = useApp((s) => s.toggleGizmoSpace);
  const gridSnap = useApp((s) => s.gridSnap);
  const setGridSnap = useApp((s) => s.setGridSnap);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const deleteSelection = useApp((s) => s.deleteSelection);
  const duplicateObject = useApp((s) => s.duplicateObject);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const pendingA = useApp((s) => s.pendingA);
  const setPendingA = useApp((s) => s.setPendingA);
  const requestFrame = useApp((s) => s.requestFrame);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selection?.type === 'object') {
          duplicateObject(selection.id);
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
        case 's':
          setTool('select');
          break;
        case 'm':
          setTool('measure');
          break;
        case 'b':
          setTool('box');
          break;
        case 'c':
          setTool('cylinder');
          break;
        case 'w':
          setGizmoMode('translate');
          break;
        case 'e':
          setGizmoMode('rotate');
          break;
        case 'q':
          toggleGizmoSpace();
          break;
        case 'g':
          setGridSnap(!gridSnap);
          break;
        case 'f':
          requestFrame();
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          deleteSelection();
          break;
        case 'escape':
          if (pendingA) {
            setPendingA(null);
          } else if (tool !== 'select') {
            setTool('select');
          } else if (selection) {
            select(null);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    tool,
    setTool,
    setGizmoMode,
    toggleGizmoSpace,
    gridSnap,
    setGridSnap,
    undo,
    redo,
    deleteSelection,
    duplicateObject,
    selection,
    select,
    pendingA,
    setPendingA,
    requestFrame,
  ]);
}
