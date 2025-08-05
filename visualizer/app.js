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
            edges.add({ id: `${cs.callerId}->${def.id}`, source: cs.callerId, target: def.id });
        });
    });

    const nodeArray = Array.from(nodes.values());
    const x_gap = 350;
    const y_gap = 180;
    const columns = [];

    nodeArray.forEach(node => {
        let maxDepth = 0;
        edges.forEach(edge => {
            if (edge.target === node.id) {
                const sourceDepth = nodeDepths.get(edge.source) || 0;
                if (sourceDepth + 1 > maxDepth) {
                    maxDepth = sourceDepth + 1;
                }
            }
        });
        nodeDepths.set(node.id, maxDepth);
        
        if (!columns[maxDepth]) {
            columns[maxDepth] = [];
        }
        columns[maxDepth].push(node);
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
        animated: true,
        style: { stroke: '#ffffff', strokeWidth: 2 }
    }));
    
    return { initialNodes: nodeArray, initialEdges: edgeArray };
};

const CustomNode = ({ data }) => {
    return React.createElement(
        'div',
        { className: 'custom-node' },
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

    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

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