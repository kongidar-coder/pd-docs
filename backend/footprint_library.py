"""
Component footprint definitions.
All dimensions in mm.
"""
from models import PCBPad
from typing import List, Tuple


def _smd_2pad(pad_pitch: float, pad_w: float, pad_h: float) -> List[PCBPad]:
    return [
        PCBPad(name="1", x=-pad_pitch / 2, y=0, width=pad_w, height=pad_h, shape="rect"),
        PCBPad(name="2", x=pad_pitch / 2,  y=0, width=pad_w, height=pad_h, shape="rect"),
    ]


def _tht_2pad(pitch: float, drill: float = 0.8, pad_d: float = 1.6) -> List[PCBPad]:
    return [
        PCBPad(name="1", x=-pitch / 2, y=0, width=pad_d, height=pad_d,
               drill=drill, shape="circle"),
        PCBPad(name="2", x=pitch / 2,  y=0, width=pad_d, height=pad_d,
               drill=drill, shape="circle"),
    ]


def _dip_pads(pin_count: int, row_pitch: float = 7.62,
              col_pitch: float = 2.54, drill: float = 0.8) -> List[PCBPad]:
    """DIP package: two rows of pins, numbered counter-clockwise."""
    pads = []
    half = pin_count // 2
    pad_d = 1.6
    for i in range(half):
        y = (i - (half - 1) / 2) * col_pitch
        pads.append(PCBPad(name=str(i + 1), x=-row_pitch / 2, y=y,
                           width=pad_d, height=pad_d, drill=drill, shape="circle"))
    for i in range(half):
        y = ((half - 1 - i) - (half - 1) / 2) * col_pitch
        pads.append(PCBPad(name=str(pin_count - i), x=row_pitch / 2, y=y,
                           width=pad_d, height=pad_d, drill=drill, shape="circle"))
    return pads


def _sop_pads(pin_count: int, row_pitch: float = 5.4,
              col_pitch: float = 1.27) -> List[PCBPad]:
    """SOIC / SOP package."""
    pads = []
    half = pin_count // 2
    for i in range(half):
        y = (i - (half - 1) / 2) * col_pitch
        pads.append(PCBPad(name=str(i + 1), x=-row_pitch / 2, y=y,
                           width=0.6, height=1.8, shape="rect"))
    for i in range(half):
        y = ((half - 1 - i) - (half - 1) / 2) * col_pitch
        pads.append(PCBPad(name=str(pin_count - i), x=row_pitch / 2, y=y,
                           width=0.6, height=1.8, shape="rect"))
    return pads


def _connector_pads(pin_count: int, pitch: float = 2.54,
                    drill: float = 1.0) -> List[PCBPad]:
    pads = []
    for i in range(pin_count):
        y = (i - (pin_count - 1) / 2) * pitch
        pads.append(PCBPad(name=str(i + 1), x=0, y=y,
                           width=1.8, height=1.8, drill=drill, shape="circle"))
    return pads


def _qfp_pads(pin_count: int, pitch: float = 0.8,
              pad_w: float = 0.45, pad_h: float = 1.5,
              body_size: float = 7.0) -> List[PCBPad]:
    """QFP package with equal pins on all four sides."""
    pads = []
    per_side = pin_count // 4
    offset = body_size / 2 + pad_h / 2
    for i in range(per_side):
        y = (i - (per_side - 1) / 2) * pitch
        pads.append(PCBPad(name=str(i + 1), x=-offset, y=y,
                           width=pad_h, height=pad_w, shape="rect"))
    for i in range(per_side):
        x = (i - (per_side - 1) / 2) * pitch
        pads.append(PCBPad(name=str(per_side + i + 1), x=x, y=offset,
                           width=pad_w, height=pad_h, shape="rect"))
    for i in range(per_side):
        y = ((per_side - 1 - i) - (per_side - 1) / 2) * pitch
        pads.append(PCBPad(name=str(2 * per_side + i + 1), x=offset, y=y,
                           width=pad_h, height=pad_w, shape="rect"))
    for i in range(per_side):
        x = ((per_side - 1 - i) - (per_side - 1) / 2) * pitch
        pads.append(PCBPad(name=str(3 * per_side + i + 1), x=x, y=-offset,
                           width=pad_w, height=pad_h, shape="rect"))
    return pads


