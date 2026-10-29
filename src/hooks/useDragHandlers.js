import { useCallback, useEffect, useRef } from "react";
import usePlayerStore from "../store/usePlayerStore";
import platform from "../platform";

// drag-over / drag-leave / drop for the whole player. two kinds of drags
// arrive here: real ones from outside puter (dragover fires continuously
// and the drop carries a DataTransfer), and items dragged out of the puter
// desktop, which puter.js relays as bare dragenter/dragleave events plus a
// `drop` CustomEvent that the platform turns into onPuterDrop.
export function useDragHandlers(actions) {
  const setIsDragging = usePlayerStore((s) => s.setIsDragging);
  const setDragTarget = usePlayerStore((s) => s.setDragTarget);
  const timeoutRef = useRef(null);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearDragState = useCallback(() => {
    setIsDragging(false);
    setDragTarget(null);
    clearPending();
  }, [clearPending, setIsDragging, setDragTarget]);

  useEffect(() => clearPending, [clearPending]);

  // the overlay disappears once the events stop; a real drag refreshes it
  // on every dragover, a puter drag on every element change
  const showDragging = useCallback(
    (target, idleMs) => {
      clearPending();
      setIsDragging(true);
      setDragTarget(target);
      timeoutRef.current = setTimeout(() => {
        setIsDragging(false);
        setDragTarget(null);
      }, idleMs);
    },
    [clearPending, setIsDragging, setDragTarget]
  );

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDragging(actions.getDropTarget(e), 100);
    },
    [actions, showDragging]
  );

  // puter drags: no coordinates, so the target is the area under e.target
  const handleDragEnter = useCallback(
    (e) => {
      if (e.dataTransfer) return; // a real drag; dragover handles it
      showDragging(actions.getDropTargetForElement(e.target), 1200);
    },
    [actions, showDragging]
  );

  const handleDragLeave = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === e.target) clearDragState();
    },
    [clearDragState]
  );

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // puter relays its own drops as a CustomEvent without a DataTransfer;
      // those reach us through onPuterDrop below
      if (!e.dataTransfer) return;
      const target = actions.getDropTarget(e) || "playlist";
      clearDragState();
      await actions.handleDroppedFiles(e.dataTransfer, target);
    },
    [actions, clearDragState]
  );

  useEffect(() => {
    const unsubscribe = platform.onPuterDrop(({ paths, clientX, clientY }) => {
      const target =
        typeof clientX === "number" && typeof clientY === "number"
          ? actions.getDropTarget({ clientX, clientY })
          : null;
      clearDragState();
      actions.handleDroppedPaths(paths, target || "playlist");
    });
    return unsubscribe;
  }, [actions, clearDragState]);

  return { handleDragOver, handleDragEnter, handleDragLeave, handleDrop };
}
