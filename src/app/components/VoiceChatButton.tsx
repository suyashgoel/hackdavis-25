import React from "react";

interface VoiceChatButtonProps {
  status: string;
  recordingDuration: number;
  volumeLevel: number;
  speechThreshold: number;
  backgroundNoise: number;
  isRecording: boolean;
  isProcessing: boolean;
  startConversation: () => void;
  endConversation: () => void;
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>;
  formatTime: (seconds: number) => string;
}

export const VoiceChatButton: React.FC<VoiceChatButtonProps> = ({
  status,
  recordingDuration,
  volumeLevel,
  speechThreshold,
  backgroundNoise,
  isRecording,
  isProcessing,
  startConversation,
  endConversation,
  mediaRecorderRef,
  formatTime,
}) => {
  return (
    <div>
      {isRecording || isProcessing ? (
        <button
          onClick={endConversation}
          className="bg-[#DAC5F6] text-[#3A3A3A] font-inter text-lg py-2 px-6 w-[300px] rounded-full border-1 border-[#CAA9F4] focus:outline-none transition"
          disabled={isProcessing}
        >
          End Conversation
        </button>
      ) : (
        <button
          onClick={startConversation}
          className="bg-[#DAC5F6] text-[#3A3A3A] font-inter text-lg py-2 px-6 w-[300px] rounded-full border-1 border-[#CAA9F4] focus:outline-none transition"
        >
          Start Conversation
        </button>
      )}
    </div>
  );  
};
