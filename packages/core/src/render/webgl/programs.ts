// Instanced shader programs for the WebGL2 backend (DESIGN.md §4).
//
// Every primitive is drawn instanced from the frame's typed batches: the CPU
// uploads one record per segment, dot, arrowhead, rect or glyph run, and the
// vertex shader expands it into a quad or triangle with `gl_VertexID`. Colour
// and size are per-batch uniforms (premultiplied colours, blended with
// ONE / ONE_MINUS_SRC_ALPHA). Edges are anti-aliased analytically in the
// fragment shader so thin strokes match Canvas2D.

import {
  ARROW_BASE_BACK,
  ARROW_BASE_HALF_WIDTH,
  ARROW_TIP,
} from '../arrowGeometry';

/** A number as a GLSL float literal. */
const glsl = (n: number): string =>
  Number.isInteger(n) ? n.toFixed(1) : String(n);

const HEADER = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
vec4 clip(vec2 p) {
  vec2 c = p / u_resolution * 2.0 - 1.0;
  return vec4(c.x, -c.y, 0.0, 1.0);
}
// Two triangles covering the unit square, by vertex id.
vec2 corner(int id) {
  int i = id % 6;
  return vec2(i == 1 || i == 2 || i == 4 ? 1.0 : 0.0,
              i == 2 || i == 4 || i == 5 ? 1.0 : 0.0);
}
`;

const FRAGMENT_HEADER = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
`;

/**
 * Segments as capsules: a quad padded by half the width (plus 1px for
 * anti-aliasing) around each segment. An end joined to a neighbouring
 * segment is rounded so polylines (hop arcs, loops) have no notches; a free
 * end is a butt cap, like Canvas2D's default.
 */
const LINE_VERTEX = `${HEADER}
uniform float u_halfWidth;
in vec4 a_segment;
in float a_joins;
out vec2 v_local;
flat out float v_length;
flat out float v_joins;
void main() {
  vec2 p0 = a_segment.xy;
  vec2 d = a_segment.zw - p0;
  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float pad = u_halfWidth + 1.0;
  vec2 c = corner(gl_VertexID);
  float along = mix(-pad, len + pad, c.x);
  float across = mix(-pad, pad, c.y);
  v_local = vec2(along, across);
  v_length = len;
  v_joins = a_joins;
  gl_Position = clip(p0 + dir * along + nrm * across);
}
`;

const LINE_FRAGMENT = `${FRAGMENT_HEADER}
uniform float u_halfWidth;
in vec2 v_local;
flat in float v_length;
flat in float v_joins;
void main() {
  float x = v_local.x;
  float y = abs(v_local.y);
  float coverage;
  bool startRound = mod(v_joins, 2.0) >= 1.0;
  bool endRound = v_joins >= 2.0;
  if (x < 0.0 && startRound) {
    coverage = clamp(u_halfWidth - length(vec2(x, y)) + 0.5, 0.0, 1.0);
  } else if (x > v_length && endRound) {
    coverage = clamp(u_halfWidth - length(vec2(x - v_length, y)) + 0.5, 0.0, 1.0);
  } else {
    float across = clamp(u_halfWidth - y + 0.5, 0.0, 1.0);
    float along = clamp(x + 0.5, 0.0, 1.0) * clamp(v_length - x + 0.5, 0.0, 1.0);
    coverage = across * along;
  }
  // A zero-length butt segment draws nothing, as in Canvas2D.
  if (v_length == 0.0 && !startRound && !endRound) discard;
  if (coverage <= 0.0) discard;
  fragColor = u_color * coverage;
}
`;

/** Filled circles: a padded quad per centre, clipped by distance. */
const NODE_VERTEX = `${HEADER}
uniform float u_radius;
in vec2 a_center;
out vec2 v_offset;
void main() {
  float pad = u_radius + 1.0;
  vec2 offset = mix(vec2(-pad), vec2(pad), corner(gl_VertexID));
  v_offset = offset;
  gl_Position = clip(a_center + offset);
}
`;

const NODE_FRAGMENT = `${FRAGMENT_HEADER}
uniform float u_radius;
in vec2 v_offset;
void main() {
  float coverage = clamp(u_radius + 0.5 - length(v_offset), 0.0, 1.0);
  if (coverage <= 0.0) discard;
  fragColor = u_color * coverage;
}
`;

/**
 * Arrowheads: one triangle per (x, y, angle) record, with the same
 * geometry as the Canvas2D backend (tip at +size, base corners at
 * (−0.4, ±0.6) × size in the arrow's frame; see arrowGeometry.ts).
 */
