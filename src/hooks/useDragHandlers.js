import { useCallback, useEffect, useRef } from "react";
import usePlayerStore from "../store/usePlayerStore";

// drag-over / drag-leave / drop for the whole player; the overlay state
// lives in the store, the dropped files are handed to the actions
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

  useEffect(() => clearPending, [clearPending]);

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearPending();
      setIsDragging(true);
      setDragTarget(actions.getDropTarget(e));
      // dragover keeps firing while hovering; when it stops, the drag ended
      timeoutRef.current = setTimeout(() => {
        setIsDragging(false);
        setDragTarget(null);
      }, 100);
    },
    [actions, clearPending, setIsDragging, setDragTarget]
  );

  const handleDragLeave = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === e.target) {
        setIsDragging(false);
        setDragTarget(null);
        clearPending();
      }
    },
    [clearPending, setIsDragging, setDragTarget]
  );

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setDragTarget(null);
      clearPending();

      const dropped = Array.from(e.dataTransfer.files || []);
      if (dropped.length === 0) return;
      const target = actions.getDropTarget(e) || "playlist";
      await actions.handleDroppedFiles(dropped, target);
    },
    [actions, clearPending, setIsDragging, setDragTarget]
  );

  return { handleDragOver, handleDragLeave, handleDrop };
}
