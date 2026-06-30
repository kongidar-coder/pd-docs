"""
Lee's algorithm (BFS maze router) for PCB trace auto-routing.
Grid resolution: GRID_MM mm per cell.
"""
import math
from collections import deque
from typing import List, Dict, Tuple, Optional, Set
from models import PCBLayout, PCBTrace, PCBVia, PCBComponent, Point

GRID_MM = 0.1          # mm per grid cell
TRACE_WIDTH = 0.25     # mm
CLEARANCE = 0.2        # mm minimum clearance
CLEARANCE_CELLS = max(1, int(CLEARANCE / GRID_MM))
MAX_CELLS = 2_000_000  # abort search if grid is too large


def _mm_to_cell(mm: float) -> int:
    return round(mm / GRID_MM)


def _cell_to_mm(cell: int) -> float:
    return cell * GRID_MM


def _pad_cells(comp: PCBComponent):
    """Yield (row, col, net) for each pad centre cell."""
    for pad in comp.pads:
        px = comp.x + pad.x
        py = comp.y + pad.y
        yield (_mm_to_cell(py), _mm_to_cell(px), pad.net)


def _obstacle_cells(comp: PCBComponent, clearance: int) -> Set[Tuple[int, int]]:
    """Return set of (row, col) cells blocked by this component's pads."""
    cells: Set[Tuple[int, int]] = set()
    for pad in comp.pads:
        px = comp.x + pad.x
        py = comp.y + pad.y
        hw = int(math.ceil((pad.width / 2 + CLEARANCE) / GRID_MM))
        hh = int(math.ceil((pad.height / 2 + CLEARANCE) / GRID_MM))
        cr = _mm_to_cell(py)
        cc = _mm_to_cell(px)
        for dr in range(-hh, hh + 1):
            for dc in range(-hw, hw + 1):
                cells.add((cr + dr, cc + dc))
    return cells


def _simplify_path(path: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """Remove collinear intermediate points."""
    if len(path) <= 2:
        return path
    simplified = [path[0]]
    for i in range(1, len(path) - 1):
        pr, pc = path[i - 1]
        cr, cc = path[i]
        nr, nc = path[i + 1]
        # Keep point only if direction changes
        if (cr - pr, cc - pc) != (nr - cr, nc - cc):
            simplified.append(path[i])
    simplified.append(path[-1])
    return simplified


def route_all(layout: PCBLayout) -> PCBLayout:
    """
    Route all nets in the layout using the Lee algorithm.
    Modifies layout.traces in-place and returns the layout.
    """
    rows = _mm_to_cell(layout.height) + 2
    cols = _mm_to_cell(layout.width) + 2

    if rows * cols > MAX_CELLS:
        # Board too large for dense grid; skip routing
        return layout

    # Build obstacle grid
    grid = [[False] * cols for _ in range(rows)]

    # Mark board edges as obstacles
    for r in range(rows):
        grid[r][0] = True
        if cols > 1:
            grid[r][cols - 1] = True
    for c in range(cols):
        grid[0][c] = True
        if rows > 1:
            grid[rows - 1][c] = True

    # Mark component body cells as obstacles
    for comp in layout.components:
        for (r, c, _) in _pad_cells(comp):
            # Block clearance ring around each pad
            hw = int(math.ceil((max(p.width for p in comp.pads) / 2 + CLEARANCE) / GRID_MM))
            hh = int(math.ceil((max(p.height for p in comp.pads) / 2 + CLEARANCE) / GRID_MM))
            for dr in range(-hh, hh + 1):
                for dc in range(-hw, hw + 1):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols:
                        grid[nr][nc] = True
        # But leave the exact pad centre open so we can route to it
    for comp in layout.components:
        for (r, c, _) in _pad_cells(comp):
            if 0 <= r < rows and 0 <= c < cols:
                grid[r][c] = False

    # Build net → list of (comp, pad) pairs
    net_pads: Dict[str, List[Tuple[str, int, int]]] = {}  # net → [(ref, row, col)]
    for comp in layout.components:
        for (r, c, net) in _pad_cells(comp):
            if net:
                net_pads.setdefault(net, []).append((comp.ref, r, c))

    traces: List[PCBTrace] = []

    for net_name, pad_list in net_pads.items():
        if len(pad_list) < 2:
            continue

        # Connect pads in a Minimum Spanning Tree order (greedy nearest-neighbour)
        connected = [pad_list[0]]
        remaining = pad_list[1:]

        while remaining:
            best_path = None
            best_dist = float("inf")
            best_target_idx = -1
            best_source = None

            for src_ref, sr, sc in connected:
                for ti, (t_ref, tr, tc) in enumerate(remaining):
                    dist = abs(tr - sr) + abs(tc - sc)
                    if dist < best_dist:
                        best_dist = dist
                        best_source = (sr, sc)
                        best_target_idx = ti
                        target_rc = (tr, tc)

            if best_source is None:
                break

            path = _bfs_route(grid, best_source, target_rc, rows, cols)

            if path:
                path = _simplify_path(path)
                points = [Point(x=_cell_to_mm(c), y=_cell_to_mm(r)) for r, c in path]
                traces.append(PCBTrace(
                    net=net_name,
                    layer="front",
                    points=points,
                    width=TRACE_WIDTH,
                ))
                # Mark routed path as obstacle
                for r, c in path:
                    for dr in range(-CLEARANCE_CELLS, CLEARANCE_CELLS + 1):
                        for dc in range(-CLEARANCE_CELLS, CLEARANCE_CELLS + 1):
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < rows and 0 <= nc < cols:
                                grid[nr][nc] = True
                # Re-open start/end pad centres
                for r, c in [best_source, target_rc]:
                    if 0 <= r < rows and 0 <= c < cols:
                        grid[r][c] = False

            connected.append(remaining.pop(best_target_idx))

    layout.traces = traces
    return layout


def _bfs_route(
    grid: List[List[bool]],
    start: Tuple[int, int],
    end: Tuple[int, int],
    rows: int,
    cols: int,
    max_steps: int = 50_000,
) -> Optional[List[Tuple[int, int]]]:
    """BFS from start to end on the grid. Returns path or None."""
    if start == end:
        return [start]

    queue: deque = deque()
    queue.append((start, [start]))
    visited: Set[Tuple[int, int]] = {start}
    steps = 0

    while queue and steps < max_steps:
        (r, c), path = queue.popleft()
        steps += 1

        for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if (nr, nc) in visited:
                continue
            if (nr, nc) == end:
                return path + [(nr, nc)]
            if not grid[nr][nc]:
                visited.add((nr, nc))
                queue.append(((nr, nc), path + [(nr, nc)]))

    return None
