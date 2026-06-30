"""
FastAPI backend for the PCB design web application.
"""
import os
import io
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import Netlist, PCBLayout, AnalyzeResponse
from schematic_analyzer import analyze_schematic_image
from kicad_parser import parse_kicad_sch
from pcb_generator import generate_layout
from lee_router import route_all
from gerber_exporter import export_gerbers

app = FastAPI(title="PCB Design API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze-schematic", response_model=AnalyzeResponse)
async def analyze_schematic(file: UploadFile = File(...)):
    """
    Upload a schematic image (PNG/JPEG) and receive an extracted netlist.
    Requires ANTHROPIC_API_KEY environment variable.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not set. Set it to enable AI schematic analysis.",
        )

    data = await file.read()
    mime = file.content_type or "image/png"
    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Unsupported image format.")

    try:
        netlist = analyze_schematic_image(data, mime)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    return AnalyzeResponse(netlist=netlist, message=f"Found {len(netlist.components)} components.")


@app.post("/api/parse-kicad", response_model=AnalyzeResponse)
async def parse_kicad(file: UploadFile = File(...)):
    """Upload a KiCad schematic file (.kicad_sch) and receive a netlist."""
    content = (await file.read()).decode("utf-8", errors="replace")
    try:
        netlist = parse_kicad_sch(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse failed: {str(e)}")
    return AnalyzeResponse(netlist=netlist, message=f"Parsed {len(netlist.components)} components.")


@app.post("/api/generate-pcb", response_model=PCBLayout)
async def generate_pcb(netlist: Netlist):
    """
    Take a netlist and return a fully placed and routed PCB layout (JSON).
    """
    try:
        layout = generate_layout(netlist)
        layout = route_all(layout)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PCB generation failed: {str(e)}")
    return layout


@app.post("/api/export-gerbers")
async def export_gerbers_endpoint(layout: PCBLayout):
    """
    Take a PCB layout JSON and return a Gerber ZIP archive for ordering.
    """
    try:
        zip_bytes = export_gerbers(layout)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gerber export failed: {str(e)}")

    name = layout.design_name or "pcb_design"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}-gerbers.zip"'},
    )


@app.post("/api/full-pipeline")
async def full_pipeline(netlist: Netlist):
    """
    One-shot: netlist → PCB layout JSON + base64 Gerber ZIP.
    """
    layout = generate_layout(netlist)
    layout = route_all(layout)
    import base64
    zip_bytes = export_gerbers(layout)
    return {
        "layout": layout.model_dump(),
        "gerbers_b64": base64.b64encode(zip_bytes).decode(),
    }
