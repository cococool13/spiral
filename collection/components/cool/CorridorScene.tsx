"use client";

import { Canvas } from "@react-three/fiber";
import { type RefObject, useEffect, useState } from "react";
import Stage from "./Stage";

/**
 * The canvas, and nothing else.
 *
 * Everything the ride does lives in `Stage` and `env/`. This file only owns the
 * things that have to be decided before a WebGL context exists: pixel ratio,
 * geometry budget, and what to do when the context dies.
 *
 * There is deliberately no post-processing chain.
 * `@react-three/postprocessing` was tried and removed — its composer reliably
 * lost the context part-way down the scroll on Apple silicon, which blanks the
 * page. Bloom and vignette are faked in the environment shaders instead.
 */
export default function CorridorScene({ progress }: { progress: RefObject<number> }) {
  const [quality, setQuality] = useState(1);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    setQuality(window.innerWidth < 768 ? 0.45 : 1);
  }, []);

  // There is no visibility handling here on purpose. requestAnimationFrame is
  // already suspended in a hidden tab, and gating R3F's frameloop on
  // document.hidden instead only risks parking the canvas on a black frame.

  // A weak or busy GPU can drop the context out from under us. Left alone that
  // freezes on the last frame, which reads as a broken page; unmounting hands
  // the page back to the flat void field behind the canvas.
  if (lost) return null;

  return (
    <Canvas
      dpr={[1, quality < 1 ? 1.25 : 1.5]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      // far has to clear the horizon ridge at 700 units, or it is clipped
      // away and the skyline is simply missing. near is pulled back to 0.3 to
      // pay for the depth precision that costs.
      camera={{ fov: 66, near: 0.3, far: 900, position: [0, 0, 0] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setLost(true);
        });
      }}
    >
      <Stage progress={progress} quality={quality} />
    </Canvas>
  );
}
