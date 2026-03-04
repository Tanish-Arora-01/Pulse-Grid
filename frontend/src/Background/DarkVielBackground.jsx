import React from "react";
import DarkVeil from "./DarkVeil";

const DarkVeilBackground = ({ children }) => {
  return (
    <>
      {/* FIXED FULLSCREEN BACKGROUND */}
      <div className="fixed inset-0 w-screen h-screen -z-10 pointer-events-none">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={0.5}
          scanlineFrequency={0}
          warpAmount={0}
        />
      </div>

      {/* SCROLLABLE CONTENT LAYER */}
      <div className="relative z-10 min-h-screen">{children}</div>
    </>
  );
};

export default DarkVeilBackground;
