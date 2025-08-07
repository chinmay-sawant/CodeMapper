import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
const CustomNode = React.memo(({ data }) => {
    return React.createElement(
        'div',
        {
            className: 'custom-node',
            style: data.highlighted ? {
                border: '2px solid #ffd700',
                boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)'
            } : {}
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

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    const findPathToRoot = useCallback((targetNodeId, currentEdges) => {
        const pathNodes = new Set([targetNodeId]);
        const pathEdges = new Set();
        const queue = [targetNodeId];
        const visited = new Set([targetNodeId]);

        const incomingEdgesMap = new Map();
        currentEdges.forEach(edge => {
            if (!incomingEdgesMap.has(edge.target)) {
                incomingEdgesMap.set(edge.target, []);
            }
            incomingEdgesMap.get(edge.target).push(edge);
        });

        while (queue.length > 0) {
            const currentNodeId = queue.shift();
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
    }, []);

    const findForwardPath = useCallback((sourceNodeId, currentEdges) => {
        const pathNodes = new Set([sourceNodeId]);
        const pathEdges = new Set();
        const queue = [sourceNodeId];
        const visited = new Set([sourceNodeId]);

        const outgoingEdgesMap = new Map();
        currentEdges.forEach(edge => {
            if (!outgoingEdgesMap.has(edge.source)) {
                outgoingEdgesMap.set(edge.source, []);
            }
            outgoingEdgesMap.get(edge.source).push(edge);
        });

        while (queue.length > 0) {
            const currentNodeId = queue.shift();
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
    }, []);

    const isRootNode = useCallback((nodeId, currentEdges) => {
        return !currentEdges.some(edge => edge.target === nodeId);
    }, []);

    const onNodeClick = useCallback((event, node) => {
        if (currentlyClickedNode === node.id) {
            clearHighlights();
            return;
        }

        let pathNodes, pathEdges;
        
        // Check if this is a root node (no incoming edges)
        if (isRootNode(node.id, edges)) {
            // For root nodes, highlight all forward connections
            const result = findForwardPath(node.id, edges);
            pathNodes = result.pathNodes;
            pathEdges = result.pathEdges;
        } else {
            // For non-root nodes, highlight backward path to root
            const result = findPathToRoot(node.id, edges);
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
        setNodes(nds => nds.map(n => n.data.highlighted ? { ...n, data: { ...n.data, highlighted: false } } : n));
        setEdges(eds => eds.map(e => (e.className || '').includes('highlighted') ? { ...e, className: 'n8n-edge' } : e));
    }, []);

    const onPaneClick = useCallback(() => {
        if (currentlyClickedNode) {
            clearHighlights();
        }
    }, [currentlyClickedNode, clearHighlights]);

    const openPathInNewWindow = useCallback(() => {
        if (highlightedPath.nodes.size === 0) return;

        const filteredNodes = nodes.filter(node => highlightedPath.nodes.has(node.id));
        const filteredEdges = edges.filter(edge => highlightedPath.edges.has(edge.id));

        // Create HTML content for the new window with compact layout
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeMapper | Path View</title>
    <link rel="stylesheet" href="./styles.css" />
    <link rel="stylesheet" href="https://esm.sh/reactflow@11.11.1/dist/style.css" />
    <style>
        /* Ultra-compact layout styles for path view */
        .react-flow__node {
            min-width: 150px !important;
            max-width: 200px !important;
            font-size: 10px !important;
            min-height: 60px !important;
        }
        .custom-node {
            min-height: 60px !important;
            border-radius: 4px !important;
        }
        .node-header {
            padding: 2px 6px !important;
            font-size: 8px !important;
            font-weight: bold !important;
            line-height: 1.2 !important;
        }
        .node-body {
            padding: 4px 6px !important;
        }
        .node-body .function-name {
            font-size: 10px !important;
            font-weight: 600 !important;
            margin-bottom: 2px !important;
            line-height: 1.2 !important;
        }
        .node-body .file-path {
            font-size: 8px !important;
            margin-top: 2px !important;
            line-height: 1.1 !important;
            opacity: 0.8 !important;
        }
        /* Compact edge styling for Bezier curves */
        .react-flow__edge.n8n-edge .react-flow__edge-path {
            stroke-width: 1px !important; /* Thin lines for path view */
        }
        .react-flow__edge.n8n-edge.highlighted .react-flow__edge-path {
            stroke-width: 2px !important; /* Slightly thicker for highlighted */
        }
        .export-button {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 10;
            background-color: #28a745;
            border: 1px solid #28a745;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .export-button:hover {
            background-color: #218838;
            border-color: #1e7e34;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
    </style>
    <script async src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
    <script type="importmap">
    {
        "imports": {
            "react": "https://esm.sh/react@18.2.0",
            "react-dom": "https://esm.sh/react-dom@18.2.0",
            "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
            "reactflow": "https://esm.sh/reactflow@11.11.1?deps=react@18.2.0,react-dom@18.2.0"
        }
    }
    </script>
</head>
<body>
    <div id="root" style="width:100vw;height:100vh;position:relative;"></div>
    <button class="export-button" id="exportBtn">📷 Export PNG</button>
    <script type="module">
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import ReactFlow, { Controls, Background, Position, Handle, MarkerType } from 'reactflow';
        import { toPng } from 'https://esm.sh/html-to-image@1.11.11';

        const CustomNode = React.memo(({ data }) => {
            return React.createElement(
                'div',
                { className: 'custom-node' },
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

        function getCompactLayout(nodes, edges) {
            // Create a fresh copy of nodes with reset positions
            const nodeMap = new Map(nodes.map(n => [n.id, { ...n, position: { x: 0, y: 0 } }]));
            const edgeMap = new Map();
            const childrenMap = new Map();
            const parentMap = new Map();
            
            // Initialize maps
            nodes.forEach(node => {
                childrenMap.set(node.id, []);
                parentMap.set(node.id, []);
            });
            
            // Build parent-child relationships
            edges.forEach(edge => {
                edgeMap.set(edge.id, edge);
                childrenMap.get(edge.source).push(edge.target);
                parentMap.get(edge.target).push(edge.source);
            });
            
            // Find all root nodes (no incoming edges)
            const roots = nodes.filter(node => parentMap.get(node.id).length === 0);
            
            if (roots.length === 0) {
                // Handle circular dependencies - just pick the first node
                roots.push(nodes[0]);
            }
            
            // Ultra-compact spacing
            const HORIZONTAL_SPACING = 280;  // Increased from 180
            const VERTICAL_SPACING = 120;    // Increased from 80
            
            let currentColumn = 0;
            const visited = new Set();
            const columnAssignments = new Map();
            
            // BFS traversal for column assignment
            function assignColumns() {
                const queue = [...roots.map(root => ({ nodeId: root.id, column: 0 }))];
                
                while (queue.length > 0) {
                    const { nodeId, column } = queue.shift();
                    
                    if (visited.has(nodeId)) continue;
                    visited.add(nodeId);
                    
                    columnAssignments.set(nodeId, column);
                    currentColumn = Math.max(currentColumn, column);
                    
                    // Add children to next column
                    const children = childrenMap.get(nodeId) || [];
                    children.forEach(childId => {
                        if (!visited.has(childId)) {
                            queue.push({ nodeId: childId, column: column + 1 });
                        }
                    });
                }
            }
            
            assignColumns();
            
            // Group nodes by column
            const columns = new Map();
            for (let i = 0; i <= currentColumn; i++) {
                columns.set(i, []);
            }
            
            columnAssignments.forEach((column, nodeId) => {
                columns.get(column).push(nodeMap.get(nodeId));
            });
            
            // Position nodes with ultra-compact spacing
            columns.forEach((columnNodes, columnIndex) => {
                // Sort nodes in each column alphabetically for consistency
                columnNodes.sort((a, b) => a.id.localeCompare(b.id));
                
                columnNodes.forEach((node, rowIndex) => {
                    node.position = {
                        x: columnIndex * HORIZONTAL_SPACING,
                        y: rowIndex * VERTICAL_SPACING
                    };
                });
            });
            
            return Array.from(nodeMap.values());
        }

        const nodeTypes = { customNode: CustomNode };
        const defaultEdgeOptions = {
            type: 'default', // Changed to 'default' for Bezier curves
            className: 'n8n-edge highlighted',
            markerEnd: { type: MarkerType.ArrowClosed }
        };

        let pathNodes = ${JSON.stringify(filteredNodes)};
        const pathEdges = ${JSON.stringify(filteredEdges)};
        pathNodes = getCompactLayout(pathNodes, pathEdges);

        function PathView() {
            return React.createElement(
                'div',
                { style: { width: '100%', height: '100%', position: 'relative' } },
                React.createElement(
                    ReactFlow,
                    {
                        nodes: pathNodes,
                        edges: pathEdges,
                        nodeTypes: nodeTypes,
                        fitView: true,
                        fitViewOptions: { padding: 0.05, maxZoom: 1.5, minZoom: 0.3 },
                        defaultEdgeOptions: defaultEdgeOptions,
                        nodesDraggable: true,
                        nodesConnectable: false,
                        proOptions: { hideAttribution: true },
                        minZoom: 0.1,
                        maxZoom: 3
                    },
                    React.createElement(Controls),
                    React.createElement(Background, { variant: 'dots', gap: 12, size: 1 })
                )
            );
        }

        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(React.StrictMode, null, React.createElement(PathView)));

        // Enhanced export button handler with improved quality
        document.getElementById('exportBtn').onclick = function() {
            const viewport = document.querySelector('.react-flow__viewport');
            if (!viewport) return;
            
            // Calculate dimensions for high DPI
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
                link.download = 'codemapper-path-hq.png';
                link.href = dataUrl;
                link.click();
            }).catch(err => {
                console.error('Failed to export PNG:', err);
            });
        };
    </script>
</body>
</html>`;

        const newWindow = window.open('', '_blank', 'width=1400,height=900,scrollbars=yes,resizable=yes');
        if (newWindow) {
            newWindow.document.write(htmlContent);
            newWindow.document.close();
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
        { style: { width: '100%', height: '100%', position: 'relative' } },
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
                nodes: nodes,
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
                onlyRenderVisibleElements: true,
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