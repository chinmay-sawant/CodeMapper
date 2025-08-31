import React, { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import ReactFlow, {
  Controls,
  Background,
  Position,
  Handle,
  MarkerType,
} from "reactflow";
import { toPng } from "https://esm.sh/html-to-image@1.11.11";

const CustomNode = React.memo(({ data, selected }) => {
  return React.createElement(
    "div",
    {
      className: `custom-node ${selected ? "selected" : ""}`,
    },
    React.createElement(Handle, {
      type: "target",
      position: Position.Left,
      isConnectable: false,
      style: { background: "#555" },
    }),
    React.createElement(
      "div",
      { className: "node-header" },
      data.package
    ),
    React.createElement(
      "div",
      { className: "node-body" },
      React.createElement(
        "div",
        { className: "function-name" },
        data.name
      ),
      React.createElement(
        "div",
        { className: "file-path" },
        data.filePath
      )
    ),
    React.createElement(Handle, {
      type: "source",
      position: Position.Right,
      isConnectable: false,
      style: { background: "#555" },
    })
  );
});

function getCompactLayout(nodes, edges) {
  // Create a fresh copy of nodes with reset positions
  const nodeMap = new Map(
    nodes.map((n) => [n.id, { ...n, position: { x: 0, y: 0 } }])
  );
  const adjacencyList = new Map();
  const inDegree = new Map();

  // Initialize maps
  nodes.forEach((node) => {
    adjacencyList.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  // Build adjacency list and in-degree count
  edges.forEach((edge) => {
    adjacencyList.get(edge.source).push(edge.target);
    inDegree.set(edge.target, inDegree.get(edge.target) + 1);
  });

  // Topological sort using Kahn's algorithm (avoid array.shift by using head pointer)
  const columns = [];
  const initialQueue = [];

  // Find all nodes with no incoming edges (first column)
  nodes.forEach((node) => {
    if (inDegree.get(node.id) === 0) {
      initialQueue.push(node.id);
    }
  });

  let columnIndex = 0;
  let queue = initialQueue;
  while (queue.length > 0) {
    columns[columnIndex] = [];
    const nextQueue = [];
    let head = 0;
    while (head < queue.length) {
      const nodeId = queue[head++];
      const node = nodeMap.get(nodeId);
      columns[columnIndex].push(node);

      // Process neighbors
      const neighbors = adjacencyList.get(nodeId) || [];
      for (let i = 0; i < neighbors.length; i++) {
        const neighborId = neighbors[i];
        const newInDegree = inDegree.get(neighborId) - 1;
        inDegree.set(neighborId, newInDegree);
        if (newInDegree === 0) nextQueue.push(neighborId);
      }
    }
    queue = nextQueue;
    columnIndex++;
  }

  // Handle any remaining nodes (cycles or isolated nodes)
  const processedNodes = new Set();
  columns.forEach((column) => {
    column.forEach((node) => processedNodes.add(node.id));
  });

  const remainingNodes = nodes.filter(
    (node) => !processedNodes.has(node.id)
  );
  if (remainingNodes.length > 0) {
    columns[columnIndex] = remainingNodes.map((n) => nodeMap.get(n.id));
  }

  // Ultra-compact spacing
  const HORIZONTAL_SPACING = 280;
  const VERTICAL_SPACING = 120;

  // Calculate total height for centering
  const maxColumnHeight = Math.max(...columns.map((col) => col.length));
  const totalHeight = maxColumnHeight * VERTICAL_SPACING;

  // Position nodes with proper left-to-right flow and vertical centering
  columns.forEach((columnNodes, colIndex) => {
    columnNodes.sort((a, b) => a.id.localeCompare(b.id));

    // Calculate vertical offset to center the column
    const columnHeight = columnNodes.length * VERTICAL_SPACING;
    const verticalOffset = (totalHeight - columnHeight) / 2;

    columnNodes.forEach((node, rowIndex) => {
      node.position = {
        x: colIndex * HORIZONTAL_SPACING,
        y: verticalOffset + rowIndex * VERTICAL_SPACING,
      };
    });
  });

  return Array.from(nodeMap.values());
}

const nodeTypes = { customNode: CustomNode };
const defaultEdgeOptions = {
  type: "default",
  className: "n8n-edge highlighted",
  markerEnd: { type: MarkerType.ArrowClosed },
};

// Placeholder for dynamic data injection
let pathNodes = PLACEHOLDER_NODES;
const pathEdges = PLACEHOLDER_EDGES;
pathNodes = getCompactLayout(pathNodes, pathEdges);

function PathView() {
  // Store base nodes without embedding selection flag
  const [nodes, setNodes] = React.useState(
    pathNodes.map((n) => ({ ...n })) // sanitized copy
  );
  const [selectedNodes, setSelectedNodes] = React.useState(new Set());
  const [isSelecting, setIsSelecting] = React.useState(false);
  const [selectionBox, setSelectionBox] = React.useState(null);
  const [selectionStart, setSelectionStart] = React.useState(null);
  const nodeRectsRef = React.useRef(new Map());

  const onNodesChange = React.useCallback((changes) => {
    // Only honor position changes; selection handled manually
    setNodes((nds) => {
      const copy = [...nds];
      changes.forEach((ch) => {
        if (ch.type === "position" && ch.position) {
          const i = copy.findIndex((n) => n.id === ch.id);
          if (i !== -1) copy[i] = { ...copy[i], position: ch.position };
        }
      });
      return copy;
    });
  }, []);

  const applySelectionSetToRender = React.useCallback(
    () => nodes.map((n) => ({ ...n, selected: selectedNodes.has(n.id) })),
    [nodes, selectedNodes]
  );

  const toggleSingle = React.useCallback((id) => {
    setSelectedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onNodeClick = React.useCallback(
    (e, node) => {
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        toggleSingle(node.id);
      }
    },
    [toggleSingle]
  );

  const onPaneClick = React.useCallback(
    (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        setSelectedNodes(new Set());
      }
    },
    []
  );

  const onSelectionStart = React.useCallback(
    (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.target.classList.contains("react-flow__pane")
      ) {
        e.preventDefault();
        const root = document.getElementById("root");
        if (!root) return;
        const rect = root.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        setIsSelecting(true);
        setSelectionStart({ x: startX, y: startY });
        setSelectionBox({ x: startX, y: startY, width: 0, height: 0 });

        // Cache bounding rects for all nodes once at the start of selection
        try {
          const map = new Map();
          nodes.forEach((n) => {
            const el = document.querySelector(
              `[data-id="${n.id.replace(/"/g, '\\\"')}"]`
            );
            if (!el) return;
            const r = el.getBoundingClientRect();
            map.set(n.id, { left: r.left, top: r.top, width: r.width, height: r.height });
          });
          nodeRectsRef.current = map;
        } catch (err) {
          nodeRectsRef.current = new Map();
        }
      }
    },
    [nodes]
  );

  const computeDragSelection = React.useCallback(
    (box, baseSet) => {
      const root = document.getElementById("root");
      if (!root) return baseSet;
      const rootRect = root.getBoundingClientRect();
      const next = new Set(baseSet);
      nodes.forEach((n) => {
        const cached = nodeRectsRef.current.get(n.id);
        let x, y, w, h;
        if (cached) {
          x = cached.left - rootRect.left;
          y = cached.top - rootRect.top;
          w = cached.width;
          h = cached.height;
        } else {
          const el = document.querySelector(
            `[data-id="${n.id.replace(/"/g, '\\\"')}"]`
          );
          if (!el) return;
          const r = el.getBoundingClientRect();
          x = r.left - rootRect.left;
          y = r.top - rootRect.top;
          w = r.width;
          h = r.height;
        }
        if (
          x < box.x + box.width &&
          x + w > box.x &&
          y < box.y + box.height &&
          y + h > box.y
        ) {
          next.add(n.id);
        }
      });
      return next;
    },
    [nodes]
  );

  const onSelectionDrag = React.useCallback(
    (e) => {
      if (!isSelecting || !selectionStart) return;
      e.preventDefault();
      const root = document.getElementById("root");
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      const x = Math.min(selectionStart.x, curX);
      const y = Math.min(selectionStart.y, curY);
      const width = Math.abs(curX - selectionStart.x);
      const height = Math.abs(curY - selectionStart.y);
      const box = { x, y, width, height };
      setSelectionBox(box);
      if (width > 4 && height > 4) {
        // Live update additive selection
        setSelectedNodes((prev) => computeDragSelection(box, prev));
      }
    },
    [isSelecting, selectionStart, computeDragSelection]
  );

  const finishSelection = React.useCallback(() => {
    setIsSelecting(false);
    setSelectionBox(null);
    setSelectionStart(null);
    nodeRectsRef.current = new Map();
  }, []);

  React.useEffect(() => {
    const mm = (e) => {
      if (isSelecting) onSelectionDrag(e);
    };
    const mu = () => {
      if (isSelecting) finishSelection();
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
    return () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
  }, [isSelecting, onSelectionDrag, finishSelection]);

  return React.createElement(
    "div",
    {
      style: { width: "100%", height: "100%", position: "relative" },
      onMouseDown: onSelectionStart,
    },
    selectionBox &&
      React.createElement("div", {
        className: "selection-box",
        style: {
          left: selectionBox.x + "px",
          top: selectionBox.y + "px",
          width: selectionBox.width + "px",
          height: selectionBox.height + "px",
        },
      }),
    React.createElement(
      ReactFlow,
      {
        nodes: applySelectionSetToRender(),
        edges: pathEdges,
        onNodesChange: onNodesChange,
        nodeTypes: nodeTypes,
        onNodeClick: onNodeClick,
        onPaneClick: onPaneClick,
        fitView: true,
        fitViewOptions: { padding: 0.15, maxZoom: 1.0, minZoom: 0.3 },
        defaultEdgeOptions: defaultEdgeOptions,
        nodesDraggable: true,
        nodesConnectable: false,
        elementsSelectable: false,
        selectNodesOnDrag: false,
        proOptions: { hideAttribution: true },
        minZoom: 0.1,
        maxZoom: 3,
      },
      React.createElement(Controls),
      React.createElement(Background, {
        variant: "dots",
        gap: 12,
        size: 1,
      })
    )
  );
}

const root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(PathView)
  )
);

// Enhanced export button handler with improved quality
document.getElementById("exportBtn").onclick = function () {
  const viewport = document.querySelector(".react-flow__viewport");
  if (!viewport) return;

  // Calculate dimensions for high DPI
  const pixelRatio = window.devicePixelRatio || 2;
  const width = viewport.scrollWidth * pixelRatio;
  const height = viewport.scrollHeight * pixelRatio;

  toPng(viewport, {
    backgroundColor: "#1a192b",
    width: width,
    height: height,
    pixelRatio: pixelRatio,
    quality: 1.0,
    canvasWidth: width,
    canvasHeight: height,
    style: {
      transform: "scale(" + pixelRatio + ")",
      transformOrigin: "top left",
    },
  })
    .then((dataUrl) => {
      const link = document.createElement("a");
      link.download = "codemapper-path-hq.png";
      link.href = dataUrl;
      link.click();
    })
    .catch((err) => {
      console.error("Failed to export PNG:", err);
    });
};
