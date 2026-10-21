// A recording stand-in for WebGL2RenderingContext (DESIGN.md §14): records
// every call, returns plausible handles, and treats every compile and link as
// successful. Constants resolve to their own names.

export interface GlCall {
  name: string;
  args: unknown[];
}

export function fakeGl(maxTextureSize = 4096) {
  const calls: GlCall[] = [];
  let next = 1;
  const handle = (kind: string) => ({ kind, id: next++ });
  const results: Record<string, (...args: unknown[]) => unknown> = {
    createBuffer: () => handle('buffer'),
    createProgram: () => handle('program'),
    createShader: () => handle('shader'),
    createVertexArray: () => handle('vao'),
    createTexture: () => handle('texture'),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => next++,
    getUniformLocation: (_program, name) => ({ uniform: name }),
    getParameter: () => maxTextureSize,
    getExtension: () => ({
      loseContext: () => calls.push({ name: 'loseContext', args: [] }),
    }),
  };
  const gl = new Proxy(
    {},
    {
      get: (_target, key) => {
        const name = String(key);
        if (/^[A-Z0-9_]+$/.test(name)) return name;
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return results[name]?.(...args);
        };
      },
    },
  ) as unknown as WebGL2RenderingContext;
  const named = (name: string) => calls.filter((c) => c.name === name);
  const reset = () => {
    calls.length = 0;
  };
  return { gl, calls, named, reset };
}
