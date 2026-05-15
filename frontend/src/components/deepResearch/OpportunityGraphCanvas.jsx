import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';

// Deep Research Phase 8 — Force-Directed Opportunity Graph Canvas.
//
// SVG-rendered, vanilla force-directed simulation. NO external graph
// library — keeps the bundle slim and the rendering deterministic. The
// simulation is a tiny n-body / spring layout that runs for a bounded
// number of ticks and then stops; it doesn't keep the CPU busy after the
// graph settles.
//
// Inputs: { nodes: [{kind, value, label}], edges: [{fromKind, fromValue,
// toKind, toValue, edgeType, weight}] }. The data shape mirrors
// /api/v1/deep-research/graph/neighborhood.

const NODE_COLOR = {
  opportunity: '#1e88e5',
  agency: '#ec4899',
  technology: '#a855f7',
  vendor: '#f59e0b',
  naics: '#10b981',
  keyword: '#06b6d4',
  venture: '#22c55e',
  cluster: '#7c3aed',
  pursuit: '#0891b2',
  ecosystem: '#3b82f6',
  default: '#64748b',
};

const NODE_RADIUS = {
  opportunity: 6,
  default: 9,
};

const nodeKey = (n) => `${n.kind}:${n.value}`;
const edgeKey = (e) => `${e.fromKind}:${e.fromValue}->${e.toKind}:${e.toValue}`;

// Force-directed simulation in ~70 lines of math. Bounded iteration count
// so the worker stops naturally.
function runSimulation(nodes, edges, { width, height, iterations = 200 } = {}) {
  if (nodes.length === 0) return nodes;
  const k = Math.sqrt((width * height) / Math.max(1, nodes.length));
  // Initialize positions in a tidy circle so the simulation has structure
  // to push against on tick 1 (random init produces ugly first frames).
  const positions = new Map();
  const cx = width / 2; const cy = height / 2;
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const r = Math.min(width, height) / 3;
    positions.set(nodeKey(n), {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
    });
  });
  const repulsionK = k * k;
  for (let iter = 0; iter < iterations; iter += 1) {
    // Repulsion — n-body.
    for (let i = 0; i < nodes.length; i += 1) {
      const pi = positions.get(nodeKey(nodes[i]));
      let fx = 0; let fy = 0;
      for (let j = 0; j < nodes.length; j += 1) {
        if (i === j) continue;
        const pj = positions.get(nodeKey(nodes[j]));
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = repulsionK / d2;
        fx += f * dx;
        fy += f * dy;
      }
      pi.vx = (pi.vx + fx) * 0.55;
      pi.vy = (pi.vy + fy) * 0.55;
    }
    // Attraction — springs along edges.
    for (const e of edges) {
      const a = positions.get(`${e.fromKind}:${e.fromValue}`);
      const b = positions.get(`${e.toKind}:${e.toValue}`);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = (d * d) / k * 0.04;
      const ux = dx / d; const uy = dy / d;
      a.vx -= ux * f; a.vy -= uy * f;
      b.vx += ux * f; b.vy += uy * f;
    }
    // Apply velocity with cooling.
    const cooling = 1 - iter / iterations;
    for (const p of positions.values()) {
      p.x += p.vx * cooling;
      p.y += p.vy * cooling;
      // Clamp to canvas with padding.
      p.x = Math.max(40, Math.min(width - 40, p.x));
      p.y = Math.max(40, Math.min(height - 40, p.y));
    }
  }
  return nodes.map((n) => ({ ...n, ...positions.get(nodeKey(n)) }));
}

