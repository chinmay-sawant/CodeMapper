import React, { useState, useEffect, useCallback } from 'react';
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

// This is a simple algorithm to arrange nodes in columns.
const getLayoutedElements = (mappings) => {
    const nodes = new Map();
    const edges = new Set();
    const nodeDepths = new Map();

    if (!mappings) return { initialNodes: [], initialEdges: [] };

    // First pass: create all nodes (order independent)
    mappings.forEach(m => {
        const def = m.definition;
        if (!nodes.has(def.id)) {
            nodes.set(def.id, {
                id: def.id,
                data: { 
                    package: def.package,
                    name: def.name,
                    filePath: `${def.filePath}:${def.line}`
                },
                position: { x: 0, y: 0 },
                type: 'customNode',
            });
        }
        
        m.callSites.forEach(cs => {
            if (!nodes.has(cs.callerId)) {
                const simpleName = cs.callerId.split('.').pop();
                const simplePackage = cs.callerId.substring(0, cs.callerId.lastIndexOf('.'));
                 nodes.set(cs.callerId, {
                    id: cs.callerId,
                    data: {
                        package: simplePackage,
                        name: simpleName,
                        filePath: cs.filePath
                    },
                    position: { x: 0, y: 0 },
                    type: 'customNode',
                });
            }
        });
    });

    // Second pass: create all edges (order independent)
    mappings.forEach(m => {
        const def = m.definition;
        m.callSites.forEach(cs => {
            edges.add({ id: `${cs.callerId}->${def.id}`, source: cs.callerId, target: def.id });
        });
    });

    const nodeArray = Array.from(nodes.values());
    
    // Find nodes that have no incoming edges (root nodes)
    const hasIncomingEdge = new Set();
    edges.forEach(edge => {
        hasIncomingEdge.add(edge.target);
    });
    
    // Initialize depths: root nodes start at depth 0
    nodeArray.forEach(node => {
        if (!hasIncomingEdge.has(node.id)) {
            nodeDepths.set(node.id, 0);
        } else {
            nodeDepths.set(node.id, -1); // Mark as unprocessed
        }
    });

    // Iteratively calculate depths using topological approach
    let changed = true;
    while (changed) {
        changed = false;
        edges.forEach(edge => {
            const sourceDepth = nodeDepths.get(edge.source);
            const targetDepth = nodeDepths.get(edge.target);
            
            // If source has a depth and target doesn't, or target depth is too small
            if (sourceDepth >= 0 && (targetDepth < 0 || targetDepth <= sourceDepth)) {
                nodeDepths.set(edge.target, sourceDepth + 1);
                changed = true;
            }
        });
    }

    // Group nodes by depth
    const columns = [];
    const x_gap = 350;
    const y_gap = 180;
    
    nodeArray.forEach(node => {
        const depth = Math.max(0, nodeDepths.get(node.id) || 0);
        if (!columns[depth]) {
            columns[depth] = [];
        }
        columns[depth].push(node);
    });

    columns.forEach((col, colIndex) => {
        col.forEach((node, nodeIndex) => {
            node.position = {
                x: colIndex * x_gap,
                y: nodeIndex * y_gap
            };
        });
    });
    
    // Ensure edges have proper structure
    const edgeArray = Array.from(edges).map(edge => ({
        ...edge,
        type: 'smoothstep',
        className: 'n8n-edge'
    }));
    
    return { initialNodes: nodeArray, initialEdges: edgeArray };
};

const CustomNode = ({ data, id }) => {
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
            style: { background: '#555' }
        })
    );
};

const nodeTypes = { customNode: CustomNode };

