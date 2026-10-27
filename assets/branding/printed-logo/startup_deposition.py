"""Frame-accurate completed paths plus a volume-cut active toolpath."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast
from render import bpy


def path_object(name: str, path: dict[str, Any], materials: list[Any]) -> Any:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(path["vertices"], [], path["faces"])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.scale.z = 0.6
    for material in materials:
        mesh.materials.append(material)
    for polygon, material in zip(mesh.polygons, path["materials"]):
        polygon.material_index = material
        polygon.use_smooth = True
    return obj


def visibility(obj: Any, frame: int, visible: bool) -> None:
    obj.hide_render = not visible
    obj.hide_viewport = not visible
    obj.keyframe_insert(data_path="hide_render", frame=frame)
    obj.keyframe_insert(data_path="hide_viewport", frame=frame)


def deposition(directory: Path) -> None:
    original = bpy.data.objects["Makeshift — simulated deposition"]
    materials = list(original.data.materials)
    bpy.data.objects.remove(original, do_unlink=True)
    paths = cast(list[dict[str, Any]], json.loads((directory / "paths.json").read_text()))
    partials = cast(list[dict[str, Any]], json.loads((directory / "partials.json").read_text()))
    for i, path in enumerate(paths):
        obj = path_object(f"Completed toolpath {i + 1:03}", path, materials)
        visibility(obj, 0, False)
        visibility(obj, path["completeFrame"] - 1, False)
        visibility(obj, path["completeFrame"], True)
    for path in partials:
        obj = path_object(f"Active deposition frame {path['frame']:03}", path, materials)
        visibility(obj, 0, False)
        visibility(obj, path["frame"] - 1, False)
        visibility(obj, path["frame"], True)
        visibility(obj, path["frame"] + 1, False)
