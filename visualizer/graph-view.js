// Obsidian-style Graph View Implementation
class GraphView {
    constructor() {
        this.data = null;
        this.nodes = [];
        this.links = [];
        this.simulation = null;
        this.svg = null;
        this.g = null;
        this.selectedNode = null;
        this.expandedNodes = new Set();
        this.visibleNodes = new Set();
        this.visibleLinks = new Set();
        this.nodeMap = new Map();
        this.linkMap = new Map();
        this.searchIndex = [];
        
        // Graph parameters
        this.forceStrength = 0.5;
        this.linkDistance = 100;
        this.nodeRadius = 20;
        this.maxNeighborsToShow = 3;
        
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupUI();
            this.setupGraph();
            this.processData();
            this.createSearchIndex();
            this.render();
            this.hideLoading();
        } catch (error) {
            console.error('Failed to initialize graph view:', error);
            this.showError('Failed to load graph data. Please try refreshing the page.');
        }
    }

    async loadData() {
        const response = await fetch('/api/codemap');
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status}`);
        }
        this.data = await response.json();
    }

    setupUI() {
        // Setup controls
        document.getElementById('force-strength').addEventListener('input', (e) => {
            this.forceStrength = parseFloat(e.target.value);
            this.updateForces();
        });

        document.getElementById('link-distance').addEventListener('input', (e) => {
            this.linkDistance = parseInt(e.target.value);
            this.updateForces();
        });

        document.getElementById('center-graph-btn').addEventListener('click', () => {
            this.centerGraph();
        });

        document.getElementById('reset-view-btn').addEventListener('click', () => {
            this.resetView();
        });

        document.getElementById('toggle-view-btn').addEventListener('click', () => {
            window.location.href = '/';
        });

        document.getElementById('close-panel-btn').addEventListener('click', () => {
            this.hideNodeDetails();
        });

        // Setup search
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Setup keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSelection();
                this.hideNodeDetails();
            } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('search-input').focus();
            } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.centerGraph();
            } else if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.resetView();
            } else if (e.key === ' ') {
                e.preventDefault();
                if (this.selectedNode) {
                    this.toggleNodeExpansion(this.selectedNode);
                }
            }
        });
    }

    setupGraph() {
        const container = document.getElementById('graph-container');
        const rect = container.getBoundingClientRect();
        
        this.svg = d3.select('#graph-svg')
            .attr('width', rect.width)
            .attr('height', rect.height);

        // Create zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
                this.updateZoomLevel(event.transform.k);
            });

        this.svg.call(zoom);

        // Create main group for graph elements
        this.g = this.svg.append('g');

        // Setup simulation
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(this.linkDistance))
            .force('charge', d3.forceManyBody().strength(-300 * this.forceStrength))
            .force('center', d3.forceCenter(rect.width / 2, rect.height / 2))
            .force('collision', d3.forceCollide().radius(this.nodeRadius + 5));

        // Handle window resize
        window.addEventListener('resize', () => {
            const newRect = container.getBoundingClientRect();
            this.svg.attr('width', newRect.width).attr('height', newRect.height);
            this.simulation.force('center', d3.forceCenter(newRect.width / 2, newRect.height / 2));
            this.simulation.restart();
        });
    }

    processData() {
        // Create nodes from definitions
        const nodeMap = new Map();
        const linkData = [];

        this.data.forEach(mapping => {
            const def = mapping.definition;
            if (!nodeMap.has(def.id)) {
                nodeMap.set(def.id, {
                    id: def.id,
                    name: def.name,
                    package: def.package,
                    filePath: def.filePath,
                    line: def.line,
                    dependencies: [],
                    callers: [],
                    totalNeighbors: 0,
                    x: Math.random() * 800,
                    y: Math.random() * 600
                });
            }

            // Add dependencies and create links
            mapping.callSites.forEach(callSite => {
                const callerId = callSite.callerId;
                if (!nodeMap.has(callerId)) {
                    // Create placeholder node for unknown callers
                    nodeMap.set(callerId, {
                        id: callerId,
                        name: callerId.split('.').pop() || callerId,
                        package: callerId.includes('.') ? callerId.substring(0, callerId.lastIndexOf('.')) : 'unknown',
                        filePath: callSite.filePath,
                        line: callSite.line,
                        dependencies: [],
                        callers: [],
                        totalNeighbors: 0,
                        isPlaceholder: true,
                        x: Math.random() * 800,
                        y: Math.random() * 600
                    });
                }

                // Add relationship
                nodeMap.get(def.id).callers.push(callerId);
                nodeMap.get(callerId).dependencies.push(def.id);

                // Create link
                linkData.push({
                    id: `${callerId}-${def.id}`,
                    source: callerId,
                    target: def.id
                });
            });
        });

        // Calculate total neighbors and determine which nodes to show initially
        nodeMap.forEach(node => {
            node.totalNeighbors = node.dependencies.length + node.callers.length;
        });

        this.nodes = Array.from(nodeMap.values());
        this.links = linkData;
        this.nodeMap = nodeMap;

        // Initially show nodes with fewer connections or important nodes
        this.determineInitialVisibleNodes();
    }

    determineInitialVisibleNodes() {
        // Show root nodes (nodes with no callers) and their immediate dependencies
        const rootNodes = this.nodes.filter(node => node.callers.length === 0);
        const maxNodesToShow = Math.min(50, Math.max(20, this.nodes.length * 0.1));
        
        rootNodes.forEach(node => {
            this.visibleNodes.add(node.id);
            // Show some of their dependencies
            node.dependencies.slice(0, this.maxNeighborsToShow).forEach(depId => {
                this.visibleNodes.add(depId);
            });
        });

        // If we don't have enough visible nodes, add some high-degree nodes
        if (this.visibleNodes.size < maxNodesToShow) {
            const sortedByDegree = [...this.nodes]
                .sort((a, b) => b.totalNeighbors - a.totalNeighbors)
                .slice(0, maxNodesToShow - this.visibleNodes.size);
            
            sortedByDegree.forEach(node => {
                this.visibleNodes.add(node.id);
            });
        }

        // Add visible links
        this.links.forEach(link => {
            if (this.visibleNodes.has(link.source) && this.visibleNodes.has(link.target)) {
                this.visibleLinks.add(link.id);
            }
        });
    }

    createSearchIndex() {
        this.searchIndex = this.nodes.map(node => ({
            id: node.id,
            name: node.name.toLowerCase(),
            package: node.package.toLowerCase(),
            searchText: `${node.name} ${node.package} ${node.filePath}`.toLowerCase()
        }));
    }

    render() {
        this.renderLinks();
        this.renderNodes();
        this.updateSimulation();
    }

    renderLinks() {
        const visibleLinks = this.links.filter(link => 
            this.visibleLinks.has(link.id)
        );

        const linkSelection = this.g.selectAll('.link')
            .data(visibleLinks, d => d.id);

        linkSelection.exit().remove();

        linkSelection.enter()
            .append('line')
            .attr('class', 'link')
            .merge(linkSelection);
    }

    renderNodes() {
        const visibleNodes = this.nodes.filter(node => 
            this.visibleNodes.has(node.id)
        );

        const nodeSelection = this.g.selectAll('.node-group')
            .data(visibleNodes, d => d.id);

        nodeSelection.exit().remove();

        const nodeEnter = nodeSelection.enter()
            .append('g')
            .attr('class', 'node-group')
            .call(d3.drag()
                .on('start', this.dragstarted.bind(this))
                .on('drag', this.dragged.bind(this))
                .on('end', this.dragended.bind(this))
            );

        // Add main circle
        nodeEnter.append('circle')
            .attr('class', 'node-circle')
            .attr('r', this.nodeRadius)
            .attr('fill', d => this.getNodeColor(d));

        // Add main text
        nodeEnter.append('text')
            .attr('class', 'node-text')
            .attr('dy', -2)
            .text(d => this.truncateText(d.name, 12))
            .style('paint-order', 'stroke fill')
            .style('stroke', 'rgba(30, 30, 30, 0.8)')
            .style('stroke-width', '2px')
            .style('stroke-linejoin', 'round');

        // Add package text
        nodeEnter.append('text')
            .attr('class', 'node-package-text')
            .attr('dy', 12)
            .text(d => this.truncateText(d.package.split('/').pop() || '', 10))
            .style('paint-order', 'stroke fill')
            .style('stroke', 'rgba(30, 30, 30, 0.8)')
            .style('stroke-width', '1px')
            .style('stroke-linejoin', 'round');

        // Add neighbor count for collapsed nodes
        const neighborGroup = nodeEnter.append('g')
            .attr('class', 'neighbor-indicator')
            .style('display', d => this.shouldShowNeighborCount(d) ? 'block' : 'none')
            .style('cursor', 'pointer');

        neighborGroup.append('circle')
            .attr('class', 'neighbor-count-bg')
            .attr('r', 8)
            .attr('cx', 15)
            .attr('cy', -15);

        neighborGroup.append('text')
            .attr('class', 'neighbor-count')
            .attr('x', 15)
            .attr('y', -12)
            .text(d => this.getHiddenNeighborCount(d));

        // Add click handler for neighbor indicator
        neighborGroup.on('click', (event, d) => {
            event.stopPropagation();
            this.expandNode(d);
        });

        // Add click handlers
        nodeEnter.on('click', (event, d) => {
            event.stopPropagation();
            this.handleNodeClick(d);
        });

        nodeEnter.on('contextmenu', (event, d) => {
            event.preventDefault();
            this.showContextMenu(event, d);
        });

        // Add hover effects
        nodeEnter.on('mouseenter', (event, d) => {
            this.showTooltip(event, d);
            this.highlightNeighbors(d);
        });

        nodeEnter.on('mouseleave', () => {
            this.hideTooltip();
            this.clearHighlights();
        });

        // Merge with existing nodes
        nodeSelection.merge(nodeEnter)
            .select('.neighbor-indicator')
            .style('display', d => this.shouldShowNeighborCount(d) ? 'block' : 'none');

        nodeSelection.merge(nodeEnter)
            .select('.neighbor-count')
            .text(d => this.getHiddenNeighborCount(d));
    }

    updateSimulation() {
        const visibleNodes = this.nodes.filter(node => 
            this.visibleNodes.has(node.id)
        );
        const visibleLinks = this.links.filter(link => 
            this.visibleLinks.has(link.id)
        );

        this.simulation.nodes(visibleNodes);
        this.simulation.force('link').links(visibleLinks);

        this.simulation.on('tick', () => {
            this.g.selectAll('.link')
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            this.g.selectAll('.node-group')
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        this.simulation.restart();
    }

    getNodeColor(node) {
        if (node.isPlaceholder) return '#6b7280';
        if (this.expandedNodes.has(node.id)) return '#10b981';
        
        // Color by package or importance
        const packageHash = this.hashCode(node.package);
        const hue = Math.abs(packageHash) % 360;
        return `hsl(${hue}, 60%, 55%)`;
    }

    shouldShowNeighborCount(node) {
        if (this.expandedNodes.has(node.id)) return false;
        return this.getHiddenNeighborCount(node) > 0;
    }

    getHiddenNeighborCount(node) {
        const totalNeighbors = node.dependencies.length + node.callers.length;
        let visibleNeighbors = 0;
        
        [...node.dependencies, ...node.callers].forEach(neighborId => {
            if (this.visibleNodes.has(neighborId)) {
                visibleNeighbors++;
            }
        });

        return Math.max(0, totalNeighbors - visibleNeighbors);
    }

    handleNodeClick(node) {
        if (this.selectedNode === node) {
            // Double click - expand/collapse
            this.toggleNodeExpansion(node);
        } else {
            // Single click - select
            this.selectNode(node);
        }
    }

    selectNode(node) {
        // Clear previous selection
        this.g.selectAll('.node-circle').classed('selected', false);
        
        // Select new node
        this.selectedNode = node;
        this.g.selectAll('.node-group')
            .filter(d => d.id === node.id)
            .select('.node-circle')
            .classed('selected', true);

        this.showNodeDetails(node);
        this.highlightPath(node);
    }

    toggleNodeExpansion(node) {
        if (this.expandedNodes.has(node.id)) {
            this.collapseNode(node);
        } else {
            this.expandNode(node);
        }
    }

    expandNode(node) {
        this.expandedNodes.add(node.id);
        
        // Add hidden neighbors to visible set
        [...node.dependencies, ...node.callers].forEach(neighborId => {
            if (!this.visibleNodes.has(neighborId)) {
                this.visibleNodes.add(neighborId);
                
                // Add links involving this neighbor
                this.links.forEach(link => {
                    if ((link.source === neighborId || link.target === neighborId) &&
                        this.visibleNodes.has(link.source) && this.visibleNodes.has(link.target)) {
                        this.visibleLinks.add(link.id);
                    }
                });
            }
        });

        this.render();
    }

    collapseNode(node) {
        this.expandedNodes.delete(node.id);
        
        // Remove neighbors that should be hidden
        const neighborsToCheck = [...node.dependencies, ...node.callers];
        
        neighborsToCheck.forEach(neighborId => {
            // Check if this neighbor is connected to other visible nodes
            let hasOtherConnections = false;
            
            this.links.forEach(link => {
                if ((link.source === neighborId || link.target === neighborId)) {
                    const otherNode = link.source === neighborId ? link.target : link.source;
                    if (otherNode !== node.id && this.visibleNodes.has(otherNode)) {
                        hasOtherConnections = true;
                    }
                }
            });

            if (!hasOtherConnections && !this.expandedNodes.has(neighborId)) {
                this.visibleNodes.delete(neighborId);
                
                // Remove links involving this neighbor
                this.links.forEach(link => {
                    if (link.source === neighborId || link.target === neighborId) {
                        this.visibleLinks.delete(link.id);
                    }
                });
            }
        });

        this.render();
    }

    showNodeDetails(node) {
        document.getElementById('node-title').textContent = node.name;
        document.getElementById('node-name').textContent = node.name;
        document.getElementById('node-package').textContent = node.package;
        document.getElementById('node-file').textContent = node.filePath;
        document.getElementById('node-line').textContent = node.line;

        // Show dependencies
        const dependenciesContainer = document.getElementById('node-dependencies');
        dependenciesContainer.innerHTML = '';
        
        if (node.dependencies.length === 0) {
            dependenciesContainer.innerHTML = '<p class="no-data">No dependencies</p>';
        } else {
            node.dependencies.forEach(depId => {
                const depNode = this.nodeMap.get(depId);
                if (depNode) {
                    const item = document.createElement('div');
                    item.className = 'dependency-item';
                    item.innerHTML = `
                        <div class="search-result-name">${depNode.name}</div>
                        <div class="search-result-package">${depNode.package}</div>
                    `;
                    item.addEventListener('click', () => {
                        this.selectNode(depNode);
                    });
                    dependenciesContainer.appendChild(item);
                }
            });
        }

        // Show callers
        const callersContainer = document.getElementById('node-callers');
        callersContainer.innerHTML = '';
        
        if (node.callers.length === 0) {
            callersContainer.innerHTML = '<p class="no-data">No callers</p>';
        } else {
            node.callers.forEach(callerId => {
                const callerNode = this.nodeMap.get(callerId);
                if (callerNode) {
                    const item = document.createElement('div');
                    item.className = 'caller-item';
                    item.innerHTML = `
                        <div class="search-result-name">${callerNode.name}</div>
                        <div class="search-result-package">${callerNode.package}</div>
                    `;
                    item.addEventListener('click', () => {
                        this.selectNode(callerNode);
                    });
                    callersContainer.appendChild(item);
                }
            });
        }

        document.getElementById('node-details-panel').classList.remove('hidden');
    }

    hideNodeDetails() {
        document.getElementById('node-details-panel').classList.add('hidden');
        this.clearSelection();
    }

    clearSelection() {
        this.selectedNode = null;
        this.g.selectAll('.node-circle').classed('selected', false);
        this.g.selectAll('.link').classed('selected-path', false);
    }

    highlightPath(node) {
        // Clear previous highlights
        this.g.selectAll('.link').classed('selected-path', false);
        
        // Highlight links connected to this node
        this.g.selectAll('.link')
            .classed('selected-path', d => 
                d.source.id === node.id || d.target.id === node.id
            );
    }

    highlightNeighbors(node) {
        // Highlight connected links
        this.g.selectAll('.link')
            .classed('highlighted', d => 
                d.source.id === node.id || d.target.id === node.id
            );
            
        // Highlight connected nodes
        const connectedNodeIds = new Set();
        this.links.forEach(link => {
            if (link.source.id === node.id) {
                connectedNodeIds.add(link.target.id);
            } else if (link.target.id === node.id) {
                connectedNodeIds.add(link.source.id);
            }
        });
        
        this.g.selectAll('.node-circle')
            .classed('highlighted', d => connectedNodeIds.has(d.id));
    }

    clearHighlights() {
        this.g.selectAll('.link').classed('highlighted', false);
        this.g.selectAll('.node-circle').classed('highlighted', false);
    }

    handleSearch(query) {
        const resultsContainer = document.getElementById('search-results');
        
        if (!query.trim()) {
            resultsContainer.innerHTML = '';
            return;
        }

        const results = this.searchIndex.filter(item => 
            item.searchText.includes(query.toLowerCase())
        ).slice(0, 10);

        resultsContainer.innerHTML = '';
        
        results.forEach(result => {
            const node = this.nodeMap.get(result.id);
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="search-result-name">${node.name}</div>
                <div class="search-result-package">${node.package}</div>
            `;
            item.addEventListener('click', () => {
                this.focusOnNode(node);
                document.getElementById('search-input').value = '';
                resultsContainer.innerHTML = '';
            });
            resultsContainer.appendChild(item);
        });
    }

    focusOnNode(node) {
        // Make sure the node is visible
        if (!this.visibleNodes.has(node.id)) {
            this.visibleNodes.add(node.id);
            this.render();
        }

        // Select the node
        this.selectNode(node);

        // Center the view on the node
        const transform = d3.zoomIdentity
            .translate(this.svg.attr('width') / 2 - node.x, this.svg.attr('height') / 2 - node.y)
            .scale(1.5);

        this.svg.transition()
            .duration(750)
            .call(d3.zoom().transform, transform);
    }

    centerGraph() {
        const bounds = this.calculateGraphBounds();
        const width = this.svg.attr('width');
        const height = this.svg.attr('height');
        
        const scale = Math.min(
            width / (bounds.width + 100),
            height / (bounds.height + 100),
            2
        );

        const transform = d3.zoomIdentity
            .translate(
                width / 2 - (bounds.centerX * scale),
                height / 2 - (bounds.centerY * scale)
            )
            .scale(scale);

        this.svg.transition()
            .duration(750)
            .call(d3.zoom().transform, transform);
    }

    resetView() {
        // Reset to initial state
        this.expandedNodes.clear();
        this.clearSelection();
        this.hideNodeDetails();
        this.determineInitialVisibleNodes();
        this.render();
        this.centerGraph();
    }

    calculateGraphBounds() {
        const visibleNodes = this.nodes.filter(node => this.visibleNodes.has(node.id));
        
        if (visibleNodes.length === 0) {
            return { width: 0, height: 0, centerX: 0, centerY: 0 };
        }

        const xs = visibleNodes.map(n => n.x);
        const ys = visibleNodes.map(n => n.y);
        
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        return {
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    updateForces() {
        this.simulation
            .force('charge', d3.forceManyBody().strength(-300 * this.forceStrength))
            .force('link', d3.forceLink().id(d => d.id).distance(this.linkDistance));
        
        this.simulation.restart();
    }

    updateZoomLevel(scale) {
        const zoomElement = document.querySelector('.zoom-level');
        if (!zoomElement) {
            const zoom = document.createElement('div');
            zoom.className = 'zoom-level';
            document.body.appendChild(zoom);
        }
        document.querySelector('.zoom-level').textContent = `${Math.round(scale * 100)}%`;
    }

    showTooltip(event, node) {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = `
            <div><strong>${node.name}</strong></div>
            <div>${node.package}</div>
            <div>Dependencies: ${node.dependencies.length}</div>
            <div>Callers: ${node.callers.length}</div>
        `;
        
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
        
        document.body.appendChild(tooltip);
    }

    hideTooltip() {
        const tooltip = document.querySelector('.tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    showContextMenu(event, node) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        
        const actions = [
            { label: 'Focus on Node', action: () => this.focusOnNode(node) },
            { label: this.expandedNodes.has(node.id) ? 'Collapse' : 'Expand', action: () => this.toggleNodeExpansion(node) },
            { label: 'Show Details', action: () => this.showNodeDetails(node) }
        ];

        actions.forEach(action => {
            const item = document.createElement('div');
            item.className = 'context-menu-item';
            item.textContent = action.label;
            item.addEventListener('click', () => {
                action.action();
                menu.remove();
            });
            menu.appendChild(item);
        });

        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        document.body.appendChild(menu);

        // Remove menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', () => {
                menu.remove();
            }, { once: true });
        }, 0);
    }

    hideLoading() {
        document.getElementById('loading-indicator').classList.add('hidden');
    }

    showError(message) {
        const loading = document.getElementById('loading-indicator');
        loading.innerHTML = `
            <div style="color: #ef4444; text-align: center;">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 16px; padding: 8px 16px; background: #7c3aed; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }

    // Drag handlers
    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // Utility functions
    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }
}

// Initialize the graph view when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GraphView();
});
