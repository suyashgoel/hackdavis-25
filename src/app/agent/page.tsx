"use client";
import { useState, useRef, useEffect } from "react";
import Navbar from "../components/Navbar";
import { Search } from "lucide-react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [backgroundNoise, setBackgroundNoise] = useState(0);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [sessionHistory, setSessionHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [locationInput, setLocationInput] = useState("");
  const [locationSubmitted, setLocationSubmitted] = useState(false);


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

  // Constants
  const CALIBRATION_TIME = 2000; // Time to measure background noise (ms)
  const MIN_RECORDING_TIME = 1000; // Min recording duration to consider valid (ms)
  const MAX_RECORDING_DURATION = 8000; // Max recording time (ms)
  const SPEECH_THRESHOLD_MULTIPLIER = 2.0; // How much louder than background speech needs to be
  const MIN_SPEECH_VOLUME = 20; // Minimum volume to be considered speech
  const SILENCE_DURATION = 700; // How long silence before stopping (ms)
  const COOLDOWN_DURATION = 1500; // Time between recordings (ms)
  const PROCESSING_TIMEOUT = 15000; // Maximum time to wait for processing (ms)

  // Start the recording process
  const startConversation = async () => {
    try {
      resetAll();
      setStatus("Starting...");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      microphoneStreamRef.current = stream;

      // 🔥 Add 0.5s boot delay AFTER mic access
      setTimeout(() => {
        setupAudioAnalysis(stream);
        setStatus("Calibrating background noise... Please stay silent!"); // 🔥 Important: Tell user not to talk!

        // After 2s calibration, move to listening
        setTimeout(() => {
          if (microphoneStreamRef.current) {
            const samples = volumeHistoryRef.current;
            if (samples.length > 0) {
              samples.sort((a, b) => a - b);
              const backgroundNoiseValue =
                samples[Math.floor(samples.length * 0.25)];
              setBackgroundNoise(Math.round(backgroundNoiseValue));
              console.log("Background noise level:", backgroundNoiseValue);
            } else {
              setBackgroundNoise(10);
            }

            volumeHistoryRef.current = [];
            setStatus("Listening for speech...");
            waitForSpeech();
          }
        }, CALIBRATION_TIME);
      }, 500); // 🔥 0.5s bootup delay
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
        const avgVolume =
          recentSamples.reduce((sum, v) => sum + v, 0) / recentSamples.length;

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
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        console.log("Recorded Blob size:", audioBlob.size);

        if (audioBlob.size < 1000) {
          console.log("Audio blob too small, skipping send");
          setStatus("Recording too short, listening again...");
          startCooldown();
          return;
        }

        console.log(
          `Recording finished: ${recordingTime}ms, size: ${audioBlob.size} bytes`
        );

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
        const avgVolume =
          recentSamples.reduce((sum, v) => sum + v, 0) / recentSamples.length;

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
      const microphone =
        audioContextRef.current.createMediaStreamSource(stream);
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
        const average =
          dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
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
    resetAll();
    setStatus("Conversation ended");
    setIsRecording(false);
    setIsProcessing(false);
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

    audioChunksRef.current = [];
    volumeHistoryRef.current = [];
    speechDetectedRef.current = false;
    setRecordingDuration(0);
    setCooldownActive(false);
  };

  // Send audio to server
  const sendAudioBlob = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("sessionHistory", JSON.stringify(sessionHistory)); // ✅ use real full sessionHistory
      formData.append("location", locationInput);
  
      console.log("Sending audio to server...");
      const response = await fetch("/api/talk", {
        method: "POST",
        body: formData,
      });
  
      if (!response.ok || !response.body) {
        console.error("Failed to get response, status:", response.status);
        return;
      }
  
      if (response.headers.get("X-End-Session") === "true") {
        console.log("Server ended session.");
        endConversation();
      }
  
      // ✅ Step 2: Get full real session history from backend
      const updatedSessionBase64 = response.headers.get("X-Session-History");
      if (updatedSessionBase64) {
        const updatedSessionJson = atob(updatedSessionBase64);
        const updatedSession = JSON.parse(updatedSessionJson);
        setSessionHistory(updatedSession); // 🔥 true updated one
      }
  
      // ✅ Step 3: Stream and play audio
      const reader = response.body.getReader();
      const mediaSource = new MediaSource();
      const audioUrl = URL.createObjectURL(mediaSource);
      const audio = new Audio(audioUrl);
  
      let sourceBuffer: SourceBuffer | null = null;
  
      mediaSource.addEventListener("sourceopen", async () => {
        try {
          sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
  
          const appendBuffer = async (chunk: Uint8Array) => {
            if (!sourceBuffer) return;
            if (sourceBuffer.updating) {
              await new Promise((resolve) =>
                sourceBuffer!.addEventListener("updateend", resolve, { once: true })
              );
            }
            sourceBuffer.appendBuffer(chunk);
          };
  
          const processChunk = async () => {
            const { done, value } = await reader.read();
            if (done) {
              if (sourceBuffer && sourceBuffer.updating) {
                sourceBuffer.addEventListener(
                  "updateend",
                  () => {
                    mediaSource.endOfStream();
                  },
                  { once: true }
                );
              } else {
                mediaSource.endOfStream();
              }
              return;
            }
            if (value && value.length > 0) {
              await appendBuffer(value);
              if (audio.paused) {
                await audio.play();
              }
            }
            processChunk();
          };
  
          processChunk();
        } catch (err) {
          console.error("Error during audio stream:", err);
        }
      });
    } catch (err) {
      console.error("Error sending audio:", err);
      throw err;
    }
  };

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      resetAll();

      // Stop all tracks in the stream
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        microphoneStreamRef.current = null;
      }

      // Clean up audio context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
    };
  }, []);

  // Format time for display
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  // Calculate speech threshold for UI
  const speechThreshold = Math.max(
    backgroundNoise * SPEECH_THRESHOLD_MULTIPLIER,
    MIN_SPEECH_VOLUME
  );

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen">
      <Navbar />
      <img
        src="/bckgrndgrad.png"
        alt="background gradient"
        className="absolute bottom-0 z-0 w-full object-cover"
      />

      <img
        src="/Numaframe1.png"
        alt="Numaframe"
        className="z-10 mb-4 w-140 object-contain"
      />

      {!isRecording && !isProcessing && !locationSubmitted && (
        <div className="z-10 text-black text-4xl font-inter mb-6">
          Hi, how can I help you today?
        </div>
      )}

      <div className="z-10">
        {/* Start button */}
        {!isRecording && !isProcessing && !locationSubmitted && (
          <button
            onClick={startConversation}
            className="bg-[#DAC5F6] text-[#3A3A3A] font-inter text-lg py-2 px-6 w-[300px] rounded-full border border-[#CAA9F4] focus:outline-none transition"
          >
            Start Conversation
          </button>
        )}

        {/* Location Input */}
        {(isRecording || isProcessing) && !locationSubmitted && (
          <div className="flex flex-col items-center space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLocationSubmitted(true);
              }}
              className="relative w-[570px]"
            >
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="Enter location"
                className="bg-[#DAC5F6] text-[#3A3A3A] font-inter text-lg py-2 px-6 pr-12 w-[570px] rounded-full border border-[#CAA9F4] focus:outline-none transition"
              />
              <Search
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                size={20}
              />
            </form>

            <p className="text-gray-600 text-sm">
              Before we get started, would you be comfortable sharing your
              location?
            </p>
            <p className="text-gray-600 text-sm">
              That way, I can offer support and resources that are local to you.
            </p>
          </div>
        )}

        {/* End button */}
        {(isRecording || isProcessing) && locationSubmitted && (
          <button
            onClick={endConversation}
            className="bg-[#DAC5F6] text-[#3A3A3A] font-inter text-lg py-2 px-6 w-[300px] rounded-full border border-[#CAA9F4] focus:outline-none transition"
            disabled={isProcessing}
          >
            End Conversation
          </button>
        )}
      </div>
    </div>
  );
}
