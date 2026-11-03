import { Html } from "@react-three/drei";
import type { GraphNode } from "../lib/types";
import { colorForLabel, colorForStatus } from "../lib/colors";
import { slopTooltipRows } from "../lib/sloppiness";
import type { SlopFile } from "../lib/sloppiness";

interface NodeTooltipProps {
  node: GraphNode;
  slop?: { scope: string; file?: SlopFile };
}

function lineRange(node: GraphNode): string | null {
  if (!node.start_line) return null;
  if (node.end_line && node.end_line !== node.start_line)
    return `L${node.start_line}-${node.end_line}`;
  return `L${node.start_line}`;
}

export function NodeTooltip({ node, slop }: NodeTooltipProps) {
  return (
    <Html
      position={[node.x, node.y + node.size * 0.7, node.z]}
      center
      style={{ pointerEvents: "none" }}
    >
      <div className="bg-[#1a1a2e]/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl max-w-[350px]">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: colorForLabel(node.label) }}
          />
          <span className="text-white font-medium truncate">{node.name}</span>
          <span className="text-white/30 ml-1 shrink-0">{node.label}</span>
        </div>
        {node.file_path && (
          <p className="text-white/30 font-mono truncate">
            {node.file_path}
            {lineRange(node) && <span className="text-white/40"> · {lineRange(node)}</span>}
          </p>
        )}
        {node.status && node.status !== "structural" && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: colorForStatus(node.status) }}
            />
            <span className="text-white/45">{node.status}</span>
            {node.in_calls !== undefined && (
              <span className="text-white/25">
                · {node.in_calls} caller{node.in_calls === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        {slop && <div className="mt-2 border-t border-white/10 pt-1 text-white/60">
          {slopTooltipRows(slop.file).map(([name, value]) => <p key={name}>{name}: {value}</p>)}
          <p className="text-amber-200/70">{slop.scope} file context · revision alignment unverified</p>
        </div>}
        <p className="text-white/20 mt-1 text-[10px]">click for code →</p>
      </div>
    </Html>
  );
}
