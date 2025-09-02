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
        
        // Performance optimizations
        this.cachedLinkElements = null;
        this.cachedNodeElements = null;
        this.animationFrameId = null;
        this.currentZoomLevel = 1;
        this.renderThrottleTimeout = null;
        this.lastRenderTime = 0;
        this.minRenderInterval = 16; // 60fps limit
        
        // Viewport optimization
        this.viewportBounds = { x: 0, y: 0, width: 0, height: 0 };
        this.viewportPadding = 200; // Extra padding for smooth pan
        
        // Graph parameters
        this.forceStrength = 0.5;
        this.linkDistance = 100;
        this.nodeRadius = 35;
        this.maxNeighborsToShow = 3;
        this.maxVisibleNodes = 100; // Limit visible nodes for performance
        
        this.init();
    }

    async init() {
        try {
            console.time('GraphView Initialization');
            
            await this.loadData();
            console.timeLog('GraphView Initialization', 'Data loaded');
            
            this.setupUI();
            console.timeLog('GraphView Initialization', 'UI setup complete');
            
            this.setupGraph();
            console.timeLog('GraphView Initialization', 'Graph setup complete');
            
            this.processData();
            console.timeLog('GraphView Initialization', 'Data processed');
            
            this.createSearchIndex();
            console.timeLog('GraphView Initialization', 'Search index created');
            
            this.render();
            console.timeLog('GraphView Initialization', 'Initial render complete');
            
            this.hideLoading();
            console.timeEnd('GraphView Initialization');
            
        } catch (error) {
            console.error('Failed to initialize graph view:', error);
            this.showError('Failed to load graph data. Please try refreshing the page.');
        }
    }

    async loadData() {
        try {
            const response = await fetch('/api/codemap');
            if (!response.ok) {
                throw new Error(`Failed to load data: ${response.status}`);
            }
            this.data = await response.json();
        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }

    setupUI() {
        // Setup controls with debouncing for better performance
        let forceUpdateTimer = null;
        
        document.getElementById('force-strength').addEventListener('input', (e) => {
            this.forceStrength = parseFloat(e.target.value);
            
            // Debounce force updates to avoid too many simulation restarts
            clearTimeout(forceUpdateTimer);
            forceUpdateTimer = setTimeout(() => {
                this.updateForces();
            }, 100);
        });

        document.getElementById('link-distance').addEventListener('input', (e) => {
            this.linkDistance = parseInt(e.target.value);
            
            // Debounce force updates to avoid too many simulation restarts
            clearTimeout(forceUpdateTimer);
            forceUpdateTimer = setTimeout(() => {
                this.updateForces();
            }, 100);
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

        // Setup search with debouncing
        const searchInput = document.getElementById('search-input');
        let searchTimer = null;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.handleSearch(e.target.value);
            }, 200); // 200ms debounce
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
        
        this.viewportBounds = { x: 0, y: 0, width: rect.width, height: rect.height };
        
        this.svg = d3.select('#graph-svg')
            .attr('width', rect.width)
            .attr('height', rect.height);

        // Create zoom behavior with optimized handling
        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => {
                this.handleZoom(event);
            });

        this.svg.call(zoom);

        // Create main group for graph elements
        this.g = this.svg.append('g');

        // Setup simulation with performance-optimized settings
        this.simulation = d3.forceSimulation()
            .alphaDecay(0.05) // Faster convergence
            .velocityDecay(0.6) // Higher damping for stability
            .force('link', d3.forceLink().id(d => d.id).distance(this.linkDistance).strength(0.6))
            .force('charge', d3.forceManyBody().strength(-200 * this.forceStrength).distanceMax(250))
            .force('center', d3.forceCenter(rect.width / 2, rect.height / 2))
            .force('collision', d3.forceCollide().radius(this.nodeRadius + 8).strength(0.5));

        // Handle window resize with optimized debouncing
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
    }

    handleZoom(event) {
        const { transform } = event;
        this.currentZoomLevel = transform.k;
        
        // Update viewport bounds for culling
        this.viewportBounds = {
            x: -transform.x / transform.k - this.viewportPadding,
            y: -transform.y / transform.k - this.viewportPadding,
            width: this.svg.attr('width') / transform.k + this.viewportPadding * 2,
            height: this.svg.attr('height') / transform.k + this.viewportPadding * 2
        };
        
        this.g.attr('transform', transform);
        this.updateZoomLevel(transform.k);
        
        // Throttle rendering during zoom
        this.throttledRender();
    }

    handleResize() {
        const container = document.getElementById('graph-container');
        const newRect = container.getBoundingClientRect();
        
        this.viewportBounds.width = newRect.width;
        this.viewportBounds.height = newRect.height;
        
        this.svg.attr('width', newRect.width).attr('height', newRect.height);
        this.simulation.force('center', d3.forceCenter(newRect.width / 2, newRect.height / 2));
        
        // Only restart if simulation is nearly stopped
        if (this.simulation.alpha() < 0.1) {
            this.simulation.alpha(0.2).restart();
        }
    }

    throttledRender() {
        if (this.renderThrottleTimeout) return;
        
        this.renderThrottleTimeout = setTimeout(() => {
            this.updateNodeVisibility();
            this.renderThrottleTimeout = null;
        }, 50);
    }

    processData() {
        // Create nodes from definitions with optimized processing
        const nodeMap = new Map();
        const linkData = [];

        // Process in chunks to avoid blocking the main thread
        const processChunk = (startIndex, chunkSize) => {
            const endIndex = Math.min(startIndex + chunkSize, this.data.length);
            
            for (let i = startIndex; i < endIndex; i++) {
                const mapping = this.data[i];
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
                        importance: 0, // For prioritization
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
                            importance: 0,
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
            }
        };

        // Process data in chunks to maintain responsiveness
        const chunkSize = 100;
        for (let i = 0; i < this.data.length; i += chunkSize) {
            processChunk(i, chunkSize);
        }

        // Calculate importance and total neighbors
        nodeMap.forEach(node => {
            node.totalNeighbors = node.dependencies.length + node.callers.length;
            // Higher importance for nodes with more connections (centrality)
            node.importance = node.totalNeighbors + (node.callers.length * 2); // Callers weighted more
        });

        this.nodes = Array.from(nodeMap.values());
        this.links = linkData;
        this.nodeMap = nodeMap;

        // Create spatial index for efficient visibility culling
        this.createSpatialIndex();

        // Initially show nodes with fewer connections or important nodes
        this.determineInitialVisibleNodes();
    }

    createSpatialIndex() {
        // Simple grid-based spatial index for viewport culling
        this.spatialGrid = new Map();
        this.gridSize = 200; // Grid cell size
        
        this.nodes.forEach(node => {
            const gridX = Math.floor(node.x / this.gridSize);
            const gridY = Math.floor(node.y / this.gridSize);
            const key = `${gridX},${gridY}`;
            
            if (!this.spatialGrid.has(key)) {
                this.spatialGrid.set(key, []);
            }
            this.spatialGrid.get(key).push(node);
        });
    }

    determineInitialVisibleNodes() {
        // Prioritize nodes by importance and show only the most important ones initially
        const sortedNodes = [...this.nodes]
            .sort((a, b) => b.importance - a.importance)
            .slice(0, this.maxVisibleNodes);
        
        sortedNodes.forEach(node => {
            this.visibleNodes.add(node.id);
        });

        // Add visible links for initial nodes
        this.updateVisibleLinks();
    }

    updateVisibleLinks() {
        this.visibleLinks.clear();
        
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
        // Clear any cached DOM elements to ensure fresh selections
        this.clearDOMCache();
        
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

        const linkEnter = linkSelection.enter()
            .append('line')
            .attr('class', d => {
                // All links in our data represent dependency relationships
                // (source calls target, so target is a dependency of source)
                return `link dependency`;
            })
            .style('stroke', '#3b82f6') // Blue for dependencies
            .style('stroke-width', 1.5)
            .style('stroke-opacity', 0.7)
            .style('stroke-dasharray', '5,3') // Dotted lines with distinctive pattern
            .style('stroke-linecap', 'round'); // Rounded line caps for better appearance

        // Store reference for efficient updates
        this.cachedLinkElements = linkEnter.merge(linkSelection);
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

        // Add main text - only if zoom level is sufficient
        const textGroup = nodeEnter.append('g')
            .attr('class', 'node-text-group')
            .style('display', this.currentZoomLevel > 0.5 ? 'block' : 'none');

        textGroup.append('text')
            .attr('class', 'node-text')
            .attr('dy', -3)
            .text(d => this.truncateText(d.name, 15))
            .style('paint-order', 'stroke fill')
            .style('stroke', 'rgba(30, 30, 30, 0.8)')
            .style('stroke-width', '2px')
            .style('stroke-linejoin', 'round');

        // Add package text - only at higher zoom levels
        textGroup.append('text')
            .attr('class', 'node-package-text')
            .attr('dy', 13)
            .text(d => this.currentZoomLevel > 0.8 ? this.truncateText(d.package.split('/').pop() || '', 13) : '')
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
            .attr('r', 10)
            .attr('cx', 22)
            .attr('cy', -22);

        neighborGroup.append('text')
            .attr('class', 'neighbor-count')
            .attr('x', 22)
            .attr('y', -18)
            .text(d => this.getHiddenNeighborCount(d));

        // Add click handler for neighbor indicator
        neighborGroup.on('click', (event, d) => {
            event.stopPropagation();
            this.expandNode(d);
        });

        // Add optimized event handlers
        this.addNodeEventHandlers(nodeEnter);

        // Store merged selection for efficient updates
        this.cachedNodeElements = nodeSelection.merge(nodeEnter);
        
        // Update visibility based on zoom level
        this.updateNodeVisibility();
    }

    updateNodeVisibility() {
        if (!this.cachedNodeElements) return;
        
        // Update text visibility based on zoom level
        this.cachedNodeElements.selectAll('.node-text-group')
            .style('display', this.currentZoomLevel > 0.5 ? 'block' : 'none');
            
        this.cachedNodeElements.selectAll('.node-package-text')
            .text(d => this.currentZoomLevel > 0.8 ? this.truncateText(d.package.split('/').pop() || '', 13) : '');

        // Update neighbor indicators
        this.cachedNodeElements.selectAll('.neighbor-indicator')
            .style('display', d => this.shouldShowNeighborCount(d) ? 'block' : 'none');

        this.cachedNodeElements.selectAll('.neighbor-count')
            .text(d => this.getHiddenNeighborCount(d));
    }

    addNodeEventHandlers(nodeEnter) {
        // Optimized click handlers with debouncing
        let clickTimeout = null;
        
        nodeEnter.on('click', (event, d) => {
            event.stopPropagation();
            
            clearTimeout(clickTimeout);
            clickTimeout = setTimeout(() => {
                this.handleNodeClick(d);
            }, 150); // Debounce to handle double clicks
        });

        nodeEnter.on('dblclick', (event, d) => {
            event.stopPropagation();
            clearTimeout(clickTimeout);
            this.toggleNodeExpansion(d);
        });

        nodeEnter.on('contextmenu', (event, d) => {
            event.preventDefault();
            this.showContextMenu(event, d);
        });

        // Throttled hover effects
        let hoverTimeout = null;
        
        nodeEnter.on('mouseenter', (event, d) => {
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                this.showTooltip(event, d);
                this.highlightNeighbors(d);
            }, 100);
        });

        nodeEnter.on('mouseleave', () => {
            clearTimeout(hoverTimeout);
            this.hideTooltip();
            this.clearHighlights();
        });
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

        // Optimized tick handler with requestAnimationFrame
        this.simulation.on('tick', () => {
            this.optimizedTick();
        });

        // Clear cached elements when simulation ends
        this.simulation.on('end', () => {
            this.clearDOMCache();
        });

        this.simulation.restart();
    }

    optimizedTick() {
        // Cancel previous animation frame if still pending
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        this.animationFrameId = requestAnimationFrame(() => {
            const now = performance.now();
            
            // Throttle to maintain 60fps
            if (now - this.lastRenderTime < this.minRenderInterval) {
                return;
            }
            
            this.lastRenderTime = now;

            // Batch DOM updates
            if (this.cachedLinkElements) {
                this.cachedLinkElements
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
            }

            if (this.cachedNodeElements) {
                this.cachedNodeElements
                    .attr('transform', d => `translate(${d.x},${d.y})`);
            }
            
            this.animationFrameId = null;
        });
    }

    clearDOMCache() {
        // Method to clear cached DOM elements when re-rendering
        this.cachedLinkElements = null;
        this.cachedNodeElements = null;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
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
        if (!this.simulation) {
            console.warn('Simulation not initialized yet');
            return;
        }
        
        // Update force parameters
        this.simulation
            .force('charge', d3.forceManyBody().strength(-300 * this.forceStrength))
            .force('link', d3.forceLink().id(d => d.id).distance(this.linkDistance))
            .force('collision', d3.forceCollide().radius(this.nodeRadius + 10));
        
        // Only restart if the simulation is not already running
        if (this.simulation.alpha() < 0.1) {
            this.simulation.alpha(0.3).restart();
        }
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
        try {
            // Remove any existing tooltip first
            this.hideTooltip();
            
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
        } catch (error) {
            console.warn('Failed to show tooltip:', error);
        }
    }

    hideTooltip() {
        try {
            const tooltips = document.querySelectorAll('.tooltip');
            tooltips.forEach(tooltip => tooltip.remove());
        } catch (error) {
            console.warn('Failed to hide tooltip:', error);
        }
    }

    showContextMenu(event, node) {
        try {
            // Remove any existing context menu
            const existingMenu = document.querySelector('.context-menu');
            if (existingMenu) {
                existingMenu.remove();
            }
            
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
                    try {
                        action.action();
                        menu.remove();
                    } catch (error) {
                        console.error('Context menu action failed:', error);
                        menu.remove();
                    }
                });
                menu.appendChild(item);
            });

            menu.style.left = event.pageX + 'px';
            menu.style.top = event.pageY + 'px';
            
            document.body.appendChild(menu);

            // Remove menu when clicking elsewhere
            setTimeout(() => {
                const clickHandler = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', clickHandler);
                    }
                };
                document.addEventListener('click', clickHandler);
            }, 0);
        } catch (error) {
            console.warn('Failed to show context menu:', error);
        }
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
        if (text.length <= maxLength) return text;
        
        // Try to break at word boundaries for better readability
        if (text.includes('_')) {
            const parts = text.split('_');
            let result = parts[0];
            for (let i = 1; i < parts.length; i++) {
                if ((result + '_' + parts[i]).length <= maxLength) {
                    result += '_' + parts[i];
                } else {
                    break;
                }
            }
            if (result.length < text.length) {
                return result + '...';
            }
        }
        
        return text.substring(0, maxLength - 3) + '...';
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
    try {
        // Add a small delay to ensure all resources are loaded
        setTimeout(() => {
            try {
                new GraphView();
            } catch (error) {
                console.error('GraphView initialization failed:', error);
                // Show error in the loading indicator
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.innerHTML = `
                        <div style="color: #ef4444; text-align: center;">
                            <h3>Initialization Error</h3>
                            <p>Failed to initialize the graph view. Please refresh the page.</p>
                            <button onclick="location.reload()" style="margin-top: 16px; padding: 8px 16px; background: #7c3aed; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Refresh Page
                            </button>
                        </div>
                    `;
                }
            }
        }, 100);
    } catch (error) {
        console.error('DOMContentLoaded handler failed:', error);
    }
});
