import { readFileSync, writeFileSync } from "node:fs";

const printer = "Bambu Lab X1 Carbon 0.4 nozzle";
const presets = [
  ["machine", printer],
  ["process", "0.20mm Standard @BBL X1C"],
  ["filament", "Generic PLA"],
];
const geometryKeys = `wall_generator wall_loops only_one_wall_top min_bead_width
wall_transition_angle wall_transition_filter_deviation wall_transition_length
wall_distribution_count resolution seam_position wall_sequence top_shell_thickness
bottom_shell_thickness bottom_shell_layers top_shell_layers layer_height
initial_layer_print_height top_surface_pattern bottom_surface_pattern
sparse_infill_pattern sparse_infill_density enable_arc_fitting line_width
initial_layer_line_width inner_wall_line_width outer_wall_line_width
internal_solid_infill_line_width sparse_infill_line_width top_surface_line_width`.split(/\s+/);

function flatten(resources, kind, name) {
  const data = JSON.parse(readFileSync(`${resources}/profiles/BBL/${kind}/${name}.json`, "utf8"));
  return {
    ...(data.inherits ? flatten(resources, kind, data.inherits) : {}),
    ...data,
  };
}

function decode(value) {
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  return value.replaceAll("\\n", "\n");
}

export function writeOrcaProfiles(resources, gcode, output, angle, lineWidth) {
  const config = Object.fromEntries(
    [...gcode.matchAll(/^; ([a-z0-9_]+) = (.*)$/gm)].map((m) => [m[1], m[2]]),
  );
  for (const [kind, base] of presets) {
    const data = flatten(resources, kind, base);
    for (const key of Object.keys(data)) {
      if (config[key] === undefined) continue;
      if (Array.isArray(data[key])) {
        const items = (config[key].match(/"(?:\\.|[^"\\])*"|[^;,]+/g) ?? [""]).map(decode);
        // One active extrusion channel; bed polygons require all their vertices.
        data[key] = ["printable_area", "bed_exclude_area"].includes(key)
          ? items
          : items.slice(0, 1);
      } else data[key] = decode(config[key]);
    }
    data.name = `Logo ${kind}`;
    data.from = "user";
    data.inherits = base;
    if (kind !== "machine") data.compatible_printers = [printer];
    if (kind === "process") {
      for (const key of geometryKeys) {
        if (config[key] === undefined) throw new Error(`Missing original slice setting: ${key}`);
        data[key] = config[key];
      }
      data.infill_direction = String(angle);
      data.solid_infill_direction = String(angle);
      data.solid_infill_rotate_template = String(angle);
      data.wall_generator = "arachne";
      data.min_bead_width = "5%";
      data.min_feature_size = "1%";
      data.gap_fill_target = "everywhere";
      data.filter_out_gap_fill = "0";
      data.top_surface_pattern = "monotonic";
      data.bottom_surface_pattern = "monotonic";
      for (const key of [
        "line_width",
        "initial_layer_line_width",
        "inner_wall_line_width",
        "outer_wall_line_width",
        "internal_solid_infill_line_width",
        "sparse_infill_line_width",
        "top_surface_line_width",
      ])
        data[key] = String(lineWidth);
    }
    writeFileSync(`${output}/${kind}.json`, JSON.stringify(data, null, 2));
  }
}