function Flow() {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [highlightedPath, setHighlightedPath] = useState(new Set());
    const [currentlyClickedNode, setCurrentlyClickedNode] = useState(null);

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    // Function to find path from clicked node to root nodes
    const findPathToRoot = useCallback((targetNodeId, currentEdges) => {
        const pathNodes = new Set();
        const pathEdges = new Set();
        const visited = new Set();
        
        // Find all edges that point TO other nodes (outgoing edges from perspective of data flow)
        const incomingEdges = new Map();
        currentEdges.forEach(edge => {
            if (!incomingEdges.has(edge.target)) {
                incomingEdges.set(edge.target, []);
            }
            incomingEdges.get(edge.target).push(edge);
        });
        
        // DFS to find path to root (nodes with no incoming edges)
        const dfs = (nodeId) => {
            if (visited.has(nodeId)) return false;
            visited.add(nodeId);
            
            pathNodes.add(nodeId);
            
            const incoming = incomingEdges.get(nodeId) || [];
            if (incoming.length === 0) {
                // This is a root node, path found
                return true;
            }
            
            // Try each incoming edge
            for (const edge of incoming) {
                if (dfs(edge.source)) {
                    pathEdges.add(edge.id);
                    return true;
                }
            }
            
            // No path to root through this node
            pathNodes.delete(nodeId);
            return false;
        };
        
        dfs(targetNodeId);
        return { pathNodes, pathEdges };
    }, []);

    const onNodeClick = useCallback((event, node) => {
        // If clicking the same node again, clear highlighting
        if (currentlyClickedNode === node.id) {
            setNodes(currentNodes => 
                currentNodes.map(n => ({
                    ...n,
                    data: {
                        ...n.data,
                        highlighted: false
                    }
                }))
            );
            
            setEdges(currentEdges =>
                currentEdges.map(edge => ({
                    ...edge,
                    className: 'n8n-edge',
                }))
            );
            
            setHighlightedPath(new Set());
            setCurrentlyClickedNode(null);
            return;
        }

        const { pathNodes, pathEdges } = findPathToRoot(node.id, edges);
        
        // Update nodes with highlighting
        setNodes(currentNodes => 
            currentNodes.map(n => ({
                ...n,
                data: {
                    ...n.data,
                    highlighted: pathNodes.has(n.id)
                }
            }))
        );
        
        // Update edges with highlighting
        setEdges(currentEdges =>
            currentEdges.map(edge => ({
                ...edge,
                className: pathEdges.has(edge.id) ? 'n8n-edge highlighted' : 'n8n-edge',
            }))
        );
        
        setHighlightedPath(pathEdges);
        setCurrentlyClickedNode(node.id);
    }, [edges, findPathToRoot, currentlyClickedNode]);

    // Clear highlighting when clicking on empty space
    const onPaneClick = useCallback(() => {
        setNodes(currentNodes => 
            currentNodes.map(n => ({
                ...n,
                data: {
                    ...n.data,
                    highlighted: false
                }
            }))
        );
        
        setEdges(currentEdges =>
            currentEdges.map(edge => ({
                ...edge,
                className: 'n8n-edge',
            }))
        );
        
        setHighlightedPath(new Set());
        setCurrentlyClickedNode(null);
    }, []);

    // Define default options to apply to all edges.
    // We use a custom class ('n8n-edge') to target edges with our CSS.
    const defaultEdgeOptions = {
        type: 'smoothstep',
        className: 'n8n-edge',
        markerEnd: {
            type: MarkerType.ArrowClosed,
        },
    };

    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch('/api/codemap');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const mappings = await response.json();
                const { initialNodes, initialEdges } = getLayoutedElements(mappings);
                setNodes(initialNodes);
                setEdges(initialEdges);
            } catch (error) {
                console.error("Failed to fetch or process code map:", error);
                setNodes([{ 
                    id: 'error', 
                    type: 'customNode', 
                    data: { 
                        package: 'Error', 
                        name: 'Failed to load data', 
                        filePath: 'Check console for details' 
                    }, 
                    position: { x: 0, y: 0 } 
                }]);
            }
        }
        fetchData();
    }, []);

    return React.createElement(
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
            defaultEdgeOptions: defaultEdgeOptions
        },
        React.createElement(Controls),
        React.createElement(Background)
    );
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(React.StrictMode, null, React.createElement(Flow)));