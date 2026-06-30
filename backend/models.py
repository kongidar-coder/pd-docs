from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class ComponentType(str, Enum):
    RESISTOR = "resistor"
    CAPACITOR = "capacitor"
    LED = "led"
    IC = "ic"
    CONNECTOR = "connector"
    DIODE = "diode"
    TRANSISTOR = "transistor"
    INDUCTOR = "inductor"
    CRYSTAL = "crystal"
    VOLTAGE_REGULATOR = "voltage_regulator"
    GROUND = "ground"
    POWER = "power"


class NetPin(BaseModel):
    component_ref: str
    pin_name: str


class Net(BaseModel):
    name: str
    pins: List[NetPin]


class SchematicComponent(BaseModel):
    ref: str
    type: ComponentType
    value: str = ""
    package: str = ""
    pin_count: int = 2


class Netlist(BaseModel):
    components: List[SchematicComponent]
    nets: List[Net]
    design_name: str = "design"


class Point(BaseModel):
    x: float
    y: float


class PCBPad(BaseModel):
    name: str
    x: float          # relative to component center, mm
    y: float
    width: float      # mm
    height: float     # mm
    drill: Optional[float] = None   # through-hole drill diameter, mm
    net: str = ""
    shape: str = "rect"   # "rect" | "circle"


class PCBComponent(BaseModel):
    ref: str
    type: str
    package: str
    x: float          # board position, mm
    y: float
    rotation: float = 0.0   # degrees
    layer: str = "front"
    pads: List[PCBPad]
    value: str = ""
    width: float = 0.0    # bounding box, mm
    height: float = 0.0


class PCBTrace(BaseModel):
    net: str
    layer: str = "front"
    points: List[Point]
    width: float = 0.25   # mm


class PCBVia(BaseModel):
    x: float
    y: float
    outer_diameter: float = 0.8
    drill_diameter: float = 0.4
    net: str = ""


class PCBLayout(BaseModel):
    width: float      # mm
    height: float
    components: List[PCBComponent]
    traces: List[PCBTrace]
    vias: List[PCBVia] = []
    design_name: str = "pcb_design"


class AnalyzeResponse(BaseModel):
    netlist: Netlist
    message: str = ""