const HEAD_VERTEX = `${HEADER}
uniform float u_size;
in vec3 a_head;
void main() {
  int i = gl_VertexID % 3;
  vec2 local = i == 0 ? vec2(${glsl(ARROW_TIP)}, 0.0)
             : i == 1 ? vec2(${glsl(ARROW_BASE_BACK)}, ${glsl(ARROW_BASE_HALF_WIDTH)})
                      : vec2(${glsl(ARROW_BASE_BACK)}, -${glsl(ARROW_BASE_HALF_WIDTH)});
  float c = cos(a_head.z);
  float s = sin(a_head.z);
  vec2 p = local * u_size;
  gl_Position = clip(a_head.xy + vec2(p.x * c - p.y * s, p.x * s + p.y * c));
}
`;

const SOLID_FRAGMENT = `${FRAGMENT_HEADER}
void main() {
  fragColor = u_color;
}
`;

/** Axis-aligned filled rectangles (x, y, w, h). */
const RECT_VERTEX = `${HEADER}
in vec4 a_rect;
void main() {
  gl_Position = clip(a_rect.xy + a_rect.zw * corner(gl_VertexID));
}
`;

/**
 * Textured rectangles (x, y, w, h, u0, v0, u1, v1) from an atlas page:
 * glyph runs and icons. Textures hold premultiplied colour, drawn as is.
 */
const TEXTURE_VERTEX = `${HEADER}
in vec4 a_rect;
in vec4 a_uv;
out vec2 v_uv;
void main() {
  vec2 c = corner(gl_VertexID);
  v_uv = mix(a_uv.xy, a_uv.zw, c);
  gl_Position = clip(a_rect.xy + a_rect.zw * c);
}
`;

const TEXTURE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

export interface Attribute {
  name: string;
  /** Floats per instance for this attribute. */
  size: number;
}

export interface ProgramSpec {
  vertex: string;
  fragment: string;
  /** Per-instance attributes, in record order. */
  attributes: readonly Attribute[];
  /** Vertices drawn per instance (6 for a quad, 3 for a triangle). */
  vertices: number;
}

export const PROGRAMS = {
  line: {
    vertex: LINE_VERTEX,
    fragment: LINE_FRAGMENT,
    attributes: [
      { name: 'a_segment', size: 4 },
      { name: 'a_joins', size: 1 },
    ],
    vertices: 6,
  },
  node: {
    vertex: NODE_VERTEX,
    fragment: NODE_FRAGMENT,
    attributes: [{ name: 'a_center', size: 2 }],
    vertices: 6,
  },
  head: {
    vertex: HEAD_VERTEX,
    fragment: SOLID_FRAGMENT,
    attributes: [{ name: 'a_head', size: 3 }],
    vertices: 3,
  },
  rect: {
    vertex: RECT_VERTEX,
    fragment: SOLID_FRAGMENT,
    attributes: [{ name: 'a_rect', size: 4 }],
    vertices: 6,
  },
  texture: {
    vertex: TEXTURE_VERTEX,
    fragment: TEXTURE_FRAGMENT,
    attributes: [
      { name: 'a_rect', size: 4 },
      { name: 'a_uv', size: 4 },
    ],
    vertices: 6,
  },
} as const satisfies Record<string, ProgramSpec>;

export type ProgramName = keyof typeof PROGRAMS;

/** Floats in one instance record of a program. */
export function recordFloats(name: ProgramName): number {
  return PROGRAMS[name].attributes.reduce((n, a) => n + a.size, 0);
}

export interface CompiledProgram {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  attributes: { location: number; size: number }[];
  uniforms: Map<string, WebGLUniformLocation | null>;
  stride: number;
  vertices: number;
}

export function compileProgram(
  gl: WebGL2RenderingContext,
  spec: ProgramSpec,
  buffer: WebGLBuffer,
): CompiledProgram {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, spec.vertex));
  gl.attachShader(
    program,
    compileShader(gl, gl.FRAGMENT_SHADER, spec.fragment),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGLRenderer: program link failed: ${log}`);
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const attributes = spec.attributes.map((a) => {
    const location = gl.getAttribLocation(program, a.name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribDivisor(location, 1);
    return { location, size: a.size };
  });
  gl.bindVertexArray(null);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  for (const name of [
    'u_resolution',
    'u_color',
    'u_halfWidth',
    'u_radius',
    'u_size',
    'u_texture',
  ]) {
    uniforms.set(name, gl.getUniformLocation(program, name));
  }
  return {
    program,
    vao,
    attributes,
    uniforms,
    stride: attributes.reduce((n, a) => n + a.size, 0) * 4,
    vertices: spec.vertices,
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('WebGLRenderer: createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGLRenderer: shader compile failed: ${log}`);
  }
  return shader;
}
