// =======================================================
// PASTE THIS ENTIRE CODE INTO a NEW FILE named layout.worker.js
// AND PLACE IT IN YOUR 'public' FOLDER
// =======================================================

/**
 * A highly optimized function to calculate graph layout using topological sorting.
 * Complexity: O(N + E) where N is nodes and E is edges.
 * This is significantly faster than the previous O(N * E) approach.
 *
 * @param {Array} mappings The raw data from the API.
 * @returns {{initialNodes: Array, initialEdges: Array}}
 */
const getLayoutedElements = (mappings) => {
    if (!mappings || mappings.length === 0) {
        return { initialNodes: [], initialEdges: [] };
    }

    const nodes = new Map();
    const edges = new Set();
    const adjacencyList = new Map(); // For topological sort: sourceId -> [targetId, targetId, ...]
    const inDegree = new Map(); // For topological sort: nodeId -> count of incoming edges

    // --- Step 1: Build Graph Data Structures in a Single Pass ---
    // This is more efficient than iterating over mappings multiple times.
    for (const m of mappings) {
        if (!m.definition) continue;
        const def = m.definition;

        // Ensure definition node exists
        if (!nodes.has(def.id)) {
            nodes.set(def.id, {
                id: def.id,
                data: {
                    package: def.package,
                    name: def.name,
                    filePath: `${def.filePath}:${def.line}`,
                    highlighted: false,
                },
                position: { x: 0, y: 0 },
                type: 'customNode',
            });
        }

        // Initialize in-degree and adjacency list for the definition node
        if (!inDegree.has(def.id)) inDegree.set(def.id, 0);
        
        for (const cs of m.callSites) {
             // Ensure caller node exists
            if (!nodes.has(cs.callerId)) {
                const simpleName = cs.callerId.split('.').pop();
                const simplePackage = cs.callerId.substring(0, cs.callerId.lastIndexOf('.'));
                nodes.set(cs.callerId, {
                    id: cs.callerId,
                    data: {
                        package: simplePackage,
                        name: simpleName,
                        filePath: cs.filePath,
                        highlighted: false,
                    },
                    position: { x: 0, y: 0 },
                    type: 'customNode',
                });
            }

            // Create the edge
            const edgeId = `${cs.callerId}->${def.id}`;
            if (!edges.has(edgeId)) {
                edges.add(edgeId);

                // Update adjacency list for the source (caller)
                if (!adjacencyList.has(cs.callerId)) {
                    adjacencyList.set(cs.callerId, []);
                }
                adjacencyList.get(cs.callerId).push(def.id);

                // Update in-degree for the target (definition)
                inDegree.set(def.id, (inDegree.get(def.id) || 0) + 1);
            }
        }
    }

    // --- Step 2: Topological Sort (Kahn's Algorithm) for Layering ---
    const nodeDepths = new Map();
    const columns = [];
    let queue = [];

    // Initialize queue with all nodes that have an in-degree of 0 (root nodes)
    for (const nodeId of nodes.keys()) {
        if (!inDegree.has(nodeId) || inDegree.get(nodeId) === 0) {
            queue.push(nodeId);
        }
    }

    let depth = 0;
    while (queue.length > 0) {
        const levelSize = queue.length;
        columns[depth] = [];
        const nextQueue = [];

        for (let i = 0; i < levelSize; i++) {
            const u = queue[i];
            nodeDepths.set(u, depth);
            columns[depth].push(nodes.get(u));
            
            const neighbors = adjacencyList.get(u) || [];
            for (const v of neighbors) {
                const currentInDegree = (inDegree.get(v) || 0) - 1;
                inDegree.set(v, currentInDegree);
                if (currentInDegree === 0) {
                    nextQueue.push(v);
                }
            }
        }
        queue = nextQueue;
        depth++;
    }

    // --- Step 3: Handle Cycles ---
    // Any node not in nodeDepths is part of a cycle. Group them together.
    const cyclicNodes = [];
    for (const node of nodes.values()) {
        if (!nodeDepths.has(node.id)) {
            cyclicNodes.push(node);
        }
    }
    
    if (cyclicNodes.length > 0) {
        columns[depth] = cyclicNodes;
    }


    // --- Step 4: Assign Positions Based on Columns ---
    const x_gap = 350;
    const y_gap = 180;

    columns.forEach((col, colIndex) => {
        // Sort nodes in a column alphabetically for a stable layout
        col.sort((a, b) => a.id.localeCompare(b.id)); 
        col.forEach((node, nodeIndex) => {
            node.position = {
                x: colIndex * x_gap,
                y: nodeIndex * y_gap
            };
        });
    });

    const initialNodes = Array.from(nodes.values());
    const initialEdges = Array.from(edges).map(edgeId => {
        const [source, target] = edgeId.split('->');
        return { id: edgeId, source, target };
    });

    return { initialNodes, initialEdges };
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