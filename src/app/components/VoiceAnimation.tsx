import Player from "lottie-react";
import React from "react";

interface VoiceAnimationProps {
  isTalking: boolean;
}

export const VoiceAnimation: React.FC<VoiceAnimationProps> = ({ isTalking }) => {
  if (!isTalking) return null;

  return (
    <div className="w-20 h-20 flex justify-center items-center">
      <Player
        autoplay
        loop
        src="/voice-talking.json"
        style={{ height: 100, width: 100 }} animationData={undefined}      />
    </div>
  );
};
