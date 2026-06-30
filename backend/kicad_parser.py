"""
KiCad schematic file parser (.kicad_sch S-expression format).
"""
import re
from typing import List, Dict, Tuple, Optional
from models import SchematicComponent, Net, NetPin, Netlist, ComponentType


# ── S-expression tokenizer / parser ──────────────────────────────────────────

def tokenize(text: str) -> List[str]:
    tokens = []
    i = 0
    while i < len(text):
        c = text[i]
        if c in '()':
            tokens.append(c)
            i += 1
        elif c == '"':
            j = i + 1
            while j < len(text) and not (text[j] == '"' and text[j - 1] != '\\'):
                j += 1
            tokens.append(text[i:j + 1])
            i = j + 1
        elif c in ' \t\r\n':
            i += 1
        else:
            j = i
            while j < len(text) and text[j] not in ' \t\r\n()':
                j += 1
            tokens.append(text[i:j])
            i = j
    return tokens


def parse_sexp(tokens: List[str], pos: int = 0):
    """Parse S-expression from token list, return (value, next_pos)."""
    if tokens[pos] != '(':
        val = tokens[pos].strip('"')
        return val, pos + 1
    result = []
    pos += 1
    while tokens[pos] != ')':
        child, pos = parse_sexp(tokens, pos)
        result.append(child)
    return result, pos + 1


def find_all(node, key: str) -> List:
    """Find all child lists starting with key."""
    results = []
    if isinstance(node, list):
        if node and node[0] == key:
            results.append(node)
        for child in node[1:]:
            results.extend(find_all(child, key))
    return results


def find_first(node, key: str) -> Optional[list]:
    matches = find_all(node, key)
    return matches[0] if matches else None


def get_str(node, key: str, default: str = "") -> str:
    sub = find_first(node, key)
    if sub and len(sub) > 1:
        return str(sub[1])
    return default


# ── Classifier ───────────────────────────────────────────────────────────────

_TYPE_MAP = {
    r'^R': "resistor",
    r'^C': "capacitor",
    r'^L': "inductor",
    r'^D': "diode",
    r'^LED': "led",
    r'^Q': "transistor",
    r'^U': "ic",
    r'^IC': "ic",
    r'^J': "connector",
    r'^CN': "connector",
    r'^P': "connector",
    r'^SW': "ic",
    r'^VR': "voltage_regulator",
    r'^Y': "crystal",
    r'^XTAL': "crystal",
    r'^GND': "ground",
    r'^VCC': "power",
    r'^VDD': "power",
    r'^PWR': "power",
}

def classify_ref(ref: str) -> str:
    for pattern, ctype in _TYPE_MAP.items():
        if re.match(pattern, ref, re.IGNORECASE):
            return ctype
    return "ic"


_PIN_COUNTS = {
    "resistor": 2, "capacitor": 2, "led": 2, "diode": 2,
    "inductor": 2, "transistor": 3, "crystal": 2,
    "voltage_regulator": 3, "ground": 1, "power": 1,
}


# ── Net extraction from wires ─────────────────────────────────────────────────

class Point:
    def __init__(self, x, y):
        self.x = round(float(x), 4)
        self.y = round(float(y), 4)

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y

    def __hash__(self):
        return hash((self.x, self.y))

    def __repr__(self):
        return f"({self.x},{self.y})"


