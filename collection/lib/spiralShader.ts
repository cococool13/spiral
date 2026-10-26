/** A live Spiral wallpaper in WebGL: log-spiral arms, domain warp, grain. */
export type RGB = [number, number, number];

export interface ShaderParams {
  c1: RGB;
  c2: RGB;
  c3: RGB;
  speed: number;
}

export interface SpiralShader {
  params: ShaderParams;
  draw: () => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FS = `precision mediump float;uniform vec2 r;uniform float t;uniform vec3 c1,c2,c3;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec2 p=(gl_FragCoord.xy-.5*r)/r.y;p.x-=.12;
p+=.07*vec2(sin(p.y*4.2+t*.31),cos(p.x*3.7-t*.27));
float d=length(p);float a=atan(p.y,p.x);
float s=sin(a*3.+log(d+.002)*6.5-t*.33);
float s2=sin(a*5.-log(d+.002)*9.+t*.21);
float arm=smoothstep(-.35,.95,s);float glow=exp(-d*1.9);
vec3 col=mix(c1*.55,c2,clamp(arm*glow*1.15+.18*(1.-d),0.,1.));
col+=c3*pow(max(0.,s),7.)*glow*.55+c3*pow(max(0.,s2),10.)*glow*.18;
col*=1.-.5*smoothstep(.2,1.3,d);
col+=(h(gl_FragCoord.xy+fract(t))-.5)*.05;gl_FragColor=vec4(col,1.);}`;

export function createSpiralShader(
  canvas: HTMLCanvasElement,
  params: ShaderParams,
): SpiralShader | null {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  // Not a React hook; bound so the linter's hook-name rule does not misfire.
  const activate = gl.useProgram.bind(gl);
  activate(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { r: u("r"), t: u("t"), c1: u("c1"), c2: u("c2"), c3: u("c3") };

  let time = 7;
  let last = 0;
  let raf = 0;
  let running = false;

  // Half resolution: it is soft light, and the grain hides the upscale.
  function draw() {
    const w = Math.max(2, Math.round(canvas.clientWidth * 0.55));
    const h = Math.max(2, Math.round(canvas.clientHeight * 0.55));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl?.viewport(0, 0, w, h);
    gl?.uniform2f(U.r, w, h);
    gl?.uniform1f(U.t, time);
    gl?.uniform3fv(U.c1, params.c1);
    gl?.uniform3fv(U.c2, params.c2);
    gl?.uniform3fv(U.c3, params.c3);
    gl?.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 30 fps is plenty for a wallpaper and halves the GPU cost.
  function loop(ts: number) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (ts - last < 33) return;
    time += ((ts - last) / 1000) * params.speed;
    last = ts;
    draw();
  }

  return {
    params,
    draw,
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
