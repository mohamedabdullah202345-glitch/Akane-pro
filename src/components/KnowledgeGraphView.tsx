import React, { useState } from 'react';
import type { KnowledgeGraphLink, KnowledgeGraphNode } from '../types/akane';
import { Network, Sparkles, User, Briefcase, Target, Heart } from 'lucide-react';

interface KnowledgeGraphViewProps {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
  onNodeClick?: (node: KnowledgeGraphNode) => void;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  nodes,
  links,
  onNodeClick,
}) => {
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);

  // Position nodes radially around center
  const width = 360;
  const height = 300;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 100;

  const nodePositions = nodes.map((node, idx) => {
    if (node.id === 'user') return { ...node, x: centerX, y: centerY };
    const angle = (idx / (nodes.length - 1)) * 2 * Math.PI;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  const getNodePos = (id: string) => {
    return nodePositions.find((n) => n.id === id) || { x: centerX, y: centerY };
  };

  const getCategoryColor = (category: KnowledgeGraphNode['category']) => {
    switch (category) {
      case 'person':
        return '#E62739';
      case 'project':
        return '#3B82F6';
      case 'goal':
        return '#10B981';
      case 'habit':
        return '#F59E0B';
      default:
        return '#8B5CF6';
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F1EC]">
          <Network className="w-4 h-4 text-[#A3202B]" />
          <span>Personal Knowledge Graph</span>
        </div>
        <span className="text-xs font-mono text-[#F5F1EC]/60">{nodes.length} nodes · {links.length} connections</span>
      </div>

      <div className="relative w-full h-[300px] overflow-hidden rounded-xl bg-[#0B0C0A]/60 border border-white/5 flex items-center justify-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          {/* Links */}
          {links.map((link, idx) => {
            const source = getNodePos(link.source);
            const target = getNodePos(link.target);
            return (
              <g key={idx}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="rgba(245, 241, 236, 0.2)"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
              </g>
            );
          })}

          {/* Nodes */}
          {nodePositions.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            const color = getCategoryColor(node.category);
            return (
              <g
                key={node.id}
                className="cursor-pointer transition-transform duration-200"
                onClick={() => {
                  setSelectedNode(node);
                  onNodeClick?.(node);
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 22 : 18}
                  fill="#0B0C0A"
                  stroke={color}
                  strokeWidth={isSelected ? 4 : 2.5}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={6}
                  fill={color}
                />
                <text
                  x={node.x}
                  y={node.y + 32}
                  textAnchor="middle"
                  fill="#F5F1EC"
                  fontSize="10"
                  fontWeight="600"
                  className="pointer-events-none select-none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {selectedNode && (
          <div className="absolute bottom-2 left-2 right-2 p-2 rounded-xl bg-[#0B0C0A]/90 border border-[#A3202B]/40 text-xs text-[#F5F1EC] flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="font-semibold">{selectedNode.label}</span>
              <span className="text-[#F5F1EC]/60 ml-2">({selectedNode.category})</span>
            </div>
            <span className="text-[10px] text-[#A3202B] font-mono">Importance: {selectedNode.importance}/10</span>
          </div>
        )}
      </div>
    </div>
  );
};