def build_nets_from_wires(
    wires: List[Tuple[Point, Point]],
    pin_positions: Dict[str, List[Tuple[Point, str, str]]],  # pos → [(ref, pin_name)]
) -> List[Net]:
    """Union-Find net extraction from wire segments."""
    # Build adjacency list
    adj: Dict[Point, List[Point]] = {}
    for a, b in wires:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)

    # BFS to find connected groups
    visited: set = set()
    groups: List[set] = []

    all_points = set(adj.keys())
    for pt in list(pin_positions.keys()):
        all_points.add(pt)

    for start in all_points:
        if start in visited:
            continue
        group = set()
        queue = [start]
        while queue:
            cur = queue.pop()
            if cur in visited:
                continue
            visited.add(cur)
            group.add(cur)
            for nbr in adj.get(cur, []):
                if nbr not in visited:
                    queue.append(nbr)
        groups.append(group)

    nets = []
    for idx, group in enumerate(groups):
        pins = []
        for pt in group:
            for ref, pin_name in pin_positions.get(pt, []):
                pins.append(NetPin(component_ref=ref, pin_name=pin_name))
        if pins:
            nets.append(Net(name=f"Net_{idx + 1}", pins=pins))
    return nets


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_kicad_sch(content: str) -> Netlist:
    tokens = tokenize(content)
    try:
        tree, _ = parse_sexp(tokens)
    except Exception as e:
        raise ValueError(f"Failed to parse KiCad file: {e}")

    components: List[SchematicComponent] = []
    pin_positions: Dict[Point, List[Tuple[str, str]]] = {}
    wires: List[Tuple[Point, Point]] = []

    # Track reference counters for auto-naming
    ref_counts: Dict[str, int] = {}

    for sym in find_all(tree, "symbol"):
        lib_id_node = find_first(sym, "lib_id")
        lib_id = lib_id_node[1] if lib_id_node and len(lib_id_node) > 1 else ""

        # Get reference
        ref = ""
        value = ""
        for prop in find_all(sym, "property"):
            if len(prop) > 2:
                pname = str(prop[1]).strip('"')
                pval = str(prop[2]).strip('"')
                if pname == "Reference":
                    ref = pval
                elif pname == "Value":
                    value = pval

        if not ref or ref.startswith("~") or ref == "":
            continue
        if ref.endswith("?"):
            prefix = ref[:-1]
            ref_counts[prefix] = ref_counts.get(prefix, 0) + 1
            ref = f"{prefix}{ref_counts[prefix]}"

        # Position
        at_node = find_first(sym, "at")
        if at_node and len(at_node) >= 3:
            try:
                sx = float(at_node[1])
                sy = float(at_node[2])
            except Exception:
                sx, sy = 0.0, 0.0
        else:
            sx, sy = 0.0, 0.0

        # Classify
        ctype = classify_ref(ref)
        pin_count = _PIN_COUNTS.get(ctype, 2)

        # Collect pin positions
        for pin in find_all(sym, "pin"):
            at = find_first(pin, "at")
            pin_name_node = find_first(pin, "name")
            if at and len(at) >= 3:
                try:
                    px = round(sx + float(at[1]), 4)
                    py = round(sy + float(at[2]), 4)
                except Exception:
                    continue
                pt = Point(px, py)
                pname = str(pin_name_node[1]).strip('"') if pin_name_node and len(pin_name_node) > 1 else "~"
                pin_positions.setdefault(pt, []).append((ref, pname))
                pin_count = max(pin_count, 1)

        pkg_map = {
            "resistor": "0603", "capacitor": "0603", "led": "0603",
            "diode": "0603", "inductor": "0603", "transistor": "SOT-23",
            "connector": "CONN-2", "crystal": "THT-5.08",
            "voltage_regulator": "SOT-23", "ic": "DIP-8",
        }

        components.append(SchematicComponent(
            ref=ref,
            type=ComponentType(ctype),
            value=value,
            package=pkg_map.get(ctype, "0603"),
            pin_count=pin_count,
        ))

    # Parse wires
    for wire in find_all(tree, "wire"):
        pts = find_first(wire, "pts")
        if not pts:
            continue
        xy_nodes = find_all(pts, "xy")
        if len(xy_nodes) >= 2:
            try:
                a = Point(float(xy_nodes[0][1]), float(xy_nodes[0][2]))
                b = Point(float(xy_nodes[1][1]), float(xy_nodes[1][2]))
                wires.append((a, b))
            except Exception:
                pass

    # Parse global labels and power symbols as net labels
    for label in find_all(tree, "global_label") + find_all(tree, "net_tie"):
        at = find_first(label, "at")
        if at and len(label) > 1:
            lname = str(label[1]).strip('"')
            if at and len(at) >= 3:
                try:
                    pt = Point(float(at[1]), float(at[2]))
                    pin_positions.setdefault(pt, []).append(("__label__", lname))
                except Exception:
                    pass

    nets = build_nets_from_wires(wires, pin_positions)

    # Name nets from power/label pins
    for net in nets:
        for pin in net.pins:
            if pin.component_ref == "__label__":
                net.name = pin.pin_name
                net.pins = [p for p in net.pins if p.component_ref != "__label__"]
                break

    # Filter components with nets only (skip power symbols without connections)
    real_components = [c for c in components if c.type not in (ComponentType.GROUND, ComponentType.POWER)]

    return Netlist(components=real_components, nets=nets)
