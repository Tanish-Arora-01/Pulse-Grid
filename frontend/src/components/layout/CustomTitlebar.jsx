import React, { useState, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import { Sparkles, Zap } from "lucide-react";

const CustomTitlebar = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    const checkMaximized = async () => {
      if (window.fobitAPI) {
        const maximized = await window.fobitAPI.isWindowMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();
  }, []);

  const handleMinimize = async () => {
    if (window.fobitAPI) {
      await window.fobitAPI.minimizeWindow();
    }
  };

  const handleMaximize = async () => {
    if (window.fobitAPI) {
      await window.fobitAPI.maximizeWindow();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = async () => {
    if (window.fobitAPI) {
      await window.fobitAPI.closeWindow();
    }
  };

  return (
    <div
      className="
        fixed top-0 left-0 right-0 h-12 z-50
        bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5
        flex items-center justify-between px-4 select-none
        group/titlebar
      "
      style={{ WebkitAppRegion: "drag" }} // Makes the whole bar draggable
    >
      {/* LEFT: BRANDING */}
      <div className="flex items-center gap-2 select-none">
        {/* App Logo - Replace with actual logo.png or logo.svg */}
        <div className="bg-indigo-500/20 border border-indigo-500/30 p-1.5 rounded-full text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
          <Zap size={16} strokeWidth={2.5} />
        </div>
        <span className="font-bold text-sm tracking-tight hidden lg:block bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          PulseGrid
        </span>
      </div>

      {/* RIGHT: WINDOW CONTROLS */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          className="
            flex items-center justify-center w-9 h-9 rounded-md
            text-white/50 hover:text-white hover:bg-white/10
            transition-all duration-200 ease-out
            hover:shadow-[0_0_10px_rgba(99,102,241,0.1)]
          "
          title="Minimize"
        >
          <Minus size={18} strokeWidth={1.5} />
        </button>

        {/* Maximize/Restore Button */}
        <button
          onClick={handleMaximize}
          className="
            flex items-center justify-center w-9 h-9 rounded-md
            text-white/50 hover:text-white hover:bg-white/10
            transition-all duration-200 ease-out
            hover:shadow-[0_0_10px_rgba(99,102,241,0.1)]
          "
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <Square
            size={18}
            strokeWidth={1.5}
            style={{
              opacity: isMaximized ? 0.5 : 1,
            }}
          />
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="
            flex items-center justify-center w-9 h-9 rounded-md
            text-white/50 hover:text-rose-400 hover:bg-rose-500/10
            transition-all duration-200 ease-out
            hover:shadow-[0_0_15px_rgba(244,63,94,0.2)]
            group/close
          "
          title="Close"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default CustomTitlebar;
