import React, { useEffect, useMemo, useState } from "react";

const loadOrder = (storageKey, fallback) => {
  if (!storageKey) return fallback;
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
};

const saveOrder = (storageKey, order) => {
  if (!storageKey) return;
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(order));
  } catch (err) {
    // ignore
  }
};

export default function DraggableSubnav({
  items = [],
  storageKey = "",
  className = "subnav",
  itemClassName = "subnav-item",
  activeClassName = "active",
}) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [order, setOrder] = useState(() => loadOrder(storageKey, ids));
  const [dragId, setDragId] = useState(null);

  useEffect(() => {
    setOrder((prev) => {
      const next = prev.filter((id) => ids.includes(id));
      ids.forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });
  }, [ids]);

  useEffect(() => {
    saveOrder(storageKey, order);
  }, [storageKey, order]);

  const itemMap = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [items]);

  const handleDragStart = (id) => (event) => {
    setDragId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetId) => (event) => {
    event.preventDefault();
    const dragged = dragId || event.dataTransfer.getData("text/plain");
    if (!dragged || dragged === targetId) return;
    setOrder((prev) => {
      const next = prev.slice();
      const fromIndex = next.indexOf(dragged);
      const toIndex = next.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, dragged);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDragId(null);
  };

  return (
    <div className={className}>
      {order.map((id) => {
        const item = itemMap.get(id);
        if (!item) return null;
        const active = item.active ? activeClassName : "";
        const dragging = dragId === id ? "dragging" : "";
        return (
          <button
            key={id}
            className={`${itemClassName} draggable ${active} ${dragging}`.trim()}
            onClick={item.onClick}
            draggable
            onDragStart={handleDragStart(id)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(id)}
            onDragEnd={handleDragEnd}
            title="Arrastra para reordenar"
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}


