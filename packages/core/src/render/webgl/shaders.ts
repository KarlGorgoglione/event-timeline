// The WebGL backend's single shader program (§4).
//
// One program with a uniform fragment-mode switch covers every primitive:
// solid geometry (lines, rects, arrowheads), SDF circles (nodes), and
// textured quads (text atlas, icons). Batches are style-uniform, so colour is
// a per-draw uniform and the vertex layout stays a lean [x, y, u, v]. A
// uniform branch is uniform control flow — no divergence cost — and a single
// program means zero useProgram switches per frame.

export const MODE_SOLID = 0;
export const MODE_CIRCLE = 1;
export const MODE_TEXTURED = 2;

const VERTEX_SOURCE = `#version 300 es
uniform vec2 u_resolution;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  // Device px → clip space, y flipped so +y points down like the 2D canvas.
  vec2 clip = a_pos / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision mediump float;
uniform int u_mode;
uniform vec4 u_color;   // premultiplied
uniform float u_radius; // circle mode only
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  if (u_mode == ${MODE_SOLID}) {
    fragColor = u_color;
  } else if (u_mode == ${MODE_CIRCLE}) {
    // v_uv is device px from the circle centre; 1px soft edge matches the
    // anti-aliasing Canvas2D gives arc fills (§4 look parity).
    float alpha = clamp(u_radius + 0.5 - length(v_uv), 0.0, 1.0);
    fragColor = u_color * alpha;
  } else {
    // Textures are uploaded premultiplied (atlas bakes its colour in, §4).
    fragColor = texture(u_tex, v_uv);
  }
}
`;

export interface ProgramInfo {
  program: WebGLProgram;
  uniforms: {
    resolution: WebGLUniformLocation | null;
    mode: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
    radius: WebGLUniformLocation | null;
    tex: WebGLUniformLocation | null;
  };
  attribs: {
    pos: number;
    uv: number;
  };
}

export function compileProgram(gl: WebGL2RenderingContext): ProgramInfo {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE));
  gl.attachShader(
    program,
    compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGLRenderer: program link failed: ${log}`);
  }
  return {
    program,
    uniforms: {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      mode: gl.getUniformLocation(program, 'u_mode'),
      color: gl.getUniformLocation(program, 'u_color'),
      radius: gl.getUniformLocation(program, 'u_radius'),
      tex: gl.getUniformLocation(program, 'u_tex'),
    },
    attribs: {
      pos: gl.getAttribLocation(program, 'a_pos'),
      uv: gl.getAttribLocation(program, 'a_uv'),
    },
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error('WebGLRenderer: createShader returned null');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGLRenderer: shader compile failed: ${log}`);
  }
  return shader;
}
