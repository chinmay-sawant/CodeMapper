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
            const reactFlowWrapper = event.currentTarget.closest('.react-flow');
            if (!reactFlowWrapper) return;
            
            const rect = reactFlowWrapper.getBoundingClientRect();
            const startX = event.clientX - rect.left;
            const startY = event.clientY - rect.top;
            
            setIsSelecting(true);
            setSelectionStart({ x: startX, y: startY });
            setSelectionBox({
                x: startX,
                y: startY,
                width: 0,
                height: 0
            });
        }
    }, []);

    const onSelectionDrag = useCallback((event) => {
        if (isSelecting && selectionStart) {
            event.preventDefault();
            const reactFlowWrapper = document.querySelector('.react-flow');
            if (!reactFlowWrapper) return;
            
            const rect = reactFlowWrapper.getBoundingClientRect();
            const currentX = event.clientX - rect.left;
            const currentY = event.clientY - rect.top;
            
            const x = Math.min(selectionStart.x, currentX);
            const y = Math.min(selectionStart.y, currentY);
            const width = Math.abs(currentX - selectionStart.x);
            const height = Math.abs(currentY - selectionStart.y);
            
            setSelectionBox({ x, y, width, height });
            
        }
    }, [isSelecting, selectionStart]);

    const onSelectionEnd = useCallback(() => {
        if (isSelecting && selectionBox && selectionBox.width > 5 && selectionBox.height > 5) {
            const selectedNodeIds = new Set();
            const reactFlowWrapper = document.querySelector('.react-flow');
            
            if (reactFlowWrapper) {
                const wrapperRect = reactFlowWrapper.getBoundingClientRect();
                
                nodes.forEach(node => {
                    const nodeElement = document.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
                    if (nodeElement) {
                        const nodeRect = nodeElement.getBoundingClientRect();
                        
                        // Convert node position to wrapper-relative coordinates
                        const nodeX = nodeRect.left - wrapperRect.left;
                        const nodeY = nodeRect.top - wrapperRect.top;
                        const nodeWidth = nodeRect.width;
                        const nodeHeight = nodeRect.height;
                        
                        // Check if node overlaps with selection box
                        const nodeRight = nodeX + nodeWidth;
                        const nodeBottom = nodeY + nodeHeight;
                        const selectionRight = selectionBox.x + selectionBox.width;
                        const selectionBottom = selectionBox.y + selectionBox.height;
                        
                        if (nodeX < selectionRight &&
                            nodeRight > selectionBox.x &&
                            nodeY < selectionBottom &&
                            nodeBottom > selectionBox.y) {
                            selectedNodeIds.add(node.id);
                        }
                    }
                });
                
                setSelectedNodes(prev => {
                    const newSet = new Set(prev);
                    selectedNodeIds.forEach(id => newSet.add(id));
                    return newSet;
                });
            }
        }
        
        setIsSelecting(false);
        setSelectionBox(null);
        setSelectionStart(null);
    }, [isSelecting, selectionBox, nodes]);

    // Handle mouse events on document to capture drags outside the pane
    useEffect(() => {
        const handleMouseMove = (event) => {
            if (isSelecting) {
                onSelectionDrag(event);
            }
        };

        const handleMouseUp = (event) => {
            if (isSelecting) {
                onSelectionEnd();
            }
        };

        if (isSelecting) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isSelecting, onSelectionDrag, onSelectionEnd]);

    const openPathInNewWindow = useCallback(() => {
        if (highlightedPath.nodes.size === 0) return;

        const filteredNodes = nodes.filter(node => highlightedPath.nodes.has(node.id));
        const filteredEdges = edges.filter(edge => highlightedPath.edges.has(edge.id));

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
        .selection-box {
            position: absolute;
            border: 2px dashed #4a9eff;
            background-color: rgba(74, 158, 255, 0.1);
            pointer-events: none;
            z-index: 1000;
            border-radius: 4px;
        }
        .react-flow__node.selected {
            box-shadow: 0 0 0 2px #4a9eff !important;
            transform: scale(1.02);
            transition: all 0.2s ease;
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
        import React, { useState, useCallback, useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import ReactFlow, { Controls, Background, Position, Handle, MarkerType } from 'reactflow';
        import { toPng } from 'https://esm.sh/html-to-image@1.11.11';

        const CustomNode = React.memo(({ data, selected }) => {
            return React.createElement(
                'div',
                { 
                    className: \`custom-node \${selected ? 'selected' : ''}\`
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

        function getCompactLayout(nodes, edges) {
            // Create a fresh copy of nodes with reset positions
            const nodeMap = new Map(nodes.map(n => [n.id, { ...n, position: { x: 0, y: 0 } }]));
            const adjacencyList = new Map();
            const inDegree = new Map();
            
            // Initialize maps
            nodes.forEach(node => {
                adjacencyList.set(node.id, []);
                inDegree.set(node.id, 0);
            });
            
            // Build adjacency list and in-degree count
            edges.forEach(edge => {
                adjacencyList.get(edge.source).push(edge.target);
                inDegree.set(edge.target, inDegree.get(edge.target) + 1);
            });
            
            // Topological sort using Kahn's algorithm
            const columns = [];
            let queue = [];
            
            // Find all nodes with no incoming edges (first column)
            nodes.forEach(node => {
                if (inDegree.get(node.id) === 0) {
                    queue.push(node.id);
                }
            });
            
            let columnIndex = 0;
            while (queue.length > 0) {
                const currentLevel = [...queue];
                columns[columnIndex] = [];
                queue = [];
                
                currentLevel.forEach(nodeId => {
                    const node = nodeMap.get(nodeId);
                    columns[columnIndex].push(node);
                    
                    // Process neighbors
                    const neighbors = adjacencyList.get(nodeId) || [];
                    neighbors.forEach(neighborId => {
                        const newInDegree = inDegree.get(neighborId) - 1;
                        inDegree.set(neighborId, newInDegree);
                        
                        if (newInDegree === 0) {
                            queue.push(neighborId);
                        }
                    });
                });
                
                columnIndex++;
            }
            
            // Handle any remaining nodes (cycles or isolated nodes)
            const processedNodes = new Set();
            columns.forEach(column => {
                column.forEach(node => processedNodes.add(node.id));
            });
            
            const remainingNodes = nodes.filter(node => !processedNodes.has(node.id));
            if (remainingNodes.length > 0) {
                columns[columnIndex] = remainingNodes.map(n => nodeMap.get(n.id));
            }
            
            // Ultra-compact spacing
            const HORIZONTAL_SPACING = 280;
            const VERTICAL_SPACING = 120;
            
            // Calculate total height for centering
            const maxColumnHeight = Math.max(...columns.map(col => col.length));
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
                        y: verticalOffset + (rowIndex * VERTICAL_SPACING)
                    };
                });
            });
            
            return Array.from(nodeMap.values());
        }

        const nodeTypes = { customNode: CustomNode };
        const defaultEdgeOptions = {
            type: 'default',
            className: 'n8n-edge highlighted',
            markerEnd: { type: MarkerType.ArrowClosed }
        };

        let pathNodes = ${JSON.stringify(filteredNodes)};
        const pathEdges = ${JSON.stringify(filteredEdges)};
        pathNodes = getCompactLayout(pathNodes, pathEdges);

        function PathView() {
            const [selectedNodes, setSelectedNodes] = React.useState(new Set());
            const [isSelecting, setIsSelecting] = React.useState(false);
            const [selectionBox, setSelectionBox] = React.useState(null);
            const [selectionStart, setSelectionStart] = React.useState(null);
            const [nodes, setNodes] = React.useState(pathNodes.map(node => ({
                ...node,
                selected: false
            })));

            const onNodesChange = React.useCallback((changes) => {
                setNodes((nds) => {
                    const updatedNodes = [...nds];
                    changes.forEach(change => {
                        const nodeIndex = updatedNodes.findIndex(n => n.id === change.id);
                        if (nodeIndex !== -1) {
                            if (change.type === 'position' && change.position) {
                                updatedNodes[nodeIndex] = {
                                    ...updatedNodes[nodeIndex],
                                    position: change.position
                                };
                            } else if (change.type === 'select') {
                                updatedNodes[nodeIndex] = {
                                    ...updatedNodes[nodeIndex],
                                    selected: change.selected
                                };
                            }
                        }
                    });
                    return updatedNodes;
                });
            }, []);

            const onNodeClick = useCallback((event, node) => {
                if (event.ctrlKey || event.metaKey) {
                    event.stopPropagation();
                    setSelectedNodes(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(node.id)) {
                            newSet.delete(node.id);
                        } else {
                            newSet.add(node.id);
                        }
                        
                        // Update node selected state immediately
                        setNodes(nds => nds.map(n => ({
                            ...n,
                            selected: newSet.has(n.id)
                        })));
                        
                        return newSet;
                    });
                }
            }, []);

            const onPaneClick = useCallback((event) => {
                if (!event.ctrlKey && !event.metaKey) {
                    setSelectedNodes(new Set());
                    setNodes(nds => nds.map(n => ({ ...n, selected: false })));
                }
            }, []);

            const onSelectionStart = useCallback((event) => {
                if ((event.ctrlKey || event.metaKey) && event.target.classList.contains('react-flow__pane')) {
                    event.preventDefault();
                    event.stopPropagation();
                    const rootElement = document.getElementById('root');
                    if (!rootElement) return;
                    
                    const rect = rootElement.getBoundingClientRect();
                    const startX = event.clientX - rect.left;
                    const startY = event.clientY - rect.top;
                    
                    setIsSelecting(true);
                    setSelectionStart({ x: startX, y: startY });
                    setSelectionBox({ x: startX, y: startY, width: 0, height: 0 });
                }
            }, []);

            const onSelectionDrag = useCallback((event) => {
                if (isSelecting && selectionStart) {
                    event.preventDefault();
                    event.stopPropagation();
                    const rootElement = document.getElementById('root');
                    if (!rootElement) return;
                    
                    const rect = rootElement.getBoundingClientRect();
                    const currentX = event.clientX - rect.left;
                    const currentY = event.clientY - rect.top;
                    
                    const x = Math.min(selectionStart.x, currentX);
                    const y = Math.min(selectionStart.y, currentY);
                    const width = Math.abs(currentX - selectionStart.x);
                    const height = Math.abs(currentY - selectionStart.y);
                    
                    setSelectionBox({ x, y, width, height });

                    // Real-time selection highlighting during drag
                    if (width > 5 && height > 5) {
                        const selectedNodeIds = new Set(selectedNodes); // Keep existing selections
                        const rootRect = rootElement.getBoundingClientRect();
                        
                        nodes.forEach(node => {
                            const nodeElement = document.querySelector(\`[data-id="\${node.id.replace(/"/g, '\\\\"')}"]\`);
                            if (nodeElement) {
                                const nodeRect = nodeElement.getBoundingClientRect();
                                const nodeX = nodeRect.left - rootRect.left;
                                const nodeY = nodeRect.top - rootRect.top;
                                const nodeWidth = nodeRect.width;
                                const nodeHeight = nodeRect.height;
                                
                                const nodeRight = nodeX + nodeWidth;
                                const nodeBottom = nodeY + nodeHeight;
                                const selectionRight = x + width;
                                const selectionBottom = y + height;
                                
                                if (nodeX < selectionRight &&
                                    nodeRight > x &&
                                    nodeY < selectionBottom &&
                                    nodeBottom > y) {
                                    selectedNodeIds.add(node.id);
                                }
                            }
                        });
                        
                        // Update visual selection in real-time
                        setNodes(nds => nds.map(n => ({
                            ...n,
                            selected: selectedNodeIds.has(n.id)
                        })));
                    }
                }
            }, [isSelecting, selectionStart, selectedNodes, nodes]);

            const onSelectionEnd = useCallback(() => {
                if (isSelecting && selectionBox && selectionBox.width > 5 && selectionBox.height > 5) {
                    const selectedNodeIds = new Set(selectedNodes); // Keep existing selections
                    const rootElement = document.getElementById('root');
                    
                    if (rootElement) {
                        const rootRect = rootElement.getBoundingClientRect();
                        
                        nodes.forEach(node => {
                            const nodeElement = document.querySelector(\`[data-id="\${node.id.replace(/"/g, '\\\\"')}"]\`);
                            if (nodeElement) {
                                const nodeRect = nodeElement.getBoundingClientRect();
                                const nodeX = nodeRect.left - rootRect.left;
                                const nodeY = nodeRect.top - rootRect.top;
                                const nodeWidth = nodeRect.width;
                                const nodeHeight = nodeRect.height;
                                
                                const nodeRight = nodeX + nodeWidth;
                                const nodeBottom = nodeY + nodeHeight;
                                const selectionRight = selectionBox.x + selectionBox.width;
                                const selectionBottom = selectionBox.y + selectionBox.height;
                                
                                if (nodeX < selectionRight &&
                                    nodeRight > selectionBox.x &&
                                    nodeY < selectionBottom &&
                                    nodeBottom > selectionBox.y) {
                                    selectedNodeIds.add(node.id);
                                }
                            }
                        });
                        
                        setSelectedNodes(selectedNodeIds);
                        
                        // Update final node selected state
                        setNodes(nds => nds.map(n => ({
                            ...n,
                            selected: selectedNodeIds.has(n.id)
                        })));
                    }
                }
                
                setIsSelecting(false);
                setSelectionBox(null);
                setSelectionStart(null);
            }, [isSelecting, selectionBox, selectedNodes, nodes]);

            React.useEffect(() => {
                const handleMouseMove = (event) => {
                    if (isSelecting) {
                        onSelectionDrag(event);
                    }
                };

                const handleMouseUp = (event) => {
                    if (isSelecting) {
                        onSelectionEnd();
                    }
                };

                if (isSelecting) {
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                }

                return () => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };
            }, [isSelecting, onSelectionDrag, onSelectionEnd]);

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
                React.createElement(
                    ReactFlow,
                    {
                        nodes: nodes,
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
        { 
            style: { width: '100%', height: '100%', position: 'relative' },
            onMouseDown: onSelectionStart
        },
        selectionBox && React.createElement('div', {
            className: 'selection-box',
            style: {
                position: 'absolute',
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