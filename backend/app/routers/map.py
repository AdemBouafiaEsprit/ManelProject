import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.container import Container
from app.models.risk_score import RiskScore
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.block import Block
from app.schemas.schemas import BlockOut, BlockCreate, BlockEdit
from typing import List

router = APIRouter(prefix="/map", tags=["Map"])

# Port bounds — Radès terminal (realistic coordinates)
TERMINAL = {
    "center": {"lat": 36.8025, "lng": 10.2425},
    "bounds": {
        "lat_min": 36.795, "lat_max": 36.810,
        "lng_min": 10.230, "lng_max": 10.255
    }
}

DEFAULT_BLOCKS = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "block_id": "A", "name": "Block A — Reefer Zone 1",
        "rows": 10, "bays": 20, "tiers": 4,
        "color": "#E6F1FB", "stroke": "#0369A1",
        "lat_min": 36.7965, "lat_max": 36.8005,
        "lng_min": 10.232, "lng_max": 10.242
    },
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "block_id": "B", "name": "Block B — Reefer Zone 2",
        "rows": 10, "bays": 20, "tiers": 4,
        "color": "#E1F5EE", "stroke": "#15803D",
        "lat_min": 36.8010, "lat_max": 36.8050,
        "lng_min": 10.232, "lng_max": 10.242
    },
    {
        "id": "00000000-0000-0000-0000-000000000003",
        "block_id": "C", "name": "Block C — Cold Chain Priority",
        "rows": 6, "bays": 15, "tiers": 3,
        "color": "#EEEDFE", "stroke": "#7C3AED",
        "lat_min": 36.7965, "lat_max": 36.8050,
        "lng_min": 10.244, "lng_max": 10.252
    },
]

RISK_COLORS = {
    "LOW": "#22C55E",
    "MEDIUM": "#EAB308",
    "HIGH": "#F97316",
    "CRITICAL": "#EF4444",
    "offline": "#6B7280",
}


import logging
import traceback

@router.get("/layout")
async def get_layout(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Return GeoJSON-compatible port layout with blocks from DB."""
    try:
        result = await db.execute(select(Block))
        db_blocks = result.scalars().all()
        
        # Use defaults if DB is empty (seeding fallback)
        blocks_to_render = db_blocks if db_blocks else DEFAULT_BLOCKS
        
        features = []
        for b in blocks_to_render:
            # Properly handle either ORM objects or raw dicts
            try:
                # Use model_validate for ORM objects, or create from dict
                block_data = BlockOut.model_validate(b).model_dump()
            except Exception as pe:
                logging.error(f"Pydantic Validation Error for block: {pe}")
                block_data = b # Fallback

            # Use the actual drawn polygon if stored, otherwise fall back to bounding box rectangle
            coords = block_data.get("coordinates")
            if coords and len(coords) >= 3:
                geometry = {"type": "Polygon", "coordinates": [coords]}
            else:
                lat_min = block_data.get("lat_min")
                lat_max = block_data.get("lat_max")
                lng_min = block_data.get("lng_min")
                lng_max = block_data.get("lng_max")
                geometry = {
                    "type": "Polygon",
                    "coordinates": [[
                        [lng_min, lat_min],
                        [lng_max, lat_min],
                        [lng_max, lat_max],
                        [lng_min, lat_max],
                        [lng_min, lat_min],
                    ]]
                }

            features.append({
                "type": "Feature",
                "properties": {
                    "block_id": block_data.get("block_id"),
                    "name": block_data.get("name"),
                    "rows": block_data.get("rows", 10),
                    "bays": block_data.get("bays", 20),
                    "color": block_data.get("color", "#E6F1FB"),
                    "stroke": block_data.get("stroke", "#0369A1"),
                },
                "geometry": geometry,
            })
        return {
            "type": "FeatureCollection",
            "features": features,
            "terminal": TERMINAL,
            "ecp_points": 48,
        }
    except Exception as e:
        logging.error(f"CRITICAL ERROR in get_layout: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


def _rotated_polygon(lat_min: float, lat_max: float, lng_min: float, lng_max: float, rotation_deg: float) -> list:
    """Return a closed GeoJSON ring [[lng, lat], ...] for a rectangle rotated around its center."""
    center_lat = (lat_min + lat_max) / 2
    center_lng = (lng_min + lng_max) / 2
    corners = [
        [lng_min, lat_min], [lng_max, lat_min],
        [lng_max, lat_max], [lng_min, lat_max],
        [lng_min, lat_min],
    ]
    if rotation_deg == 0:
        return corners
    angle = math.radians(rotation_deg)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    cos_lat = math.cos(math.radians(center_lat))
    rotated = []
    for lng, lat in corners:
        dx = (lng - center_lng) * cos_lat
        dy = lat - center_lat
        rotated.append([
            center_lng + (dx * cos_a - dy * sin_a) / cos_lat,
            center_lat + dx * sin_a + dy * cos_a,
        ])
    return rotated


@router.get("/blocks", response_model=List[BlockOut])
async def list_blocks(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Return all blocks as structured objects (for management UI)."""
    result = await db.execute(select(Block))
    return [BlockOut.model_validate(b) for b in result.scalars().all()]


@router.put("/{block_id}", response_model=BlockOut)
async def update_block(
    block_id: str,
    payload: BlockEdit,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Block).where(Block.block_id == block_id))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    for field in ("name", "rows", "bays", "tiers", "color", "stroke"):
        val = getattr(payload, field)
        if val is not None:
            setattr(block, field, val)

    geo_fields = (payload.lat_min, payload.lat_max, payload.lng_min, payload.lng_max, payload.rotation)
    if any(v is not None for v in geo_fields):
        lat_min = payload.lat_min if payload.lat_min is not None else block.lat_min
        lat_max = payload.lat_max if payload.lat_max is not None else block.lat_max
        lng_min = payload.lng_min if payload.lng_min is not None else block.lng_min
        lng_max = payload.lng_max if payload.lng_max is not None else block.lng_max
        rotation = payload.rotation if payload.rotation is not None else (block.rotation or 0.0)
        block.lat_min = lat_min
        block.lat_max = lat_max
        block.lng_min = lng_min
        block.lng_max = lng_max
        block.rotation = rotation
        block.coordinates = _rotated_polygon(lat_min, lat_max, lng_min, lng_max, rotation)

    await db.commit()
    await db.refresh(block)
    return BlockOut.model_validate(block)