def _sot23_pads() -> List[PCBPad]:
    """SOT-23: 3-pin small transistor package."""
    return [
        PCBPad(name="1", x=-1.9 / 2, y=-0.95, width=0.6, height=0.9, shape="rect"),
        PCBPad(name="2", x=-1.9 / 2, y=0.95,  width=0.6, height=0.9, shape="rect"),
        PCBPad(name="3", x=1.9 / 2,  y=0,     width=0.6, height=1.9, shape="rect"),
    ]


# ── bounding box helpers ──────────────────────────────────────────────────────

def _bbox_from_pads(pads: List[PCBPad], margin: float = 1.0) -> Tuple[float, float]:
    if not pads:
        return (2.0, 2.0)
    xs = [p.x + p.width / 2 for p in pads] + [p.x - p.width / 2 for p in pads]
    ys = [p.y + p.height / 2 for p in pads] + [p.y - p.height / 2 for p in pads]
    return (max(xs) - min(xs) + margin, max(ys) - min(ys) + margin)


# ── public API ────────────────────────────────────────────────────────────────

PACKAGE_TABLE = {
    # SMD passives
    "0402": lambda: (_smd_2pad(0.5, 0.5, 0.6), 1.4, 1.0),
    "0603": lambda: (_smd_2pad(0.8, 0.9, 0.9), 2.0, 1.4),
    "0805": lambda: (_smd_2pad(1.2, 1.3, 1.4), 3.2, 2.0),
    "1206": lambda: (_smd_2pad(1.8, 1.8, 1.8), 4.0, 2.2),
    # THT passives
    "THT-2.54": lambda: (_tht_2pad(2.54), 4.5, 2.5),
    "THT-5.08": lambda: (_tht_2pad(5.08), 7.0, 3.5),
    "THT-2.54-LED": lambda: (_tht_2pad(2.54, drill=0.8), 4.5, 2.5),
    # DIP
    "DIP-8":  lambda: (_dip_pads(8),  10.5, 9.5),
    "DIP-14": lambda: (_dip_pads(14), 10.5, 17.5),
    "DIP-16": lambda: (_dip_pads(16), 10.5, 20.0),
    "DIP-20": lambda: (_dip_pads(20), 10.5, 25.0),
    "DIP-28": lambda: (_dip_pads(28), 10.5, 35.0),
    # SOIC
    "SOIC-8":  lambda: (_sop_pads(8),  8.0,  5.0),
    "SOIC-14": lambda: (_sop_pads(14), 8.0,  9.0),
    "SOIC-16": lambda: (_sop_pads(16), 8.0, 11.0),
    # SOT
    "SOT-23": lambda: (_sot23_pads(), 3.5, 3.5),
    # QFP
    "TQFP-32": lambda: (_qfp_pads(32), 11.0, 11.0),
    "TQFP-44": lambda: (_qfp_pads(44), 13.0, 13.0),
    "TQFP-64": lambda: (_qfp_pads(64), 14.0, 14.0),
    # Connectors
    "CONN-2":  lambda: (_connector_pads(2),  3.0,  5.5),
    "CONN-3":  lambda: (_connector_pads(3),  3.0,  8.0),
    "CONN-4":  lambda: (_connector_pads(4),  3.0, 10.5),
    "CONN-6":  lambda: (_connector_pads(6),  3.0, 15.5),
    "CONN-8":  lambda: (_connector_pads(8),  3.0, 20.5),
    "CONN-10": lambda: (_connector_pads(10), 3.0, 25.5),
}

# Default package per component type
DEFAULT_PACKAGES = {
    "resistor":          "0603",
    "capacitor":         "0603",
    "led":               "0603",
    "diode":             "0603",
    "inductor":          "0603",
    "transistor":        "SOT-23",
    "ic":                "DIP-8",
    "connector":         "CONN-2",
    "crystal":           "THT-5.08",
    "voltage_regulator": "SOT-23",
    "ground":            "0402",
    "power":             "0402",
}


def get_footprint(package: str):
    """Return (pads, width_mm, height_mm) for the given package string."""
    if package in PACKAGE_TABLE:
        return PACKAGE_TABLE[package]()
    # Fallback for unknown packages
    pads = _smd_2pad(0.8, 0.9, 0.9)
    return pads, 2.0, 1.4


def resolve_package(component_type: str, preferred: str) -> str:
    if preferred and preferred in PACKAGE_TABLE:
        return preferred
    return DEFAULT_PACKAGES.get(component_type, "0603")
