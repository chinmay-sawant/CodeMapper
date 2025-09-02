# Optimized Graph View

This is an optimized version of the CodeMapper graph view that significantly improves performance and reduces lag, especially when dealing with large codebases.

## Key Features

### Performance Optimizations
- **Limited Node Rendering**: Initially shows only the 100 most important nodes
- **Level of Detail**: Text labels appear only when zoomed in sufficiently
- **60fps Animation**: Throttled rendering maintains smooth 60fps animation
- **Smart Expansion**: Limits neighbor expansion to prevent performance issues
- **Debounced Interactions**: Optimized event handling reduces unnecessary computations

### Visual Improvements
- **Reduced Animation Complexity**: Simplified transitions for better performance
- **Efficient Visual Effects**: Lighter shadows and effects for lower GPU usage
- **Responsive Design**: Adapts to different screen sizes and zoom levels

### User Experience
- **Progressive Discovery**: Start with key nodes and expand as needed
- **Fast Search**: Optimized search with debouncing
- **Performance Monitoring**: Real-time FPS and node count display
- **Keyboard Shortcuts**: Quick navigation and control

## Usage

### Navigation
- **Pan**: Click and drag empty space
- **Zoom**: Mouse wheel or trackpad
- **Select Node**: Click on any node
- **Expand/Collapse**: Double-click node or click the neighbor count indicator
- **Search**: Ctrl+F to focus search box

### Keyboard Shortcuts
- `Ctrl+F`: Focus search
- `Ctrl+C`: Center graph
- `Ctrl+R`: Reset view
- `Space`: Expand/collapse selected node
- `Esc`: Clear selection

### Controls
- **Force Strength**: Adjusts how strongly nodes repel each other
- **Link Distance**: Sets the preferred distance between connected nodes
- **Center Graph**: Fits all visible nodes in view
- **Reset View**: Returns to initial state

## Performance Tips

### For Large Codebases
1. **Start Small**: Let the system show important nodes first
2. **Expand Gradually**: Add nodes incrementally rather than all at once
3. **Use Search**: Find specific functions quickly
4. **Monitor Performance**: Watch the FPS counter in bottom-right corner

### Optimal Settings
- Keep visible nodes under 200 for best performance
- Use search to navigate rather than expanding everything
- Zoom in to see text details clearly

## Technical Details

### Browser Requirements
- Modern browser with WebGL support
- Recommended: Chrome 90+, Firefox 88+, Safari 14+

### Performance Monitoring
The bottom-right corner shows:
- **FPS**: Current frame rate (aim for 55-60)
- **Nodes**: Number of visible nodes
- **Links**: Number of visible connections

Color coding:
- 🟢 Green: Excellent performance (55+ FPS)
- 🟡 Yellow: Good performance (30-54 FPS)  
- 🔴 Red: Poor performance (<30 FPS)

### Files
- `script_optimized.js`: Main optimized graph implementation
- `index.html`: HTML structure
- `styles.css`: Optimized CSS with reduced animations
- `PERFORMANCE.md`: Detailed performance optimization documentation

## Troubleshooting

### If the graph is still slow:
1. Reduce the number of visible nodes (use search/expand selectively)
2. Check browser developer tools for performance bottlenecks
3. Close other browser tabs/applications
4. Try a different browser

### If nodes don't appear:
1. Check the browser console for errors
2. Ensure the `/api/codemap` endpoint is accessible
3. Verify the data format matches expectations

## Feedback

The optimization focuses on maintaining smooth performance while preserving all the functionality of the original graph view. If you encounter any issues or have suggestions for further improvements, please refer to the PERFORMANCE.md file for detailed technical information.
