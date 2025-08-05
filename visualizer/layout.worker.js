// =======================================================
// PASTE THIS ENTIRE CODE INTO a NEW FILE named layout.worker.js
// AND PLACE IT IN YOUR 'public' FOLDER
// =======================================================

const getLayoutedElements = (mappings) => {
    const nodes = new Map();
    const edges = new Set();
    const nodeDepths = new Map();

    if (!mappings) return { initialNodes: [], initialEdges: [] };

    // First pass: create all nodes (order independent)
    mappings.forEach(m => {
        if (!m.definition) return; // Add a safety check
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
        if (!m.definition) return; // Add a safety check
        const def = m.definition;
        m.callSites.forEach(cs => {
            edges.add({ id: `${cs.callerId}->${def.id}`, source: cs.callerId, target: def.id });
        });
    });

    const nodeArray = Array.from(nodes.values());
    
    const hasIncomingEdge = new Set();
    edges.forEach(edge => {
        hasIncomingEdge.add(edge.target);
    });
    
    nodeArray.forEach(node => {
        if (!hasIncomingEdge.has(node.id)) {
            nodeDepths.set(node.id, 0);
        } else {
            nodeDepths.set(node.id, -1);
        }
    });

    let changed = true;
    while (changed) {
        changed = false;
        edges.forEach(edge => {
            const sourceDepth = nodeDepths.get(edge.source);
            const targetDepth = nodeDepths.get(edge.target);
            
            if (sourceDepth >= 0 && (targetDepth < 0 || targetDepth <= sourceDepth)) {
                nodeDepths.set(edge.target, sourceDepth + 1);
                changed = true;
            }
        });
    }

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
    
    const edgeArray = Array.from(edges).map(edge => ({
        ...edge,
        type: 'smoothstep',
        className: 'n8n-edge'
    }));
    
    return { initialNodes: nodeArray, initialEdges: edgeArray };
};


// This is the "assistant's" main job. It waits for the manager to give it work.
self.onmessage = (event) => {
    // It receives the data from app.js
    const mappings = event.data;
    if (mappings) {
        // It does the heavy lifting
        const { initialNodes, initialEdges } = getLayoutedElements(mappings);
        
        // It sends the results back to app.js
        self.postMessage({ initialNodes, initialEdges });
    }
};