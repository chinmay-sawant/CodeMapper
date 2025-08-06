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

    const onNodeClick = useCallback((event, node) => {
        if (currentlyClickedNode === node.id) {
            setCurrentlyClickedNode(null);
            setNodes(nds => nds.map(n => n.data.highlighted ? { ...n, data: { ...n.data, highlighted: false } } : n));
            setEdges(eds => eds.map(e => (e.className || '').includes('highlighted') ? { ...e, className: 'n8n-edge' } : e));
            return;
        }

        const { pathNodes, pathEdges } = findPathToRoot(node.id, edges);

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
    }, [edges, findPathToRoot, currentlyClickedNode]);

    const onPaneClick = useCallback(() => {
        if (currentlyClickedNode) {
            setCurrentlyClickedNode(null);
            setNodes(nds => nds.map(n => n.data.highlighted ? { ...n, data: { ...n.data, highlighted: false } } : n));
            setEdges(eds => eds.map(e => (e.className || '').includes('highlighted') ? { ...e, className: 'n8n-edge' } : e));
        }
    }, [currentlyClickedNode]);

    const defaultEdgeOptions = useMemo(() => ({
        type: 'smoothstep',
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
            nodesDraggable: false,
            nodesConnectable: false,
            onlyRenderVisibleElements: true,
            proOptions: { hideAttribution: true },
            minZoom: 0.001
        },
        React.createElement(Controls),
        React.createElement(Background, { variant: 'dots', gap: 12, size: 1 })
    );
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(React.StrictMode, null, React.createElement(Flow)));