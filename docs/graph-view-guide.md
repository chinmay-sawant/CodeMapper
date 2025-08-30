# CodeMapper Graph View - User Guide

## Overview
The new Obsidian-style Graph View provides an intuitive way to explore code dependencies with circular nodes and interactive features.

## Key Features

### 🔵 Circular Nodes
- Each function/method is represented as a circular node
- Colors are automatically assigned based on package
- Node size can indicate importance (configurable)

### 🔢 Neighbor Count Indicators
- Small circular badges show the number of hidden connections
- Click the badge (N) to expand and reveal hidden neighbors
- Only shows when there are hidden connections

### 🎯 Interactive Exploration
- **Single click**: Select node and show details
- **Double click**: Expand/collapse node neighbors
- **Right click**: Show context menu with actions
- **Hover**: Highlight connected nodes and relationships

### 🔍 Search & Navigation
- **Live search**: Type to filter nodes in real-time
- **Search results**: Click any result to focus on that node
- **Auto-focus**: Graph centers on selected nodes

### ⌨️ Keyboard Shortcuts
- `Ctrl+F`: Focus search input
- `Ctrl+C`: Center the graph view
- `Ctrl+R`: Reset to initial view
- `Space`: Expand/collapse selected node
- `Esc`: Clear selection and close panels

### 📊 Details Panel
- Shows comprehensive node information
- Lists all dependencies and callers
- Click any dependency/caller to navigate
- Automatically updates based on selection

### 🎮 Controls
- **Force Strength**: Adjust node repulsion
- **Link Distance**: Control spacing between connected nodes
- **Center Graph**: Fit all visible nodes in view
- **Reset View**: Return to initial state

## Usage Tips

1. **Start Small**: Begin with root nodes (no incoming connections)
2. **Expand Gradually**: Click neighbor indicators to reveal more connections
3. **Use Search**: Find specific functions quickly with the search bar
4. **Follow Paths**: Click through dependencies to trace execution flows
5. **Reset When Lost**: Use Ctrl+R to return to the overview

## Visual Cues

- **Yellow outline**: Selected node
- **Green outline**: Expanded nodes with all neighbors shown
- **Red outline**: Highlighted during hover
- **Pulsing animation**: Currently selected node
- **Animated links**: Show direction and active connections

## Performance

The graph initially shows a subset of nodes to maintain performance. Expand nodes progressively to explore the full codebase while keeping the interface responsive.
