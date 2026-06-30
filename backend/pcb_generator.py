"""
Auto-placement algorithm for PCB components.
Uses a connectivity-aware grid placement with force-directed refinement.
"""
import math
from typing import List, Dict, Tuple, Optional
from models import Netlist, PCBComponent, PCBPad, PCBLayout, Point
from footprint_library import get_footprint, resolve_package


BOARD_MARGIN = 5.0       # mm margin around board edge
COMPONENT_GAP = 1.5      # mm minimum gap between components


def _assign_footprints(netlist: Netlist) -> List[PCBComponent]:
    """Map each netlist component to a PCB footprint with pads."""
    placed = []
    for comp in netlist.components:
        pkg = resolve_package(comp.type, comp.package)
        pads, w, h = get_footprint(pkg)
        placed.append(PCBComponent(
            ref=comp.ref,
            type=comp.type,
            package=pkg,
            x=0.0, y=0.0,
            rotation=0.0,
            pads=[p.model_copy() for p in pads],
            value=comp.value,
            width=w,
            height=h,
        ))
    return placed


def _connectivity_score(ref: str, nets) -> int:
    """Count how many nets include this component."""
    return sum(1 for net in nets for p in net.pins if p.component_ref == ref)


def _connected_refs(ref: str, nets) -> List[str]:
    """Return refs of all components directly connected to this one."""
    connected = set()
    for net in nets:
        refs_in_net = {p.component_ref for p in net.pins}
        if ref in refs_in_net:
            connected |= refs_in_net
    connected.discard(ref)
    return list(connected)


def _place_grid(components: List[PCBComponent], netlist: Netlist) -> None:
    """
    Connectivity-aware grid placement.
    1. Sort by connection count (most connected → center).
    2. Place each component greedily near its most-connected neighbour.
    """
    if not components:
        return

    # Sort: most connected first
    scores = {c.ref: _connectivity_score(c.ref, netlist.nets) for c in components}
    sorted_comps = sorted(components, key=lambda c: -scores[c.ref])

    placed_map: Dict[str, PCBComponent] = {}
    occupied: List[Tuple[float, float, float, float]] = []  # (x1,y1,x2,y2)

    def overlaps(x: float, y: float, w: float, h: float) -> bool:
        hw, hh = w / 2 + COMPONENT_GAP / 2, h / 2 + COMPONENT_GAP / 2
        for (ox1, oy1, ox2, oy2) in occupied:
            if (x - hw < ox2 and x + hw > ox1 and
                    y - hh < oy2 and y + hh > oy1):
                return True
        return False

    def claim(x: float, y: float, w: float, h: float):
        occupied.append((x - w / 2, y - h / 2, x + w / 2, y + h / 2))

    def try_place(comp: PCBComponent, cx: float, cy: float) -> bool:
        """Spiral search around (cx, cy) for a free cell."""
        step = max(comp.width, comp.height) + COMPONENT_GAP
        for ring in range(30):
            if ring == 0:
                candidates = [(cx, cy)]
            else:
                candidates = []
                for dx in range(-ring, ring + 1):
                    for dy in range(-ring, ring + 1):
                        if abs(dx) == ring or abs(dy) == ring:
                            candidates.append((cx + dx * step, cy + dy * step))
            for (tx, ty) in candidates:
                if not overlaps(tx, ty, comp.width, comp.height):
                    comp.x, comp.y = tx, ty
                    claim(tx, ty, comp.width, comp.height)
                    placed_map[comp.ref] = comp
                    return True
        return False

    for comp in sorted_comps:
        # Find target centre: average of placed neighbours
        neighbours = _connected_refs(comp.ref, netlist.nets)
        placed_neighbours = [placed_map[r] for r in neighbours if r in placed_map]

        if placed_neighbours:
            cx = sum(n.x for n in placed_neighbours) / len(placed_neighbours)
            cy = sum(n.y for n in placed_neighbours) / len(placed_neighbours)
        else:
            cx, cy = 0.0, 0.0

        if not try_place(comp, cx, cy):
            # Fallback: place at origin+offset
            comp.x = len(placed_map) * 10.0
            comp.y = 0.0
            claim(comp.x, comp.y, comp.width, comp.height)
            placed_map[comp.ref] = comp


def _shift_to_positive(components: List[PCBComponent]) -> Tuple[float, float]:
    """Shift all components so the bottom-left pad is at (BOARD_MARGIN, BOARD_MARGIN)."""
    if not components:
        return 0.0, 0.0
    min_x = min(c.x - c.width / 2 for c in components)
    min_y = min(c.y - c.height / 2 for c in components)
    dx = BOARD_MARGIN - min_x
    dy = BOARD_MARGIN - min_y
    for c in components:
        c.x += dx
        c.y += dy
    return dx, dy


def _assign_nets_to_pads(components: List[PCBComponent], netlist: Netlist) -> None:
    """Populate PCBPad.net for each pad from the netlist."""
    pad_net: Dict[Tuple[str, str], str] = {}
    for net in netlist.nets:
        for pin in net.pins:
            pad_net[(pin.component_ref, pin.pin_name)] = net.name

    for comp in components:
        for pad in comp.pads:
            key = (comp.ref, pad.name)
            pad.net = pad_net.get(key, "")


def generate_layout(netlist: Netlist) -> PCBLayout:
    """Full pipeline: footprint assignment → placement → board sizing."""
    components = _assign_footprints(netlist)
    _place_grid(components, netlist)
    _shift_to_positive(components)
    _assign_nets_to_pads(components, netlist)

    if components:
        max_x = max(c.x + c.width / 2 for c in components)
        max_y = max(c.y + c.height / 2 for c in components)
    else:
        max_x, max_y = 20.0, 20.0

    board_w = max_x + BOARD_MARGIN
    board_h = max_y + BOARD_MARGIN

    return PCBLayout(
        width=board_w,
        height=board_h,
        components=components,
        traces=[],   # filled in by the router
        vias=[],
        design_name=netlist.design_name,
    )
