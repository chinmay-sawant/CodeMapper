import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';

// Memoized CustomNode component for performance
const CustomNode = React.memo(({ data, selected }) => {
    return React.createElement(
        'div',
        { 
            className: `custom-node ${selected ? 'selected' : ''}`
        },
        React.createElement(Handle, {
            type: 'target',
            position: Position.Left,
            isConnectable: false,
            style: { background: '#555' }
        }),
        React.createElement('div', { className: 'node-header' }, data.package),
        React.createElement(
            'div',
            { className: 'node-body' },
            React.createElement('div', { className: 'function-name' }, data.name),
            React.createElement('div', { className: 'file-path' }, data.filePath)
        ),
        React.createElement(Handle, {
            type: 'source',
            position: Position.Right,
            isConnectable: false,
            style: { background: '#555' }
        })
    );
});

const nodeTypes = { customNode: CustomNode };

function Flow() {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentlyClickedNode, setCurrentlyClickedNode] = useState(null);
    const [highlightedPath, setHighlightedPath] = useState({ nodes: new Set(), edges: new Set() });
    const [selectedNodes, setSelectedNodes] = useState(new Set());
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionBox, setSelectionBox] = useState(null);
    const [selectionStart, setSelectionStart] = useState(null);
    // Cache of latest node bounding rects to avoid repeated layout reads during drag
    const nodeRectsRef = useRef(new Map());

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    // Precompute incoming/outgoing edge maps when edges change to avoid rebuilding them on every click
    const { incomingEdgesMap, outgoingEdgesMap } = useMemo(() => {
        const incoming = new Map();
        const outgoing = new Map();
        edges.forEach(edge => {
            if (!incoming.has(edge.target)) incoming.set(edge.target, []);
            incoming.get(edge.target).push(edge);
            if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
            outgoing.get(edge.source).push(edge);
        });
        return { incomingEdgesMap: incoming, outgoingEdgesMap: outgoing };
    }, [edges]);

    const findPathToRoot = useCallback((targetNodeId) => {
        const pathNodes = new Set([targetNodeId]);
        const pathEdges = new Set();
        const queue = [targetNodeId];
        let head = 0; // avoid queue.shift()
        const visited = new Set([targetNodeId]);

        while (head < queue.length) {
            const currentNodeId = queue[head++];
            const incoming = incomingEdgesMap.get(currentNodeId) || [];
            for (const edge of incoming) {
                if (!visited.has(edge.source)) {
                    visited.add(edge.source);
                    pathNodes.add(edge.source);
                    pathEdges.add(edge.id);
                    queue.push(edge.source);
                }
            }
        }
        return { pathNodes, pathEdges };
    }, [incomingEdgesMap]);

    const findForwardPath = useCallback((sourceNodeId) => {
        const pathNodes = new Set([sourceNodeId]);
        const pathEdges = new Set();
        const queue = [sourceNodeId];
        let head = 0; // avoid queue.shift()
        const visited = new Set([sourceNodeId]);

        while (head < queue.length) {
            const currentNodeId = queue[head++];
            const outgoing = outgoingEdgesMap.get(currentNodeId) || [];
            for (const edge of outgoing) {
                if (!visited.has(edge.target)) {
                    visited.add(edge.target);
                    pathNodes.add(edge.target);
                    pathEdges.add(edge.id);
                    queue.push(edge.target);
                }
            }
        }
        return { pathNodes, pathEdges };
    }, [outgoingEdgesMap]);

    const isRootNode = useCallback((nodeId, currentEdges) => {
        return !currentEdges.some(edge => edge.target === nodeId);
    }, []);

    const onNodeClick = useCallback((event, node) => {
        if (event.ctrlKey || event.metaKey) {
            // Multi-select mode
            setSelectedNodes(prev => {
                const newSet = new Set(prev);
                if (newSet.has(node.id)) {
                    newSet.delete(node.id);
                } else {
                    newSet.add(node.id);
                }
                return newSet;
            });
            return;
        }

        // Clear any selections when clicking normally
        setSelectedNodes(new Set());

        if (currentlyClickedNode === node.id) {
            clearHighlights();
            return;
        }

        let pathNodes, pathEdges;
        
        // Check if this is a root node (no incoming edges)
        if (isRootNode(node.id, edges)) {
            // For root nodes, highlight all forward connections
            const result = findForwardPath(node.id);
            pathNodes = result.pathNodes;
            pathEdges = result.pathEdges;
        } else {
            // For non-root nodes, highlight backward path to root
            const result = findPathToRoot(node.id);
            pathNodes = result.pathNodes;
            pathEdges = result.pathEdges;
        }

        setHighlightedPath({ nodes: pathNodes, edges: pathEdges });

        setNodes(currentNodes =>
            currentNodes.map(n => {
                const shouldBeHighlighted = pathNodes.has(n.id);
                const isHighlighted = !!n.data.highlighted;
                if (shouldBeHighlighted !== isHighlighted) {
                    return { ...n, data: { ...n.data, highlighted: shouldBeHighlighted } };
                }
                return n;
            })
        );

        setEdges(currentEdges =>
            currentEdges.map(edge => {
                const shouldBeHighlighted = pathEdges.has(edge.id);
                const isHighlighted = (edge.className || '').includes('highlighted');
                if (shouldBeHighlighted !== isHighlighted) {
                    return { ...edge, className: shouldBeHighlighted ? 'n8n-edge highlighted' : 'n8n-edge' };
                }
                return edge;
            })
        );

        setCurrentlyClickedNode(node.id);
    }, [edges, findPathToRoot, findForwardPath, isRootNode, currentlyClickedNode]);

    const clearHighlights = useCallback(() => {
        setCurrentlyClickedNode(null);
        setHighlightedPath({ nodes: new Set(), edges: new Set() });
        setSelectedNodes(new Set());
        setNodes(nds => nds.map(n => n.data.highlighted ? { ...n, data: { ...n.data, highlighted: false } } : n));
        setEdges(eds => eds.map(e => (e.className || '').includes('highlighted') ? { ...e, className: 'n8n-edge' } : e));
    }, []);

    const onPaneClick = useCallback((event) => {
        if (currentlyClickedNode) {
            clearHighlights();
        }
        if (!event.ctrlKey && !event.metaKey) {
            setSelectedNodes(new Set());
        }
    }, [currentlyClickedNode, clearHighlights]);

    const onSelectionStart = useCallback((event) => {
        if ((event.ctrlKey || event.metaKey) && event.target.classList.contains('react-flow__pane')) {
            event.preventDefault();
            const root = document.getElementById('root');
            if (!root) return;
            const rect = root.getBoundingClientRect();
            const startX = event.clientX - rect.left;
            const startY = event.clientY - rect.top;
            setIsSelecting(true);
            setSelectionStart({ x: startX, y: startY });
            setSelectionBox({ x: startX, y: startY, width: 0, height: 0 });
        }
    }, []);

    const computeDragSelection = useCallback((box, baseSet) => {
        const root = document.getElementById('root');
        if (!root) return baseSet;
        const rootRect = root.getBoundingClientRect();
        const next = new Set(baseSet);
        nodes.forEach((n) => {
            // Use cached rects when available to avoid repeated layout reads
            const cached = nodeRectsRef.current.get(n.id);
            let x, y, w, h;
            if (cached) {
                x = cached.left - rootRect.left;
                y = cached.top - rootRect.top;
                w = cached.width;
                h = cached.height;
            } else {
                const el = document.querySelector(`[data-id="${n.id.replace(/\"/g, '\\\"')}"]`);
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
    }, [nodes]);

    const onSelectionDrag = useCallback((event) => {
        if (!isSelecting || !selectionStart) return;
        event.preventDefault();
        const root = document.getElementById('root');
        if (!root) return;
        const rect = root.getBoundingClientRect();
        const curX = event.clientX - rect.left;
        const curY = event.clientY - rect.top;
            setIsSelecting(true);
        const y = Math.min(selectionStart.y, curY);
        const width = Math.abs(curX - selectionStart.x);

            // Cache bounding rects for all nodes once at the start of selection to avoid DOM thrash
            try {
                const map = new Map();
                const rootRect = root.getBoundingClientRect();
                nodes.forEach((n) => {
                    const el = document.querySelector(`[data-id="${n.id.replace(/\"/g, '\\\"')}"]`);
                    if (!el) return;
                    const r = el.getBoundingClientRect();
                    // store absolute coords (left/top) so later we can subtract root rect
                    map.set(n.id, { left: r.left, top: r.top, width: r.width, height: r.height });
                });
                nodeRectsRef.current = map;
            } catch (e) {
                // ignore caching failures and fall back to live reads
                nodeRectsRef.current = new Map();
            }
        const height = Math.abs(curY - selectionStart.y);
        const box = { x, y, width, height };
        setSelectionBox(box);
        if (width > 4 && height > 4) {
            // Live update additive selection
            setSelectedNodes((prev) => computeDragSelection(box, prev));
        }
    }, [isSelecting, selectionStart, computeDragSelection]);

    const finishSelection = useCallback(() => {
        setIsSelecting(false);
        setSelectionBox(null);
        setSelectionStart(null);
    // Clear cached rects to free memory and ensure fresh reads next time
    nodeRectsRef.current = new Map();
    }, []);

    // Handle mouse events on document to capture drags outside the pane
    useEffect(() => {
        const mm = (e) => {
            if (isSelecting) onSelectionDrag(e);
        };
        const mu = () => {
            if (isSelecting) finishSelection();
        };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
        return () => {
            document.removeEventListener('mousemove', mm);
            document.removeEventListener('mouseup', mu);
        };
    }, [isSelecting, onSelectionDrag, finishSelection]);

     const openPathInNewWindow = useCallback(async () => {
        if (highlightedPath.nodes.size === 0) return;

        const filteredNodes = nodes.filter(node => highlightedPath.nodes.has(node.id));
        const filteredEdges = edges.filter(edge => highlightedPath.edges.has(edge.id));

        try {
            // Load the HTML template
            const response = await fetch('/path-view/');
            if (!response.ok) {
                throw new Error(`Failed to load template: ${response.status}`);
            }
            let htmlContent = await response.text();
            
            // Replace placeholders with actual data
            htmlContent = htmlContent.replace(
                'PLACEHOLDER_NODES', 
                JSON.stringify(filteredNodes)
            );
            htmlContent = htmlContent.replace(
                'PLACEHOLDER_EDGES', 
                JSON.stringify(filteredEdges)
            );

            const newWindow = window.open('', '_blank', 'width=1400,height=900,scrollbars=yes,resizable=yes');
            if (newWindow) {
                newWindow.document.write(htmlContent);
                newWindow.document.close();
            }
        } catch (error) {
            console.error('Failed to open path in new window:', error);
            // Fallback: show error message
            alert('Failed to load path view template. Please check that path-view/ is available.');
        }
    }, [nodes, edges, highlightedPath]);

    const defaultEdgeOptions = useMemo(() => ({
        type: 'default', // Changed from 'smoothstep' to 'default' for Bezier curves
        className: 'n8n-edge',
        markerEnd: {
            type: MarkerType.ArrowClosed,
        },
    }), []);

    useEffect(() => {
        setIsLoading(true);
        // *** THIS IS THE FIX ***
        // Load the worker from the public folder using a root-relative path.
        const worker = new Worker('/layout.worker.js');

        worker.onmessage = (event) => {
            const { initialNodes, initialEdges } = event.data;
            setNodes(initialNodes);
            setEdges(initialEdges);
            setIsLoading(false);
            worker.terminate();
        };

        worker.onerror = (event) => {
            event.preventDefault();
            console.error(
                `WORKER SCRIPT ERROR:\n` +
                `This error usually means the worker file ('/layout.worker.js') could not be found or has a syntax error.\n`+
                `- Message: ${event.message}\n` +
                `- Filename: ${event.filename}\n` +
                `- Line: ${event.lineno}`
            );
            setNodes([{ 
                id: 'worker-error', 
                type: 'customNode', 
                data: { package: 'Error', name: 'Worker script failed to load', filePath: 'Check console and network tab for details.' }, 
                position: { x: 0, y: 0 } 
            }]);
            setIsLoading(false);
            worker.terminate();
        };

        async function fetchData() {
            try {
                const response = await fetch('/api/codemap');
                if (!response.ok) {
                    throw new Error(`API request failed with status: ${response.status}`);
                }
                const mappings = await response.json();
                worker.postMessage(mappings);
            } catch (error) {
                console.error("Failed to fetch API data:", error);
                setNodes([{ 
                    id: 'api-error', 
                    type: 'customNode', 
                    data: { package: 'API Error', name: 'Could not load data from server', filePath: error.message }, 
                    position: { x: 0, y: 0 } 
                }]);
                setIsLoading(false);
                worker.terminate();
            }
        }

        fetchData();
        
        return () => {
            worker.terminate();
        };
    }, []);

    if (isLoading) {
        return React.createElement('div', { className: 'loading-indicator' }, 'Processing large dataset, please wait...');
    }

    return React.createElement(
        'div',
        { 
            style: { width: '100%', height: '100%', position: 'relative' },
            onMouseDown: onSelectionStart
        },
        selectionBox && React.createElement('div', {
            className: 'selection-box',
            style: {
                left: selectionBox.x + 'px',
                top: selectionBox.y + 'px',
                width: selectionBox.width + 'px',
                height: selectionBox.height + 'px'
            }
        }),
        currentlyClickedNode && React.createElement(
            'div',
            { className: 'path-controls' },
            React.createElement(
                'button',
                {
                    className: 'path-button primary',
                    onClick: openPathInNewWindow,
                    title: 'Open highlighted path in new window'
                },
                '🔗 View Path'
            ),
            React.createElement(
                'button',
                {
                    className: 'path-button export',
                    onClick: () => {
                        const viewport = document.querySelector('.react-flow__viewport');
                        if (!viewport) return;
                        
                        // Enhanced export with high quality
                        import('https://esm.sh/html-to-image@1.11.11').then(({ toPng }) => {
                            const pixelRatio = window.devicePixelRatio || 2;
                            const width = viewport.scrollWidth * pixelRatio;
                            const height = viewport.scrollHeight * pixelRatio;
                            
                            toPng(viewport, {
                                backgroundColor: '#1a192b',
                                width: width,
                                height: height,
                                pixelRatio: pixelRatio,
                                quality: 1.0,
                                canvasWidth: width,
                                canvasHeight: height,
                                style: {
                                    transform: 'scale(' + pixelRatio + ')',
                                    transformOrigin: 'top left'
                                }
                            }).then((dataUrl) => {
                                const link = document.createElement('a');
                                link.download = 'codemapper-full-view-hq.png';
                                link.href = dataUrl;
                                link.click();
                            }).catch(err => {
                                console.error('Failed to export PNG:', err);
                            });
                        });
                    },
                    title: 'Export current view as high-quality PNG'
                },
                '📷 Export PNG'
            ),
            React.createElement(
                'button',
                {
                    className: 'path-button secondary',
                    onClick: clearHighlights,
                    title: 'Clear highlights'
                },
                '✕ Clear'
            )
        ),
        React.createElement(
            ReactFlow,
            {
                nodes: nodes.map(node => ({
                    ...node,
                    selected: selectedNodes.has(node.id)
                })),
                edges: edges,
                onNodesChange: onNodesChange,
                onEdgesChange: onEdgesChange,
                onNodeClick: onNodeClick,
                onPaneClick: onPaneClick,
                nodeTypes: nodeTypes,
                fitView: true,
                fitViewOptions: { padding: 0.1 },
                defaultEdgeOptions: defaultEdgeOptions,
                nodesDraggable: true,
                nodesConnectable: false,
                elementsSelectable: false,
                selectNodesOnDrag: false,
                onlyRenderVisibleElements: false,
                proOptions: { hideAttribution: true },
                minZoom: 0.001
            },
            React.createElement(Controls),
            React.createElement(Background, { variant: 'dots', gap: 12, size: 1 })
        )
    );
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(React.StrictMode, null, React.createElement(Flow)));