@router.delete("/{block_id}", status_code=204)
async def delete_block(
    block_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Block).where(Block.block_id == block_id))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    occupied = await db.execute(select(Container).where(Container.block == block_id).limit(1))
    if occupied.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Block {block_id} still has containers assigned. Reassign or remove them first.",
        )

    await db.delete(block)
    await db.commit()


@router.post("", response_model=BlockOut, status_code=201)
async def create_block(
    payload: BlockCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Add a new storage block to the map."""
    # Assign defaults for colors if not sent
    if not payload.color:
        payload.color = "#EEEDFE"
    if not payload.stroke:
        payload.stroke = "#7C3AED"
        
    new_block = Block(**payload.model_dump())
    db.add(new_block)
    await db.commit()
    await db.refresh(new_block)
    return BlockOut.model_validate(new_block)


@router.get("/containers")
async def get_map_containers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all containers with coordinates + risk color for map rendering."""
    result = await db.execute(select(Container).where(Container.slot_lat.isnot(None)))
    containers = result.scalars().all()

    features = []
    for c in containers:
        # Latest risk
        res = await db.execute(
            select(RiskScore)
            .where(RiskScore.container_id == c.id)
            .order_by(desc(RiskScore.scored_at))
            .limit(1)
        )
        risk = res.scalar_one_or_none()
        risk_level = risk.risk_level if risk else "LOW"
        risk_score = risk.risk_score if risk else 0.0

        if c.status == "offline":
            risk_level = "offline"

        features.append({
            "type": "Feature",
            "properties": {
                "container_id": str(c.id),
                "container_number": c.container_number,
                "commodity": c.commodity,
                "status": c.status,
                "block": c.block,
                "row_num": c.row_num,
                "bay": c.bay,
                "tier": c.tier,
                "ecp_id": c.ecp_id,
                "target_temp": c.target_temp,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "color": RISK_COLORS.get(risk_level, "#6B7280"),
                "failure_hours": risk.predicted_failure_in_hours if risk else None,
            },
            "geometry": {
                "type": "Point",
                "coordinates": [c.slot_lng, c.slot_lat],
            }
        })
    return {"type": "FeatureCollection", "features": features}