export default function OpportunityGraphCanvas({
  nodes = [], edges = [],
  width = 800, height = 480,
  onNodeClick = null, onEdgeClick = null,
  highlightKind = null,
}) {
  const svgRef = useRef(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(null);

  // Re-run the simulation only when the input data actually changes.
  const positioned = useMemo(
    () => runSimulation(nodes, edges, { width, height, iterations: 180 }),
    [nodes, edges, width, height],
  );

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  const onMouseDown = useCallback((e) => {
    if (e.target.tagName === 'svg') {
      setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const onMouseMove = useCallback((e) => {
    if (dragging) {
      setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
    }
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  if (nodes.length === 0) {
    return (
      <div
        className="rounded border border-gray-200 bg-gray-50 text-center text-xs text-gray-500 italic p-8"
        data-testid="opportunity-graph-empty"
      >
        Graph has no nodes yet. Refresh the graph or pick a richer center node.
      </div>
    );
  }

  // Build a position-map so edges can be drawn.
  const posByKey = new Map(positioned.map((n) => [nodeKey(n), n]));
  const transform = `translate(${pan.x},${pan.y}) scale(${zoom})`;

  return (
    <div className="rounded border border-gray-200 bg-white overflow-hidden">
      <div className="flex justify-between items-center p-2 text-xs text-gray-500 border-b border-gray-100">
        <span>
          {nodes.length} node{nodes.length === 1 ? '' : 's'} ·{' '}
          {edges.length} edge{edges.length === 1 ? '' : 's'}
        </span>
        <span className="italic">Scroll to zoom · drag the background to pan · click a node to inspect.</span>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: dragging ? 'grabbing' : 'grab', display: 'block' }}
        data-testid="opportunity-graph-canvas"
      >
        <g transform={transform}>
          {/* Edges */}
          {edges.map((e) => {
            const a = posByKey.get(`${e.fromKind}:${e.fromValue}`);
            const b = posByKey.get(`${e.toKind}:${e.toValue}`);
            if (!a || !b) return null;
            const isHover = hoverKey === edgeKey(e);
            return (
              <line
                key={edgeKey(e)}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isHover ? '#0891b2' : '#cbd5e1'}
                strokeWidth={isHover ? 2 : 1}
                opacity={isHover ? 1 : 0.6}
                onMouseEnter={() => setHoverKey(edgeKey(e))}
                onMouseLeave={() => setHoverKey(null)}
                onClick={() => onEdgeClick && onEdgeClick(e)}
                style={{ cursor: onEdgeClick ? 'pointer' : 'default' }}
              />
            );
          })}
          {/* Nodes */}
          {positioned.map((n) => {
            const r = NODE_RADIUS[n.kind] || NODE_RADIUS.default;
            const color = NODE_COLOR[n.kind] || NODE_COLOR.default;
            const isHover = hoverKey === nodeKey(n);
            const dimmed = highlightKind && n.kind !== highlightKind;
            return (
              <g
                key={nodeKey(n)}
                transform={`translate(${n.x},${n.y})`}
                onMouseEnter={() => setHoverKey(nodeKey(n))}
                onMouseLeave={() => setHoverKey(null)}
                onClick={() => onNodeClick && onNodeClick(n)}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
              >
                <circle
                  r={r + (isHover ? 3 : 0)}
                  fill={color}
                  opacity={dimmed ? 0.25 : 1}
                  stroke={isHover ? '#0f172a' : 'white'}
                  strokeWidth={isHover ? 2 : 1}
                />
                {(isHover || (n.kind !== 'opportunity' && !dimmed)) && (
                  <text
                    x={r + 6}
                    y={4}
                    fontSize={11}
                    fill="#1e293b"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {(n.label || n.value || '').slice(0, 40)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 p-2 text-[11px] text-gray-600 border-t border-gray-100">
        {[
          ['opportunity', 'Opportunity'],
          ['agency', 'Agency'],
          ['technology', 'Technology'],
          ['vendor', 'Vendor'],
          ['naics', 'NAICS'],
          ['venture', 'Venture'],
          ['cluster', 'Cluster'],
          ['keyword', 'Keyword'],
        ].map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span style={{ width: 8, height: 8, borderRadius: 8, background: NODE_COLOR[k] || NODE_COLOR.default, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
