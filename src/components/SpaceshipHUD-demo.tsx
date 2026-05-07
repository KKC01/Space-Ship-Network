"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HudFrame, TargetingUI } from "@/components/ui/animated-hud-targeting-ui";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [showTargeting, setShowTargeting] = useState(true);
  const [targetingKey, setTargetingKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const svgAnimation = {
    hidden: { opacity: 0, scale: 0.95 },
    show: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      },
    },
    hide: {
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <div className="min-h-screen overflow-hidden">
      <HudFrame>
        <div className="flex flex-col w-full h-screen relative overflow-hidden">
            <TargetingUI className="w-128 h-full" />
        </div>
      </HudFrame>
    </div>
  );
}
