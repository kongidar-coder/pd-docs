"""
Claude Vision API integration for analyzing schematic images.
"""
import anthropic
import base64
import json
import re
from pathlib import Path
from models import SchematicComponent, Net, NetPin, Netlist, ComponentType


SYSTEM_PROMPT = """You are an expert electronics engineer who analyzes circuit schematics.
When given a schematic image, extract all components and their connections precisely."""

USER_PROMPT = """Analyze this electronic schematic image and return a JSON object with this exact structure:

{
  "components": [
    {
      "ref": "R1",
      "type": "resistor",
      "value": "10k",
      "package": "0603",
      "pin_count": 2
    }
  ],
  "nets": [
    {
      "name": "NET1",
      "pins": [
        {"component_ref": "R1", "pin_name": "2"},
        {"component_ref": "C1", "pin_name": "1"}
      ]
    }
  ]
}

Component types: resistor, capacitor, led, ic, connector, diode, transistor, inductor, crystal, voltage_regulator

Package guidelines:
- Resistors/capacitors/LEDs/diodes/inductors → "0603" (SMD) unless clearly through-hole → "THT-2.54"
- Transistors → "SOT-23"
- ICs: DIP-8 for 8-pin, DIP-14 for 14-pin, DIP-16 for 16-pin, DIP-28 for 28-pin, SOIC-8 for SMD
- Connectors: CONN-2 through CONN-10

Net naming: if a wire is labeled (VCC, GND, 5V, etc.) use that label as the net name.
Connect every visible wire junction and label to the correct net.

Return ONLY valid JSON, no markdown, no explanation."""


def _classify_type(t: str) -> ComponentType:
    mapping = {
        "resistor": ComponentType.RESISTOR,
        "capacitor": ComponentType.CAPACITOR,
        "led": ComponentType.LED,
        "ic": ComponentType.IC,
        "connector": ComponentType.CONNECTOR,
        "diode": ComponentType.DIODE,
        "transistor": ComponentType.TRANSISTOR,
        "inductor": ComponentType.INDUCTOR,
        "crystal": ComponentType.CRYSTAL,
        "voltage_regulator": ComponentType.VOLTAGE_REGULATOR,
    }
    return mapping.get(t.lower(), ComponentType.IC)


def analyze_schematic_image(image_data: bytes, mime_type: str = "image/png") -> Netlist:
    client = anthropic.Anthropic()

    b64 = base64.standard_b64encode(image_data).decode("utf-8")

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": USER_PROMPT},
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    # Strip markdown code fences if present
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    data = json.loads(raw)

    components = []
    for c in data.get("components", []):
        components.append(
            SchematicComponent(
                ref=c.get("ref", "?"),
                type=_classify_type(c.get("type", "ic")),
                value=c.get("value", ""),
                package=c.get("package", "0603"),
                pin_count=int(c.get("pin_count", 2)),
            )
        )

    nets = []
    for idx, n in enumerate(data.get("nets", [])):
        pins = [
            NetPin(component_ref=p["component_ref"], pin_name=str(p["pin_name"]))
            for p in n.get("pins", [])
        ]
        nets.append(Net(name=n.get("name", f"Net_{idx + 1}"), pins=pins))

    return Netlist(components=components, nets=nets)
