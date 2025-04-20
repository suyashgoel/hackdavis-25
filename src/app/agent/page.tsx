"use client";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResponding, setIsResponding] = useState(false); // Track if AI is currently responding
  const [status, setStatus] = useState("Ready");
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [backgroundNoise, setBackgroundNoise] = useState(0);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const volumeHistoryRef = useRef<number[]>([]);
  const speechDetectedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Reference to current audio player
  const mediaSourceRef = useRef<MediaSource | null>(null); // Reference to current MediaSource
  const responseReaderRef = useRef<ReadableStreamDefaultReader | null>(null); // Reference to stream reader

  // Constants
  const CALIBRATION_TIME = 2000; // Time to measure background noise (ms)
  const MIN_RECORDING_TIME = 500; // Min recording duration to consider valid (ms)
  const MAX_RECORDING_DURATION = 8000; // Max recording time (ms)
  const SPEECH_THRESHOLD_MULTIPLIER = 2.0; // How much louder than background speech needs to be
  const MIN_SPEECH_VOLUME = 20; // Minimum volume to be considered speech
  const SILENCE_DURATION = 1200; // How long silence before stopping (ms)
  const COOLDOWN_DURATION = 1500; // Time between recordings (ms)
  const PROCESSING_TIMEOUT = 15000; // Maximum time to wait for processing (ms)
  const INTERRUPTION_THRESHOLD_MULTIPLIER = 2.5; // Higher threshold for interruption detection

  // Function to terminate current AI response playback
  const terminateCurrentResponse = () => {
    if (isResponding && currentAudioRef.current) {
      console.log("Terminating current response");
      
      // Stop the audio playback
      currentAudioRef.current.pause();
      
      // Close the media source if it exists
      if (mediaSourceRef.current && mediaSourceRef.current.readyState === "open") {
        try {
          mediaSourceRef.current.endOfStream();
        } catch (err) {
          console.error("Error ending media source stream:", err);
        }
      }
      
      // Close the reader if it exists
      if (responseReaderRef.current) {
        try {
          responseReaderRef.current.cancel("User interrupted");
        } catch (err) {
          console.error("Error canceling stream reader:", err);
        }
        responseReaderRef.current = null;
      }
      
      // Clean up references
      currentAudioRef.current = null;
      mediaSourceRef.current = null;
      
      // Update state
      setIsResponding(false);
      setStatus("Response terminated");
      
      // Start listening again after a short cooldown
      startCooldown();
    }
  };

  // Check for interruptions during AI response
  const checkForInterruption = () => {
    if (!isResponding) return;
    
    const interruptionThreshold = Math.max(
      backgroundNoise * INTERRUPTION_THRESHOLD_MULTIPLIER,
      MIN_SPEECH_VOLUME * 1.5
    );
    
    // Get recent volume samples
    const recentSamples = volumeHistoryRef.current.slice(-5);
    
    if (recentSamples.length > 3) { 
      const avgVolume = recentSamples.reduce((sum, v) => sum + v, 0) / recentSamples.length;
      
      // If volume significantly exceeds the threshold, terminate response
      if (avgVolume > interruptionThreshold) {
        console.log("Interruption detected, terminating response");
        terminateCurrentResponse();
        return;
      }
    }
    
    // Continue checking for interruptions
    if (isResponding) {
      setTimeout(checkForInterruption, 100);
    }
  };

  // Start the recording process
  const startConversation = async () => {
    try {
      // Reset all state
      resetAll();
      setStatus("Starting...");
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      microphoneStreamRef.current = stream;
      
      // Begin calibration
      setStatus("Calibrating background noise...");
      setupAudioAnalysis(stream);
      
      // After calibration period, start listening for speech
      setTimeout(() => {
        if (microphoneStreamRef.current) {
          // Calculate background noise from calibration samples
          const samples = volumeHistoryRef.current;
          if (samples.length > 0) {
            // Use the 25th percentile as background noise to avoid outliers
            samples.sort((a, b) => a - b);
            const backgroundNoiseValue = samples[Math.floor(samples.length * 0.25)];
            setBackgroundNoise(Math.round(backgroundNoiseValue));
            console.log("Background noise level:", backgroundNoiseValue);
          } else {
            setBackgroundNoise(10); // Fallback value
          }
          
          // Clear history and prepare for speech detection
          volumeHistoryRef.current = [];
          setStatus("Listening for speech...");
          
          // Start actual recording when speech is detected
          waitForSpeech();
        }
      }, CALIBRATION_TIME);
      
    } catch (err) {
      console.error("Error starting:", err);
      setStatus("Error: Could not access microphone");
    }
  };
  
  // Wait for speech to begin before starting recording
  const waitForSpeech = () => {
    if (!microphoneStreamRef.current) return;
    
    // We're now in listening mode
    setIsRecording(true);
    speechDetectedRef.current = false;
    
    // Check if volume exceeds speech threshold
    const checkForSpeech = () => {
      if (!microphoneStreamRef.current) return;
      
      const speechThreshold = Math.max(
        backgroundNoise * SPEECH_THRESHOLD_MULTIPLIER,
        MIN_SPEECH_VOLUME
      );
      
      // Get recent volume samples
      const recentSamples = volumeHistoryRef.current.slice(-5);
      
      // If we have samples and they exceed the threshold, start recording
      if (recentSamples.length > 3) {
        const avgVolume = recentSamples.reduce((sum, v) => sum + v, 0) / recentSamples.length;
        
        if (avgVolume > speechThreshold && !speechDetectedRef.current) {
          console.log("Speech detected, starting recording");
          speechDetectedRef.current = true;
          startRecording();
        }
      }
      
      // Continue checking if we haven't detected speech yet
      if (!speechDetectedRef.current) {
        setTimeout(checkForSpeech, 100);
      }
    };
    
    checkForSpeech();
  };

  // Start actual recording once speech is detected
  const startRecording = async () => {
    if (!microphoneStreamRef.current) return;
    
    try {
      // Reset for new recording
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      setRecordingDuration(0);
      setStatus("Recording...");
      
      // Start duration timer for UI
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setRecordingDuration(elapsed);
      }, 100);
      
      // Create media recorder
      const mediaRecorder = new MediaRecorder(microphoneStreamRef.current);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        clearInterval(recordingTimerRef.current!);
        
        const recordingTime = Date.now() - startTimeRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        
        console.log(`Recording finished: ${recordingTime}ms, size: ${audioBlob.size} bytes`);
        
        // Only process if recording has minimum length and data
        if (recordingTime > MIN_RECORDING_TIME && audioBlob.size > 1000) {
          await processRecording(audioBlob);
        } else {
          console.log("Recording too short or empty, discarding");
          setStatus("Recording too short, listening again...");
          
          // Start cooldown then listen again
          startCooldown();
        }
      };

      // Set maximum recording duration
      maxDurationTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          console.log("Max duration reached, stopping recording");
          stopRecording();
        }
      }, MAX_RECORDING_DURATION);

      // Start listening for silence to end the recording
      monitorForSilence();
      
      // Start recording
      mediaRecorder.start(100);
      console.log("Media recorder started");
    } catch (err) {
      console.error("Error in startRecording:", err);
      setStatus("Recording error, restarting...");
      startCooldown();
    }
  };

  // Monitor for silence to end recording
  const monitorForSilence = () => {
    if (!mediaRecorderRef.current) return;
    
    const speechThreshold = Math.max(
      backgroundNoise * SPEECH_THRESHOLD_MULTIPLIER,
      MIN_SPEECH_VOLUME
    );
    
    const checkForSilence = () => {
      if (mediaRecorderRef.current?.state !== "recording") return;
      
      // Calculate average of recent volume samples
      const recentSamples = volumeHistoryRef.current.slice(-5);
      
      if (recentSamples.length > 3) {
        const avgVolume = recentSamples.reduce((sum, v) => sum + v, 0) / recentSamples.length;
        
        // If volume dropped below threshold, start silence timer
        if (avgVolume < speechThreshold) {
          if (!silenceTimerRef.current) {
            console.log("Silence detected, starting timer");
            silenceTimerRef.current = setTimeout(() => {
              if (mediaRecorderRef.current?.state === "recording") {
                console.log("Silence period ended, stopping recording");
                stopRecording();
              }
            }, SILENCE_DURATION);
          }
        } else {
          // Reset silence timer if volume goes back up
          clearSilenceTimer();
        }
      }
      
      // Continue checking if still recording
      if (mediaRecorderRef.current?.state === "recording") {
        setTimeout(checkForSilence, 100);
      }
    };
    
    checkForSilence();
  };

  // Process recorded audio
  const processRecording = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setStatus("Processing speech...");
    
    // Set a timeout in case processing hangs
    processingTimeoutRef.current = setTimeout(() => {
      console.log("Processing timeout reached");
      setIsProcessing(false);
      setStatus("Processing timed out, listening again...");
      startCooldown();
    }, PROCESSING_TIMEOUT);
    
    try {
      await sendAudioBlob(audioBlob);
      clearTimeout(processingTimeoutRef.current);
      setIsProcessing(false);
      startCooldown();
    } catch (err) {
      console.error("Error processing recording:", err);
      clearTimeout(processingTimeoutRef.current);
      setIsProcessing(false);
      setStatus("Processing error, listening again...");
      startCooldown();
    }
  };

  // Start a cooldown period before listening again
  const startCooldown = () => {
    setCooldownActive(true);
    setStatus("Cooldown...");
    
    cooldownTimerRef.current = setTimeout(() => {
      setCooldownActive(false);
      
      // If we're still active, start listening again
      if (microphoneStreamRef.current) {
        setStatus("Listening for speech...");
        waitForSpeech();
      }
    }, COOLDOWN_DURATION);
  };

  // Set up audio analysis
  const setupAudioAnalysis = (stream: MediaStream) => {
    try {
      // Initialize AudioContext
      audioContextRef.current = new AudioContext();
      
      // Create analyzer
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.5;
      
      // Connect the microphone to the analyzer
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      microphone.connect(analyserRef.current);
      
      // Start monitoring audio levels
      startVolumeMonitoring();
    } catch (err) {
      console.error("Error setting up audio analysis:", err);
    }
  };

  // Start monitoring volume levels
  const startVolumeMonitoring = () => {
    if (!analyserRef.current) return;
    
    const monitorVolume = () => {
      if (!analyserRef.current) return;
      
      try {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate volume level (average of all frequency data)
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        setVolumeLevel(Math.round(average));
        
        // Add to history
        volumeHistoryRef.current.push(average);
        if (volumeHistoryRef.current.length > 30) {
          volumeHistoryRef.current.shift();
        }
        
        // Continue monitoring if still active
        if (microphoneStreamRef.current) {
          animationFrameRef.current = requestAnimationFrame(monitorVolume);
        }
      } catch (err) {
        console.error("Error monitoring volume:", err);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  };

  // Stop the current recording
  const stopRecording = () => {
    clearSilenceTimer();
    clearMaxDurationTimer();
    
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // End the entire conversation
  const endConversation = () => {
    // First terminate any current response
    terminateCurrentResponse();
    
    // Then reset everything
    resetAll();
    setStatus("Conversation ended");
    setIsRecording(false);
    setIsProcessing(false);
    setIsResponding(false);
  };

  // Clear all timers
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const clearMaxDurationTimer = () => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  };

  const clearCooldownTimer = () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  };

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const clearProcessingTimeout = () => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  };

  // Reset all state and resources
  const resetAll = () => {
    clearSilenceTimer();
    clearMaxDurationTimer();
    clearCooldownTimer();
    clearRecordingTimer();
    clearProcessingTimeout();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    // Terminate any ongoing response
    terminateCurrentResponse();
    
    audioChunksRef.current = [];
    volumeHistoryRef.current = [];
    speechDetectedRef.current = false;
    setRecordingDuration(0);
    setCooldownActive(false);
  };

  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center">Voice Chat</h1>
        
        <div className="flex justify-center mb-4">
          <div className="text-lg font-medium text-center">
            {status}
            {mediaRecorderRef.current?.state === "recording" && (
              <span className="ml-2 text-red-500">{formatTime(recordingDuration)}</span>
            )}
            {isResponding && (
              <span className="ml-2 text-blue-500">(Speak to interrupt)</span>
            )}
          </div>
        </div>
        
        {(isRecording || isProcessing || isResponding) && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
              <div 
                className={`h-3 rounded-full ${
                  isResponding
                    ? volumeLevel > interruptionThreshold ? "bg-red-500" : "bg-blue-500"
                    : volumeLevel > speechThreshold ? "bg-green-500" : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(100, volumeLevel * 2)}%` }}
              ></div>
            </div>
            
            <div className="w-full relative h-6 mb-2">
              {/* Speech threshold marker */}
              <div 
                className="absolute h-full border-l-2 border-red-500"
                style={{ left: `${Math.min(100, speechThreshold * 2)}%` }}
              ></div>
              <div 
                className="absolute text-xs text-red-500 transform -translate-x-1/2"
                style={{ left: `${Math.min(100, speechThreshold * 2)}%`, top: '0px' }}
              >
                Speech threshold
              </div>
              
              {isResponding && (
                <>
                  {/* Interruption threshold marker */}
                  <div 
                    className="absolute h-full border-l-2 border-purple-500"
                    style={{ left: `${Math.min(100, interruptionThreshold * 2)}%` }}
                  ></div>
                  <div 
                    className="absolute text-xs text-purple-500 transform -translate-x-1/2"
                    style={{ left: `${Math.min(100, interruptionThreshold * 2)}%`, top: '0px' }}
                  >
                    Interrupt threshold
                  </div>
                </>
              )}
            </div>
            
            <div className="flex justify-between text-xs text-gray-500">
              <span>Volume: {volumeLevel}</span>
              <span>Background: {backgroundNoise}</span>
              <span>Threshold: {isResponding ? interruptionThreshold : speechThreshold}</span>
            </div>
          </div>
        )}
        
        <div className="flex justify-center mt-4">
          {isRecording || isProcessing || isResponding ? (
            <button
              onClick={endConversation}
              className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition"
            >
              End Conversation
            </button>
          ) : (
            <button
              onClick={startConversation}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition"
            >
              Start Conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}