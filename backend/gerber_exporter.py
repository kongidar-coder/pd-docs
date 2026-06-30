"""
Gerber RS-274X and Excellon drill file generator.
Coordinate format: FSLAX46Y46 (4 integer, 6 decimal digits) in mm.
1 mm = 1,000,000 Gerber units.
"""
import io
import math
import zipfile
from typing import List, Dict, Tuple
from models import PCBLayout, PCBComponent, PCBPad, PCBTrace, Point

SCALE = 1_000_000  # Gerber units per mm


def _gu(mm: float) -> int:
    """Convert mm to Gerber units."""
    return round(mm * SCALE)


def _coord(x: float, y: float) -> str:
    return f"X{_gu(x)}Y{_gu(y)}"


# ── Aperture management ───────────────────────────────────────────────────────

class ApertureManager:
    def __init__(self):
        self._defs: Dict[str, int] = {}   # key → D-code
        self._next = 10

    def _key_circle(self, d: float) -> str:
        return f"C,{d:.4f}"

    def _key_rect(self, w: float, h: float) -> str:
        return f"R,{w:.4f}X{h:.4f}"

    def get_circle(self, diameter: float) -> int:
        k = self._key_circle(diameter)
        if k not in self._defs:
            self._defs[k] = self._next
            self._next += 1
        return self._defs[k]

    def get_rect(self, width: float, height: float) -> int:
        k = self._key_rect(width, height)
        if k not in self._defs:
            self._defs[k] = self._next
            self._next += 1
        return self._defs[k]

    def definitions(self) -> List[str]:
        lines = []
        for k, d in self._defs.items():
            lines.append(f"%ADD{d}{k}*%")
        return lines


# ── File builders ─────────────────────────────────────────────────────────────

def _gerber_header(name: str, layer: str) -> List[str]:
    return [
        f"%TF.GenerationSoftware,PCBDesignTool,1.0*%",
        f"%TF.FileFunction,{layer}*%",
        "%FSLAX46Y46*%",
        "%MOMM*%",
        "%LPD*%",
    ]


def _gerber_footer() -> List[str]:
    return ["M02*"]


def _build_copper_layer(
    layout: PCBLayout, layer: str, apertures: ApertureManager
) -> str:
    lines = _gerber_header(layout.design_name, f"Copper,L1,{layer.capitalize()}")
    defs_placeholder = "__APERTURES__"
    lines.append(defs_placeholder)
    body: List[str] = []

    cur_d = -1

    def select(d: int):
        nonlocal cur_d
        if d != cur_d:
            body.append(f"D{d}*")
            cur_d = d

    # Flash pads
    for comp in layout.components:
        if layer == "front" and comp.layer != "front":
            continue
        if layer == "back" and comp.layer != "back":
            continue
        for pad in comp.pads:
            px = comp.x + pad.x
            py = comp.y + pad.y
            if pad.shape == "circle" or pad.drill is not None:
                d = apertures.get_circle(pad.width)
            else:
                d = apertures.get_rect(pad.width, pad.height)
            select(d)
            body.append(f"{_coord(px, py)}D03*")

    # Draw traces
    trace_d_cache: Dict[float, int] = {}
    for trace in layout.traces:
        if trace.layer != layer:
            continue
        if len(trace.points) < 2:
            continue
        if trace.width not in trace_d_cache:
            trace_d_cache[trace.width] = apertures.get_circle(trace.width)
        d = trace_d_cache[trace.width]
        select(d)
        body.append(f"{_coord(trace.points[0].x, trace.points[0].y)}D02*")
        for pt in trace.points[1:]:
            body.append(f"{_coord(pt.x, pt.y)}D01*")

    lines += body
    lines += _gerber_footer()

    # Inject aperture definitions after header
    result = "\n".join(lines)
    ap_block = "\n".join(apertures.definitions())
    result = result.replace(defs_placeholder, ap_block, 1)
    return result


def _build_silkscreen(layout: PCBLayout) -> str:
    apertures = ApertureManager()
    lines = _gerber_header(layout.design_name, "Legend,Top")
    lines.append("__APERTURES__")
    body: List[str] = []

    text_ap = apertures.get_circle(0.1)
    body.append(f"D{text_ap}*")

    for comp in layout.components:
        # Draw a rectangle outline around each component
        x1, y1 = comp.x - comp.width / 2, comp.y - comp.height / 2
        x2, y2 = comp.x + comp.width / 2, comp.y + comp.height / 2

        body.append(f"{_coord(x1, y1)}D02*")
        body.append(f"{_coord(x2, y1)}D01*")
        body.append(f"{_coord(x2, y2)}D01*")
        body.append(f"{_coord(x1, y2)}D01*")
        body.append(f"{_coord(x1, y1)}D01*")

    lines += body
    lines.append("__APERTURES__")
    lines += _gerber_footer()
    result = "\n".join(lines)
    ap_block = "\n".join(apertures.definitions())
    result = result.replace("__APERTURES__", ap_block, 1)
    result = result.replace("\n__APERTURES__", "", 1)
    return result


