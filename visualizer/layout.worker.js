// Web Worker for layout processing with performance optimizations

self.onmessage = function(event) {
    const mappings = event.data;
    
    try {
        // Performance optimization: limit processing for very large datasets
        const maxNodes = 5000;
        const limitedMappings = mappings.length > maxNodes ? 
            mappings.slice(0, maxNodes) : mappings;
            
        if (mappings.length > maxNodes) {
            console.warn(`Dataset limited to ${maxNodes} nodes for performance`);
        }
        
        const nodes = [];
        const edges = [];
        const nodeMap = new Map();
        let nodeIdCounter = 0;

        // Create nodes with increased spacing
        limitedMappings.forEach((mapping) => {
            const nodeId = `node-${nodeIdCounter++}`;
            const node = {
                id: nodeId,
                type: 'customNode',
                position: { x: 0, y: 0 }, // Will be calculated later
                data: {
                    name: mapping.name,
                    package: mapping.package || 'Unknown',
                    filePath: mapping.filePath || '',
                    highlighted: false
                }
            };
            nodes.push(node);
            nodeMap.set(`${mapping.package}:${mapping.name}`, nodeId);
        });

        // Create edges
        let edgeIdCounter = 0;
        limitedMappings.forEach((mapping) => {
            const sourceKey = `${mapping.package}:${mapping.name}`;
            const sourceNodeId = nodeMap.get(sourceKey);
            
            if (mapping.calls && Array.isArray(mapping.calls)) {
                mapping.calls.forEach((call) => {
                    const targetKey = `${call.package}:${call.name}`;
                    const targetNodeId = nodeMap.get(targetKey);
                    
                    if (targetNodeId && sourceNodeId !== targetNodeId) {
                        edges.push({
                            id: `edge-${edgeIdCounter++}`,
                            source: sourceNodeId,
                            target: targetNodeId,
                            type: 'smoothstep', // Curved edges
                            className: 'n8n-edge'
                        });
                    }
                });
            }
        });

        // Optimized layout algorithm with increased spacing
        const layoutResult = calculateLayout(nodes, edges);
        
        self.postMessage({
            initialNodes: layoutResult.nodes,
            initialEdges: edges
        });
        
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            initialNodes: [{
                id: 'error-node',
                type: 'customNode',
                position: { x: 0, y: 0 },
                data: {
                    name: 'Layout Error',
                    package: 'Error',
                    filePath: error.message,
                    highlighted: false
                }
            }],
            initialEdges: []
        });
    }
};

function calculateLayout(nodes, edges) {
    // Increased spacing for better visualization
    const HORIZONTAL_SPACING = 400; // Increased from 300
    const VERTICAL_SPACING = 200;   // Increased from 150
    const NODES_PER_COLUMN = 8;     // Reduced for better spacing
    
    // Build adjacency maps for performance
    const childrenMap = new Map();
    const parentMap = new Map();
    
    // Initialize maps
    nodes.forEach(node => {
        childrenMap.set(node.id, []);
        parentMap.set(node.id, []);
    });
    
    // Build relationships
    edges.forEach(edge => {
        childrenMap.get(edge.source).push(edge.target);
        parentMap.get(edge.target).push(edge.source);
    });
    
    // Find root nodes (no incoming edges)
    const rootNodes = nodes.filter(node => parentMap.get(node.id).length === 0);
    
    if (rootNodes.length === 0 && nodes.length > 0) {
        rootNodes.push(nodes[0]); // Handle circular dependencies
    }
    
    // BFS layout with performance optimizations
    const visited = new Set();
    const positioned = new Map();
    let currentColumn = 0;
    
    // Process in batches for better performance
    const queue = rootNodes.map(node => ({ node, column: 0, row: 0 }));
    const columnSizes = new Map();
    
    while (queue.length > 0) {
        const batch = queue.splice(0, Math.min(100, queue.length)); // Process in batches
        
        batch.forEach(({ node, column, row }) => {
            if (visited.has(node.id)) return;
            
            visited.add(node.id);
            
            // Calculate position with increased spacing
            if (!columnSizes.has(column)) {
                columnSizes.set(column, 0);
            }
            
            const currentRow = columnSizes.get(column);
            columnSizes.set(column, currentRow + 1);
            
            const position = {
                x: column * HORIZONTAL_SPACING,
                y: currentRow * VERTICAL_SPACING
            };
            
            positioned.set(node.id, position);
            currentColumn = Math.max(currentColumn, column);
            
            // Add children to next column
            const children = childrenMap.get(node.id) || [];
            children.forEach((childId, index) => {
                if (!visited.has(childId)) {
                    const childNode = nodes.find(n => n.id === childId);
                    if (childNode) {
                        queue.push({ node: childNode, column: column + 1, row: index });
                    }
                }
            });
        });
    }
    
    // Apply positions to nodes
    const layoutedNodes = nodes.map(node => {
        const position = positioned.get(node.id) || { x: 0, y: 0 };
        return {
            ...node,
            position
        };
    });
    
    return { nodes: layoutedNodes };
}
