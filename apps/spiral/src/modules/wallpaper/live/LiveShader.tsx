import { useEffect, useRef } from "react";

/**
 * Spiral's generative wallpaper: three log-spiral arm families warped by
 * noise, lit by one slow sweep, with film grain. WebGL2, about 30 fps, drawn
 * at a reduced pixel ratio. Parked behind `capabilities().liveWallpaper` until
 * the native side can draw it behind the desktop.
 */

export interface LivePalette {
  id: string;
  name: string;
  /** Light colour, linear 0..1. */
  a: [number, number, number];
  /** Shadow colour, linear 0..1. */
  b: [number, number, number];
}

export const LIVE_PALETTES: LivePalette[] = [
  { id: "oxblood", name: "Oxblood", a: [0.87, 0.26, 0.25], b: [0.22, 0.02, 0.04] },
  { id: "ember", name: "Ember", a: [0.93, 0.5, 0.22], b: [0.27, 0.08, 0.02] },
  { id: "aurora", name: "Aurora", a: [0.4, 0.85, 0.66], b: [0.03, 0.2, 0.2] },
  { id: "dusk", name: "Dusk", a: [0.48, 0.62, 0.9], b: [0.05, 0.09, 0.22] },
  { id: "bone", name: "Bone", a: [0.93, 0.87, 0.8], b: [0.2, 0.15, 0.12] },
];

export function swatch(palette: LivePalette): string {
  const [r, g, b] = palette.a.map((value) => Math.round(value * 255));
  return `rgb(${r} ${g} ${b})`;
}

const VS = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FS = `#version 300 es
precision highp float;uniform vec2 R;uniform float T;uniform vec3 A;uniform vec3 B;out vec4 o;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
void main(){vec2 q=(gl_FragCoord.xy-.5*R)/R.y;vec2 p=q-vec2(.18*R.x/R.y,.02);float r=length(p),a=atan(p.y,p.x),lr=log(r+.004);
 float warp=fbm(p*1.8+vec2(0.,T*.01));float lines=0.,ribbon=0.;
 for(int i=0;i<3;i++){float fi=float(i);float arms=5.+fi*4.+fi*fi;float b=.36+.11*fi;
  float ph=arms*(a-b*lr)-T*(.05+.02*fi)+(warp-.5)*(1.1+.7*fi);float s=sin(ph*.5);float w=.5*arms*sqrt(1.+b*b)/(max(r,.004)*R.y);
  float core=1.-smoothstep(0.,1.1,abs(s)/max(w,1e-4)*.7);float soft=pow(1.-abs(s),16.);
  float fall=smoothstep(.006,.14,r)*(1.-smoothstep(.9,1.9,r));float wt=(fi==0.)?1.:(fi==1.?.6:.34);
  lines+=(core*.95+soft*.55)*wt*fall;ribbon+=(.5+.5*sin(ph))*fall*wt;}
 float L=pow(.5+.5*cos(a-T*.04-.8),2.2);float cloud=fbm(p*1.5-vec2(T*.01,0.));float sweep=.18+1.25*L*(.45+.9*cloud);
 vec3 col=B*(ribbon*.22)+mix(B*2.2,A,clamp(sweep,0.,1.))*lines*(.7+1.0*sweep);
 col*=1.-.55*smoothstep(.2,1.5,length(q));col+=(h(gl_FragCoord.xy+fract(T*.37)*91.)-.5)*.035;col=max(col,vec3(0.))+vec3(.027,.016,.014);
 o=vec4(pow(col,vec3(.93)),1.);}`;

interface Renderer {
  draw: (time: number, palette: LivePalette) => void;
}

function renderer(canvas: HTMLCanvasElement, keep = false): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: keep,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const made = gl.createShader(type);
    if (!made) return null;
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return made;
  };
  const program = gl.createProgram();
  const vs = shader(gl.VERTEX_SHADER, VS);
  const fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!program || !vs || !fs) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const [uR, uT, uA, uB] = [u("R"), u("T"), u("A"), u("B")];
  return {
    draw(time, palette) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, time);
      gl.uniform3fv(uA, palette.a);
      gl.uniform3fv(uB, palette.b);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/** A still frame of a palette, for tiles. Empty string when WebGL2 is missing. */
export function livePoster(palette: LivePalette, time = 40): string {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 300;
  const r = renderer(canvas, true);
  if (!r) return "";
  r.draw(time, palette);
  return canvas.toDataURL("image/jpeg", 0.82);
}

interface LiveShaderProps {
  palette: LivePalette;
  speed: number;
  className?: string;
}

/** The running wallpaper. A still frame under Reduce Motion. */
export function LiveShader({ palette, speed, className }: LiveShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ palette, speed });
  settings.current = { palette, speed };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 0.6;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
    const r = renderer(canvas);
    if (!r) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let time = 30;
    let last = 0;
    let frame = 0;
    const tick = (now: number) => {
      if (now - last >= 33) {
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        time += dt * settings.current.speed;
        r.draw(time, settings.current.palette);
      }
      frame = requestAnimationFrame(tick);
    };
    r.draw(time, settings.current.palette);
    if (!still) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Reduce Motion keeps one frame; redraw it when the palette changes.
    const canvas = canvasRef.current;
    if (!canvas || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    renderer(canvas)?.draw(30, palette);
  }, [palette]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