def _build_soldermask(layout: PCBLayout, layer: str) -> str:
    """Solder mask: openings over pads (add small clearance)."""
    apertures = ApertureManager()
    func = "SolderMask,Top" if layer == "front" else "SolderMask,Bot"
    lines = _gerber_header(layout.design_name, func)
    lines.append("__APERTURES__")
    body: List[str] = []
    cur_d = -1
    mask_exp = 0.05  # mm solder mask expansion

    def select(d: int):
        nonlocal cur_d
        if d != cur_d:
            body.append(f"D{d}*")
            cur_d = d

    for comp in layout.components:
        if layer == "front" and comp.layer != "front":
            continue
        if layer == "back" and comp.layer != "back":
            continue
        for pad in comp.pads:
            px, py = comp.x + pad.x, comp.y + pad.y
            if pad.shape == "circle" or pad.drill is not None:
                d = apertures.get_circle(pad.width + mask_exp * 2)
            else:
                d = apertures.get_rect(pad.width + mask_exp * 2,
                                       pad.height + mask_exp * 2)
            select(d)
            body.append(f"{_coord(px, py)}D03*")

    lines += body
    lines += _gerber_footer()
    result = "\n".join(lines)
    ap_block = "\n".join(apertures.definitions())
    result = result.replace("__APERTURES__", ap_block, 1)
    return result


def _build_board_outline(layout: PCBLayout) -> str:
    apertures = ApertureManager()
    lines = _gerber_header(layout.design_name, "Profile,NP")
    d = apertures.get_circle(0.05)
    lines += apertures.definitions()
    lines.append(f"D{d}*")
    lines.append(f"{_coord(0, 0)}D02*")
    lines.append(f"{_coord(layout.width, 0)}D01*")
    lines.append(f"{_coord(layout.width, layout.height)}D01*")
    lines.append(f"{_coord(0, layout.height)}D01*")
    lines.append(f"{_coord(0, 0)}D01*")
    lines += _gerber_footer()
    return "\n".join(lines)


def _build_drill_file(layout: PCBLayout) -> str:
    """Excellon drill file for through-hole pads."""
    # Group drills by diameter
    drills: Dict[float, List[Tuple[float, float]]] = {}
    for comp in layout.components:
        for pad in comp.pads:
            if pad.drill is not None:
                px, py = comp.x + pad.x, comp.y + pad.y
                drills.setdefault(pad.drill, []).append((px, py))

    if not drills:
        return ""

    lines = [
        "M48",
        "METRIC,LZ",
        "FMAT,2",
    ]
    tool_idx = {}
    for i, diam in enumerate(sorted(drills.keys()), start=1):
        lines.append(f"T{i}C{diam:.3f}")
        tool_idx[diam] = i
    lines.append("%")
    lines.append("G90")
    lines.append("G05")

    for diam in sorted(drills.keys()):
        lines.append(f"T{tool_idx[diam]}")
        for x, y in drills[diam]:
            xu = round(x * 1000)
            yu = round(y * 1000)
            lines.append(f"X{xu}Y{yu}")

    lines.append("T0")
    lines.append("M30")
    return "\n".join(lines)


# ── Public API ────────────────────────────────────────────────────────────────

def export_gerbers(layout: PCBLayout) -> bytes:
    """Return a ZIP archive containing all Gerber and drill files."""
    name = layout.design_name

    front_ap = ApertureManager()
    back_ap = ApertureManager()

    front_cu = _build_copper_layer(layout, "front", front_ap)
    back_cu = _build_copper_layer(layout, "back", back_ap)
    silk = _build_silkscreen(layout)
    fmask = _build_soldermask(layout, "front")
    bmask = _build_soldermask(layout, "back")
    outline = _build_board_outline(layout)
    drill = _build_drill_file(layout)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{name}-F.Cu.gbr", front_cu)
        zf.writestr(f"{name}-B.Cu.gbr", back_cu)
        zf.writestr(f"{name}-F.Silkscreen.gbr", silk)
        zf.writestr(f"{name}-F.Mask.gbr", fmask)
        zf.writestr(f"{name}-B.Mask.gbr", bmask)
        zf.writestr(f"{name}-Edge.Cuts.gbr", outline)
        if drill:
            zf.writestr(f"{name}.drl", drill)
    buf.seek(0)
    return buf.read()
